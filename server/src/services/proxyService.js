const Site = require('../models/Site');
const Account = require('../models/Account');
const SystemConfig = require('../models/SystemConfig');
const ProxyLog = require('../models/ProxyLog');
const cacheService = require('../services/cacheService');
const { get, buildUrl } = require('../utils/http');
const logger = require('../utils/logger');

/**
 * 替换模板中的变量
 * @param {string} template - URL模板
 * @param {object} params - 参数对象
 */
const replaceTemplateVars = (template, params) => {
  if (!template) return template;
  let result = template;
  Object.entries(params).forEach(([key, value]) => {
    // 支持 {key} 格式的变量替换
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    result = result.replace(regex, value);
  });
  return result;
};

/**
 * 检查响应是否包含失败关键词
 * @param {string} response - 响应内容
 * @param {array} keywords - 失败关键词列表
 */
const containsFailureKeyword = (response, keywords) => {
  if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
    return false;
  }
  const responseStr = typeof response === 'object' ? JSON.stringify(response) : String(response);
  return keywords.some((keyword) => responseStr.includes(keyword));
};

/**
 * 获取账号可用余额（优先从缓存获取）
 * @param {number} accountId - 账号ID
 */
const getAccountAvailableBalance = async (accountId) => {
  // 先从缓存获取
  const cachedBalance = await cacheService.getAccountBalance(accountId);
  if (cachedBalance !== null) {
    return cachedBalance;
  }

  // 缓存不存在则从数据库获取
  const account = await Account.findByPk(accountId);
  return account ? parseFloat(account.balance) || 0 : 0;
};

/**
 * 选择最优账号
 * @param {number} durationType - 时长类型
 */
const selectBestAccount = async (durationType) => {
  // 获取所有启用的账号，按余额降序
  const accounts = await Account.findAll({
    where: { status: 1 },
    include: [
      {
        model: Site,
        as: 'site',
        where: { status: 1 },
        required: true,
      },
    ],
    order: [['balance', 'DESC']],
  });

  // 过滤支持该时长的账号
  const availableAccounts = accounts.filter((account) => {
    const site = account.site;
    if (!site || !site.durationParams) return false;

    // 检查是否支持该时长参数
    const durationParams = site.durationParams;
    if (Array.isArray(durationParams)) {
      return durationParams.some((dp) => dp.type === durationType);
    }
    return false;
  });

  if (availableAccounts.length === 0) {
    return null;
  }

  // 获取所有余额并排序
  const accountsWithBalance = await Promise.all(
    availableAccounts.map(async (account) => {
      const balance = await getAccountAvailableBalance(account.id);
      return { account, balance };
    })
  );

  // 按余额降序排序
  accountsWithBalance.sort((a, b) => b.balance - a.balance);

  return accountsWithBalance[0].account;
};

/**
 * 构建提取链接
 * @param {object} account - 账号对象
 * @param {object} site - 网站对象
 * @param {number} durationType - 时长类型
 * @param {string} format - 格式参数
 */
const buildExtractUrl = (account, site, durationType, format) => {
  let url = site.extractUrlTemplate;

  // 查找对应的时长参数配置
  const durationParams = site.durationParams || [];
  const durationConfig = durationParams.find((dp) => dp.type === durationType);

  // 构建替换参数
  const replaceParams = {
    duration: durationConfig ? durationConfig.times : durationType,
    format: format,
  };

  // 合并账号特有参数
  if (account.extractParams) {
    Object.entries(account.extractParams).forEach(([key, value]) => {
      replaceParams[key] = value;
    });
  }

  // 替换模板变量
  url = replaceTemplateVars(url, replaceParams);

  return url;
};

/**
 * 记录代理提取日志
 */
const logProxyRequest = async (data) => {
  try {
    await ProxyLog.create({
      accountId: data.accountId,
      siteId: data.siteId,
      clientIp: data.clientIp,
      duration: data.duration,
      format: data.format,
      success: data.success ? 1 : 0,
      errorMessage: data.errorMessage,
      responsePreview: data.responsePreview,
    });
  } catch (error) {
    logger.error('记录代理日志失败:', error);
  }
};

/**
 * 增加账号失败次数
 */
const incrementFailCount = async (accountId) => {
  const account = await Account.findByPk(accountId);
  if (!account) return;

  const newFailCount = account.failCount + 1;
  const maxFailCount = parseInt(await SystemConfig.getValue('max_fail_count', '3'), 10);

  if (newFailCount >= maxFailCount) {
    // 达到最大失败次数，禁用账号
    await Account.update(
      { failCount: newFailCount, status: 0 },
      { where: { id: accountId } }
    );
    logger.warn(`账号 ${account.name} 连续失败 ${newFailCount} 次，已自动禁用`);
  } else {
    await Account.update({ failCount: newFailCount }, { where: { id: accountId } });
  }
};

