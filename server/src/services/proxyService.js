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
 * @param {object} site - 网站对象（可能为null）
 * @param {number} durationValue - 时长值（times）
 * @param {string} format - 格式参数
 */
const buildExtractUrl = (account, site, durationValue, format) => {
  // 优先使用账号自己的提取链接模板（独立包月账号）
  let url = account.extractUrlTemplate || (site ? site.extractUrlTemplate : '');

  if (!url) {
    throw new Error('缺少提取链接模板');
  }

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
 * @param {object} site - 网站对象（可能为null）
 * @param {object} account - 账号对象
 * @param {number} durationValue - 时长值
 * @returns {number} 价格
 */
const getDurationPrice = (site, account, durationValue) => {
  // 独立包月账号使用自己的时长参数
  if (!site && account.durationParams) {
    const durationParams = typeof account.durationParams === 'string'
      ? JSON.parse(account.durationParams)
      : account.durationParams;
    if (Array.isArray(durationParams)) {
      const duration = durationParams.find((dp) => dp.times === durationValue);
      return duration ? parseFloat(duration.price) || 0 : 0;
    }
    return 0;
  }
  // 网站账号使用网站的时长参数
  if (!site || !site.durationParams || !Array.isArray(site.durationParams)) {
    return 0;
  }
  const duration = site.durationParams.find((dp) => dp.times === durationValue);
  return duration ? parseFloat(duration.price) || 0 : 0;
};

/**
 * 增加账号失败次数
 * @param {object} account - 账号对象
 * @param {object} site - 网站对象（可能为null）
 */
const incrementFailCount = async (account, site) => {
  const accountId = account.id;
  const accountEntity = await Account.findByPk(accountId);
  if (!accountEntity) return;

  const newFailCount = accountEntity.failCount + 1;

  // 检查是否为包月账号（独立包月账号、网站类型为包月 或 账号有到期时间且未过期）
  const isMonthly = isStandaloneMonthlyAccount(accountEntity) ||
    (site && site.balanceType === 'monthly') ||
    (accountEntity.expireAt && new Date(accountEntity.expireAt) > new Date());

  if (isMonthly) {
    // 包月账号：只增加失败次数，不禁用
    await Account.update({ failCount: newFailCount }, { where: { id: accountId } });
    logger.warn(`包月账号 ${accountEntity.name} 连续失败 ${newFailCount} 次（不会自动禁用）`);
  } else {
    // 非包月账号：达到最大失败次数后禁用
    const maxFailCount = parseInt(await SystemConfig.getValue('max_fail_count', '3'), 10);

    if (newFailCount >= maxFailCount) {
      await Account.update(
        { failCount: newFailCount, status: 0 },
        { where: { id: accountId } }
      );
      logger.warn(`账号 ${accountEntity.name} 连续失败 ${newFailCount} 次，已自动禁用`);
    } else {
      await Account.update({ failCount: newFailCount }, { where: { id: accountId } });
    }
  }
};

/**
 * 重置账号失败次数
 */
const resetFailCount = async (accountId) => {
  await Account.update({ failCount: 0 }, { where: { id: accountId } });
};

/**
 * 检查账号是否为独立的包月账号（不关联网站）
 * @param {object} account - 账号对象
 */
const isStandaloneMonthlyAccount = (account) => {
  // 没有关联网站，且有提取链接模板
  return !account.siteId && account.extractUrlTemplate;
};

/**
 * 检查账号是否支持指定时长
 * @param {object} site - 网站对象（可能为null）
 * @param {object} account - 账号对象
 * @param {number} durationValue - 时长值
 */
const isDurationSupported = (site, account, durationValue) => {
  const durationNum = parseInt(durationValue, 10);

  // 独立包月账号（没有关联网站）使用自己的时长参数
  if (!site) {
    if (account.durationParams) {
      const durationParams = typeof account.durationParams === 'string'
        ? JSON.parse(account.durationParams)
        : account.durationParams;
      if (Array.isArray(durationParams)) {
        return durationParams.some((dp) => parseInt(dp.times, 10) === durationNum);
      }
    }
    return false;
  }

  // 关联网站的账号：优先使用账号自己的时长参数，否则使用网站的
  if (account.durationParams) {
    const durationParams = typeof account.durationParams === 'string'
      ? JSON.parse(account.durationParams)
      : account.durationParams;
    if (Array.isArray(durationParams) && durationParams.length > 0) {
      return durationParams.some((dp) => parseInt(dp.times, 10) === durationNum);
    }
  }

  // 使用网站的时长参数
  if (site.durationParams && Array.isArray(site.durationParams)) {
    return site.durationParams.some((dp) => parseInt(dp.times, 10) === durationNum);
  }

  return false;
};

/**
 * 检查账号是否为有效的包月账号
 * @param {object} account - 账号对象
 * @param {object} site - 网站对象（可能为null）
 */
const isMonthlyAccount = (account, site) => {
  // 独立包月账号（不关联网站）
  if (isStandaloneMonthlyAccount(account)) {
    return true;
  }
  // 网站类型为包月
  if (site && site.balanceType === 'monthly') {
    return true;
  }
  // 账号设置了到期时间且未过期
  if (account.expireAt && new Date(account.expireAt) > new Date()) {
    return true;
  }
  return false;
};

/**
 * 检查账号是否过期（仅对包月账号有效）
 * @param {object} account - 账号对象
 * @param {object} site - 网站对象（可能为null）
 */
const isAccountExpired = (account, site) => {
  // 非包月账号不会因时间过期
  if (!isMonthlyAccount(account, site)) {
    return false;
  }
  // 检查账号到期时间
  if (account.expireAt) {
    return new Date(account.expireAt) <= new Date();
  }
  // 网站类型为包月但没有设置到期时间，视为未过期
  if (site && site.balanceType === 'monthly') {
    return false;
  }
  // 独立包月账号没有设置到期时间，视为未过期
  if (isStandaloneMonthlyAccount(account)) {
    return false;
  }
  return false;
};

/**
 * 获取代理IP核心方法
 * @param {number} durationValue - 时长值
 * @param {string} format - 格式参数
 * @param {string} clientIp - 客户端IP
 * @param {array} triedAccountIds - 已尝试过的账号ID列表
 */
const getProxy = async (durationValue, format, clientIp, triedAccountIds = []) => {
  const { Op } = require('sequelize');

  // 获取所有启用的账号（包括独立包月账号）
  const accounts = await Account.findAll({
    where: {
      status: 1,
      id: { [Op.notIn]: triedAccountIds },
    },
    include: [
      {
        model: Site,
        as: 'site',
        where: { status: 1 },
        required: false, // 允许不关联网站（独立包月账号）
      },
    ],
  });

  // 过滤支持该时长且未过期的账号
  const availableAccounts = accounts.filter((account) => {
    const site = account.site;
    // 独立包月账号
    if (!site && account.extractUrlTemplate) {
      // 检查是否支持该时长
      if (!isDurationSupported(null, account, durationValue)) {
        return false;
      }
      // 检查是否过期
      if (isAccountExpired(account, null)) {
        return false;
      }
      return true;
    }
    // 网站账号
    if (site) {
      // 检查是否支持该时长
      if (!isDurationSupported(site, account, durationValue)) {
        return false;
      }
      // 检查是否过期
      if (isAccountExpired(account, site)) {
        return false;
      }
      return true;
    }
    return false;
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
      errorMessage: triedAccountIds.length > 0 ? '所有可用账号都已尝试，无法获取代理' : '没有可用账号支持该时长参数或账号已过期',
      responsePreview: null,
    });

    return {
      success: false,
      message: triedAccountIds.length > 0 ? '所有可用账号都已尝试，无法获取代理' : '没有可用账号支持该时长参数或账号已过期',
      data: null,
    };
  }

  // 分离包月账号和非包月账号
  const monthlyAccounts = [];
  const balanceAccounts = [];

  for (const account of availableAccounts) {
    const site = account.site;
    const balance = await getAccountAvailableBalance(account.id);

    if (isMonthlyAccount(account, site)) {
      monthlyAccounts.push({ account, balance, site });
    } else {
      balanceAccounts.push({ account, balance, site });
    }
  }

  // 包月账号按到期时间排序（越快到期的越先使用）
  monthlyAccounts.sort((a, b) => {
    const aExpire = a.account.expireAt ? new Date(a.account.expireAt).getTime() : Infinity;
    const bExpire = b.account.expireAt ? new Date(b.account.expireAt).getTime() : Infinity;
    return aExpire - bExpire;
  });

  // 非包月账号按余额降序排序
  balanceAccounts.sort((a, b) => b.balance - a.balance);

  // 合并：包月账号优先，然后是余额账号
  const accountsWithBalance = [...monthlyAccounts, ...balanceAccounts];

  // 选择第一个账号
  const { account, balance, site } = accountsWithBalance[0];
  const isMonthly = isMonthlyAccount(account, site);

  // 计算消费金额（包月账号不扣费）
  const cost = isMonthly ? 0 : getDurationPrice(site, account, durationValue);

  const siteName = site ? site.name : '独立包月';
  logger.info(`选择账号 ${account.name}(${siteName})，${isMonthly ? '包月账号' : `余额: ${balance}`}，预计消费: ${cost}`);

  // 构建提取链接
  const extractUrl = buildExtractUrl(account, site, durationValue, format);
  logger.info(`提取链接: ${extractUrl}`);

  try {
    // 请求提取链接
    const response = await get(extractUrl);
    const responseStr = typeof response === 'object' ? JSON.stringify(response) : String(response);
    const responsePreview = responseStr.substring(0, 500);

    // 获取失败关键词（网站配置 + 账号配置 + 系统配置）
    let failureKeywords = [];
    // 独立包月账号使用自己的失败关键词
    if (account.failureKeywords && Array.isArray(account.failureKeywords)) {
      failureKeywords = [...account.failureKeywords];
    }
    // 网站配置的失败关键词
    if (site && site.failureKeywords) {
      failureKeywords = [...failureKeywords, ...site.failureKeywords];
    }
    // 系统默认失败关键词
    try {
      const defaultKeywords = JSON.parse(await SystemConfig.getValue('proxy_failure_keywords', '["余额不足","已过期"]'));
      failureKeywords = [...failureKeywords, ...defaultKeywords];
    } catch {
      failureKeywords = [...failureKeywords, '余额不足', '已过期'];
    }

    // 检查是否包含失败关键词
    if (containsFailureKeyword(response, failureKeywords)) {
      logger.warn(`账号 ${account.name} 提取失败，响应包含失败关键词`);

      // 增加失败次数（包月账号不会被禁用）
      await incrementFailCount(account, site);

      // 记录日志（失败不扣费）
      await logProxyRequest({
        accountId: account.id,
        siteId: site ? site.id : null,
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
      siteId: site ? site.id : null,
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
          siteName: siteName,
          balance: isMonthly ? '包月' : balance,
          cost,
          isMonthly,
        },
      },
    };
  } catch (error) {
    logger.error(`账号 ${account.name} 提取失败:`, error.message);

    // 增加失败次数（包月账号不会被禁用）
    await incrementFailCount(account, site);

    // 记录失败日志
    await logProxyRequest({
      accountId: account.id,
      siteId: site ? site.id : null,
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
