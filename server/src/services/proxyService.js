const Site = require('../models/Site');
const Account = require('../models/Account');
const SystemConfig = require('../models/SystemConfig');
const ProxyLog = require('../models/ProxyLog');
const cacheService = require('../services/cacheService');
const { get, buildUrl } = require('../utils/http');
const logger = require('../utils/logger');

/**
 * 替换URL中的参数占位符
 * @param {string} url - URL模板
 * @param {object} params - 参数对象
 */
const replaceUrlParams = (url, params) => {
  if (!url || !params) return url;
  let result = url;
  // 替换 {params.xxx} 格式的参数
  Object.entries(params).forEach(([key, value]) => {
    const regex = new RegExp(`\\{params\\.${key}\\}`, 'g');
    result = result.replace(regex, encodeURIComponent(value));
  });
  // 替换 {xxx} 格式的参数（非 params 前缀）
  Object.entries(params).forEach(([key, value]) => {
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    result = result.replace(regex, encodeURIComponent(value));
  });
  return result;
};

/**
 * 从URL模板中提取参数名
 * @param {string} url - URL模板
 * @returns {array} 参数名列表
 */
const extractParamNames = (url) => {
  if (!url) return [];
  const params = [];
  // 匹配 {params.xxx} 格式
  const paramsRegex = /\{params\.(\w+)\}/g;
  let match;
  while ((match = paramsRegex.exec(url)) !== null) {
    if (!params.includes(match[1])) {
      params.push(match[1]);
    }
  }
  // 匹配 {xxx} 格式（排除 duration, format）
  const simpleRegex = /\{(\w+)\}/g;
  while ((match = simpleRegex.exec(url)) !== null) {
    if (!['duration', 'format', 'times'].includes(match[1]) && !params.includes(match[1])) {
      params.push(match[1]);
    }
  }
  return params;
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
 * 构建提取链接
 * @param {object} account - 账号对象
 * @param {object} site - 网站对象
 * @param {number} durationValue - 时长值（times）
 * @param {string} format - 格式参数
 */
const buildExtractUrl = (account, site, durationValue, format) => {
  let url = site.extractUrlTemplate;

  // 构建替换参数
  const replaceParams = {
    duration: durationValue,
    times: durationValue,
    format: format,
  };

  // 合并账号特有参数（支持 params.xxx 格式）
  if (account.extractParams) {
    const accountParams = typeof account.extractParams === 'string'
      ? JSON.parse(account.extractParams)
      : account.extractParams;
    Object.entries(accountParams).forEach(([key, value]) => {
      replaceParams[key] = value;
      // 同时支持 params.xxx 格式
      replaceParams[`params.${key}`] = value;
    });
  }

  // 替换模板变量
  url = replaceUrlParams(url, replaceParams);

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
      cost: data.cost || 0,
      errorMessage: data.errorMessage,
      responsePreview: data.responsePreview,
    });
  } catch (error) {
    logger.error('记录代理日志失败:', error);
  }
};

/**
 * 根据时长获取价格
 * @param {object} site - 网站对象
 * @param {number} durationValue - 时长值
 * @returns {number} 价格
 */
const getDurationPrice = (site, durationValue) => {
  if (!site.durationParams || !Array.isArray(site.durationParams)) {
    return 0;
  }
  const duration = site.durationParams.find((dp) => dp.times === durationValue);
  return duration ? parseFloat(duration.price) || 0 : 0;
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
 * 检查账号是否支持指定时长
 * @param {object} site - 网站对象
 * @param {number} durationValue - 时长值
 */
const isDurationSupported = (site, durationValue) => {
  if (!site.durationParams || !Array.isArray(site.durationParams)) {
    return false;
  }
  return site.durationParams.some((dp) => dp.times === durationValue);
};

/**
 * 获取代理IP核心方法
 * @param {number} durationValue - 时长值
 * @param {string} format - 格式参数
 * @param {string} clientIp - 客户端IP
 * @param {array} triedAccountIds - 已尝试过的账号ID列表
 */
const getProxy = async (durationValue, format, clientIp, triedAccountIds = []) => {
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
    return isDurationSupported(site, durationValue);
  });

  if (availableAccounts.length === 0) {
    // 记录无可用账号的日志
    await logProxyRequest({
      accountId: null,
      siteId: null,
      clientIp,
      duration: durationValue,
      format,
      success: false,
      cost: 0,
      errorMessage: triedAccountIds.length > 0 ? '所有可用账号都已尝试，无法获取代理' : '没有可用账号支持该时长参数',
      responsePreview: null,
    });

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

  // 计算消费金额
  const cost = getDurationPrice(site, durationValue);

  logger.info(`选择账号 ${account.name}(${site.name})，余额: ${balance}，预计消费: ${cost}`);

  // 构建提取链接
  const extractUrl = buildExtractUrl(account, site, durationValue, format);
  logger.info(`提取链接: ${extractUrl}`);

  try {
    // 请求提取链接
    const response = await get(extractUrl);
    const responseStr = typeof response === 'object' ? JSON.stringify(response) : String(response);
    const responsePreview = responseStr.substring(0, 500);

    // 获取失败关键词（网站配置 + 系统配置）
    let failureKeywords = site.failureKeywords || [];
    try {
      const defaultKeywords = JSON.parse(await SystemConfig.getValue('proxy_failure_keywords', '["余额不足","已过期"]'));
      failureKeywords = [...failureKeywords, ...defaultKeywords];
    } catch {
      failureKeywords = [...failureKeywords, '余额不足', '已过期'];
    }

    // 检查是否包含失败关键词
    if (containsFailureKeyword(response, failureKeywords)) {
      logger.warn(`账号 ${account.name} 提取失败，响应包含失败关键词`);

      // 增加失败次数
      await incrementFailCount(account.id);

      // 记录日志（失败不扣费）
      await logProxyRequest({
        accountId: account.id,
        siteId: site.id,
        clientIp,
        duration: durationValue,
        format,
        success: false,
        cost: 0,
        errorMessage: '响应包含失败关键词',
        responsePreview,
      });

      // 递归尝试下一个账号
      return getProxy(durationValue, format, clientIp, [...triedAccountIds, account.id]);
    }

    // 成功，重置失败次数
    await resetFailCount(account.id);

    // 记录成功日志（包含消费金额）
    await logProxyRequest({
      accountId: account.id,
      siteId: site.id,
      clientIp,
      duration: durationValue,
      format,
      success: true,
      cost: cost,
      responsePreview,
    });

    logger.info(`账号 ${account.name} 提取成功，消费: ${cost}`);

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
          cost,
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
      duration: durationValue,
      format,
      success: false,
      cost: 0,
      errorMessage: error.message,
      responsePreview: null,
    });

    // 递归尝试下一个账号
    return getProxy(durationValue, format, clientIp, [...triedAccountIds, account.id]);
  }
};

module.exports = {
  getProxy,
  buildExtractUrl,
  extractParamNames,
  isDurationSupported,
  getDurationPrice,
};