/**
 * 重置账号失败次数
 */
const resetFailCount = async (accountId) => {
  await Account.update({ failCount: 0 }, { where: { id: accountId } });
};

/**
 * 获取代理IP核心方法
 * @param {number} durationType - 时长类型
 * @param {string} format - 格式参数
 * @param {string} clientIp - 客户端IP
 * @param {array} triedAccountIds - 已尝试过的账号ID列表
 */
const getProxy = async (durationType, format, clientIp, triedAccountIds = []) => {
  // 获取所有启用的账号
  const accounts = await Account.findAll({
    where: {
      status: 1,
      id: { [require('sequelize').Op.notIn]: triedAccountIds },
    },
    include: [
      {
        model: Site,
        as: 'site',
        where: { status: 1 },
        required: true,
      },
    ],
  });

  // 过滤支持该时长的账号
  const availableAccounts = accounts.filter((account) => {
    const site = account.site;
    if (!site || !site.durationParams) return false;
    const durationParams = site.durationParams;
    if (Array.isArray(durationParams)) {
      return durationParams.some((dp) => dp.type === durationType);
    }
    return false;
  });

  if (availableAccounts.length === 0) {
    return {
      success: false,
      message: triedAccountIds.length > 0 ? '所有可用账号都已尝试，无法获取代理' : '没有可用账号支持该时长参数',
      data: null,
    };
  }

  // 获取所有余额并排序
  const accountsWithBalance = await Promise.all(
    availableAccounts.map(async (account) => {
      const balance = await getAccountAvailableBalance(account.id);
      return { account, balance };
    })
  );

  // 按余额降序排序
  accountsWithBalance.sort((a, b) => b.balance - a.balance);

  // 选择余额最高的账号
  const { account, balance } = accountsWithBalance[0];
  const site = account.site;

  logger.info(`选择账号 ${account.name}(${site.name})，余额: ${balance}`);

  // 构建提取链接
  const extractUrl = buildExtractUrl(account, site, durationType, format);
  logger.info(`提取链接: ${extractUrl}`);

  try {
    // 请求提取链接
    const response = await get(extractUrl);
    const responseStr = typeof response === 'object' ? JSON.stringify(response) : String(response);
    const responsePreview = responseStr.substring(0, 500);

    // 获取失败关键词（网站配置 + 系统配置）
    let failureKeywords = site.failureKeywords || [];
    const defaultKeywords = JSON.parse(await SystemConfig.getValue('proxy_failure_keywords', '["余额不足","已过期"]'));
    failureKeywords = [...failureKeywords, ...defaultKeywords];

    // 检查是否包含失败关键词
    if (containsFailureKeyword(response, failureKeywords)) {
      logger.warn(`账号 ${account.name} 提取失败，响应包含失败关键词`);

      // 增加失败次数
      await incrementFailCount(account.id);

      // 记录日志
      await logProxyRequest({
        accountId: account.id,
        siteId: site.id,
        clientIp,
        duration: durationType,
        format,
        success: false,
        errorMessage: '响应包含失败关键词',
        responsePreview,
      });

      // 递归尝试下一个账号
      return getProxy(durationType, format, clientIp, [...triedAccountIds, account.id]);
    }

    // 成功，重置失败次数
    await resetFailCount(account.id);

    // 记录成功日志
    await logProxyRequest({
      accountId: account.id,
      siteId: site.id,
      clientIp,
      duration: durationType,
      format,
      success: true,
      responsePreview,
    });

    logger.info(`账号 ${account.name} 提取成功`);

    return {
      success: true,
      message: '获取成功',
      data: {
        response,
        account: {
          id: account.id,
          name: account.name,
          siteName: site.name,
          balance,
        },
      },
    };
  } catch (error) {
    logger.error(`账号 ${account.name} 提取失败:`, error.message);

    // 增加失败次数
    await incrementFailCount(account.id);

    // 记录失败日志
    await logProxyRequest({
      accountId: account.id,
      siteId: site.id,
      clientIp,
      duration: durationType,
      format,
      success: false,
      errorMessage: error.message,
      responsePreview: null,
    });

    // 递归尝试下一个账号
    return getProxy(durationType, format, clientIp, [...triedAccountIds, account.id]);
  }
};

module.exports = {
  getProxy,
  buildExtractUrl,
  selectBestAccount,
};
