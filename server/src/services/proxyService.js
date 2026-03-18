const Site = require('../models/Site');
const Account = require('../models/Account');
const SystemConfig = require('../models/SystemConfig');
const cacheService = require('../services/cacheService');
const logStatsService = require('../services/logStatsService');
const usageLimitService = require('../services/usageLimitService');
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
  Object.entries(params).forEach(([key, value]) => {
    const regex = new RegExp(`\\{params\\.${key}\\}`, 'g');
    result = result.replace(regex, encodeURIComponent(value));
  });
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

const parseConfigArray = (value) => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    try {
      const parsedValue = JSON.parse(value);
      return Array.isArray(parsedValue) ? parsedValue : [];
    } catch {
      return [];
    }
  }

  return [];
};

const getFormatParams = (account, site) => {
  const accountFormatParams = parseConfigArray(account && account.formatParams);
  if (accountFormatParams.length > 0) {
    return accountFormatParams;
  }

  return parseConfigArray(site && site.formatParams);
};

const resolveFormatParam = (account, site, requestedFormat) => {
  const formatParams = getFormatParams(account, site)
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const value = item.value !== undefined && item.value !== null
        ? String(item.value).trim()
        : '';
      if (!value) {
        return null;
      }

      const originalForwardValue = item.oValue !== undefined
        ? item.oValue
        : item.o_value;
      const forwardValue = originalForwardValue !== undefined && originalForwardValue !== null
        ? String(originalForwardValue).trim()
        : '';

      return {
        value,
        matchValue: value.toLowerCase(),
        forwardValue: forwardValue || value,
      };
    })
    .filter(Boolean);

  const formatValue = typeof requestedFormat === 'string' ? requestedFormat.trim().toLowerCase() : '';
  const matchedFormat = formatParams.find((item) => item.matchValue === formatValue);
  if (matchedFormat) {
    return {
      requestFormat: matchedFormat.value,
      forwardFormat: matchedFormat.forwardValue,
    };
  }

  const defaultFormat = formatParams.find((item) => item.matchValue === 'txt');
  if (defaultFormat) {
    return {
      requestFormat: 'txt',
      forwardFormat: defaultFormat.forwardValue,
    };
  }

  return {
    requestFormat: 'txt',
    forwardFormat: 'txt',
  };
};

/**
 * 获取时长参数配置（优先账号，其次网站）
 */
const getDurationParams = (account, site) => {
  const accountDurationParams = parseConfigArray(account && account.durationParams);
  if (accountDurationParams.length > 0) {
    return accountDurationParams;
  }

  return parseConfigArray(site && site.durationParams);
};

/**
 * 解析时长参数，返回请求时长和转发时长
 * @param {object} account - 账号对象
 * @param {object} site - 网站对象
 * @param {number} requestedTimes - 请求的时长（分钟）
 * @returns {object} { requestTimes: 请求时长, forwardTimes: 转发时长 }
 */
const resolveDurationParam = (account, site, requestedTimes) => {
  const durationParams = getDurationParams(account, site)
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const times = parseInt(item.times, 10);
      if (Number.isNaN(times)) {
        return null;
      }

      const originalForwardValue = item.oValue !== undefined
        ? item.oValue
        : item.o_value;
      const forwardTimes = originalForwardValue !== undefined && originalForwardValue !== null
        ? String(originalForwardValue).trim()
        : String(times);

      return {
        times,
        forwardTimes,
      };
    })
    .filter(Boolean);

  const requestedNum = parseInt(requestedTimes, 10);
  const matchedDuration = durationParams.find((item) => item.times === requestedNum);

  if (matchedDuration) {
    return {
      requestTimes: requestedNum,
      forwardTimes: matchedDuration.forwardTimes,
    };
  }

  return {
    requestTimes: requestedNum,
    forwardTimes: String(requestedNum),
  };
};

/**
 * 构建提取链接
 * @param {object} account - 账号对象
 * @param {object} site - 网站对象（可能为null）
 * @param {number} durationValue - 时长值（times）
 * @param {string} format - 格式参数
 */
const buildExtractUrl = (account, site, durationValue, formatValue, resolvedDuration = null) => {
  let url = account.extractUrlTemplate || (site ? site.extractUrlTemplate : '');

  if (!url) {
    throw new Error('缺少提取链接模板');
  }

  // 使用解析后的时长值
  const durationToUse = resolvedDuration
    ? resolvedDuration.forwardTimes
    : String(durationValue);

  // 构建替换参数
  const replaceParams = {
    duration: durationToUse,
    times: durationToUse,
    format: formatValue,
  };

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
    await logStatsService.createProxyLog(data);
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
  const durationNum = parseInt(durationValue, 10);
  if (Number.isNaN(durationNum)) {
    return 0;
  }

  if (!site && account.durationParams) {
    const durationParams = typeof account.durationParams === 'string'
      ? JSON.parse(account.durationParams)
      : account.durationParams;
    if (Array.isArray(durationParams)) {
      const duration = durationParams.find((dp) => parseInt(dp.times, 10) === durationNum);
      return duration ? parseFloat(duration.price) || 0 : 0;
    }
    return 0;
  }
  if (!site || !site.durationParams || !Array.isArray(site.durationParams)) {
    return 0;
  }
  const duration = site.durationParams.find((dp) => parseInt(dp.times, 10) === durationNum);
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
    logger.warn(`包月账号失败次数增加: ${accountEntity.name}, count=${newFailCount}`);
  } else {
    // 非包月账号：达到最大失败次数后禁用
    const maxFailCount = parseInt(await SystemConfig.getValue('max_fail_count', '3'), 10);

    if (newFailCount >= maxFailCount) {
      await Account.update(
        { failCount: newFailCount, status: 0 },
        { where: { id: accountId } }
      );
      logger.warn(`账号因连续失败被禁用: ${accountEntity.name}, count=${newFailCount}`);
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

  if (account.durationParams) {
    const durationParams = typeof account.durationParams === 'string'
      ? JSON.parse(account.durationParams)
      : account.durationParams;
    if (Array.isArray(durationParams) && durationParams.length > 0) {
      return durationParams.some((dp) => parseInt(dp.times, 10) === durationNum);
    }
  }

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
  if (isStandaloneMonthlyAccount(account)) {
    return true;
  }
  if (site && site.balanceType === 'monthly') {
    return true;
  }
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
 * @param {string} remark - 备注（可选）
 */
const getProxy = async (durationValue, format, clientIp, triedAccountIds = [], remark = null) => {
  const { Op } = require('sequelize');

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
        required: false,
      },
    ],
  });

  const availableAccounts = accounts.filter((account) => {
    const site = account.site;

    if (!site && account.extractUrlTemplate) {
      if (!isDurationSupported(null, account, durationValue)) {
        return false;
      }
      if (isAccountExpired(account, null)) {
        return false;
      }
      return true;
    }

    if (site) {
      if (!isDurationSupported(site, account, durationValue)) {
        return false;
      }
      if (isAccountExpired(account, site)) {
        return false;
      }
      return true;
    }

    return false;
  });

  if (availableAccounts.length === 0) {
    const noAccountMessage = triedAccountIds.length > 0
      ? '所有可用账号都已尝试，无法获取代理'
      : '没有可用账号支持该时长参数或账号已过期';

    await logProxyRequest({
      accountId: null,
      siteId: null,
      clientIp,
      duration: durationValue,
      format,
      success: false,
      cost: 0,
      errorMessage: noAccountMessage,
      responsePreview: null,
      remark,
    });

    return {
      success: false,
      message: noAccountMessage,
      data: null,
    };
  }

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

  monthlyAccounts.sort((a, b) => {
    const aExpire = a.account.expireAt ? new Date(a.account.expireAt).getTime() : Infinity;
    const bExpire = b.account.expireAt ? new Date(b.account.expireAt).getTime() : Infinity;
    return aExpire - bExpire;
  });

  balanceAccounts.sort((a, b) => b.balance - a.balance);

  const accountsWithBalance = [...monthlyAccounts, ...balanceAccounts];
  let selectedAccountItem = null;
  let usageReservation = null;

  for (const item of accountsWithBalance) {
    const reservationResult = await usageLimitService.reserveUsageCount(item.account.id);
    if (reservationResult.reserved) {
      selectedAccountItem = item;
      usageReservation = reservationResult;
      break;
    }

    logger.info(`账号因使用限制跳过: ${item.account.name}, reason=${reservationResult.reason || 'unknown'}`);
  }

  if (!selectedAccountItem) {
    const limitMessage = '所有可用账号都已达到使用限制';

    await logProxyRequest({
      accountId: null,
      siteId: null,
      clientIp,
      duration: durationValue,
      format,
      success: false,
      cost: 0,
      errorMessage: limitMessage,
      responsePreview: null,
      remark,
    });

    return {
      success: false,
      message: limitMessage,
      data: null,
    };
  }

  const { account, balance, site } = selectedAccountItem;
  const isMonthly = isMonthlyAccount(account, site);
  const cost = isMonthly ? 0 : getDurationPrice(site, account, durationValue);
  const resolvedFormat = resolveFormatParam(account, site, format);
  const resolvedDuration = resolveDurationParam(account, site, durationValue);

  const siteName = site ? site.name : '独立包月';
  logger.info(`选中账号: ${account.name}(${siteName}), monthly=${isMonthly}, balance=${balance}, cost=${cost}, format=${resolvedFormat.requestFormat}, forwardFormat=${resolvedFormat.forwardFormat}, times=${resolvedDuration.requestTimes}, forwardTimes=${resolvedDuration.forwardTimes}`);

  const extractUrl = buildExtractUrl(account, site, durationValue, resolvedFormat.forwardFormat, resolvedDuration);
  logger.info(`提取链接: ${extractUrl}`);

  try {
    const response = await get(extractUrl);
    const responseStr = typeof response === 'object' ? JSON.stringify(response) : String(response);
    const responsePreview = responseStr.substring(0, 500);

    let failureKeywords = [];
    if (account.failureKeywords && Array.isArray(account.failureKeywords)) {
      failureKeywords = [...account.failureKeywords];
    }
    if (site && site.failureKeywords) {
      failureKeywords = [...failureKeywords, ...site.failureKeywords];
    }

    try {
      const defaultKeywords = JSON.parse(
        await SystemConfig.getValue('proxy_failure_keywords', '["余额不足","已过期"]')
      );
      failureKeywords = [...failureKeywords, ...defaultKeywords];
    } catch {
      failureKeywords = [...failureKeywords, '余额不足', '已过期'];
    }

    if (containsFailureKeyword(response, failureKeywords)) {
      logger.warn(`账号提取失败(关键词匹配): ${account.name}`);

      await usageLimitService.rollbackUsageCount(account.id, usageReservation);

      await incrementFailCount(account, site);

      await logProxyRequest({
        accountId: account.id,
        siteId: site ? site.id : null,
        clientIp,
        duration: durationValue,
        format: resolvedFormat.requestFormat,
        success: false,
        cost: 0,
        errorMessage: '响应包含失败关键词',
        responsePreview,
        remark,
      });

      return getProxy(durationValue, format, clientIp, [...triedAccountIds, account.id], remark);
    }

    await resetFailCount(account.id);
    await usageLimitService.confirmUsageCount(account.id, usageReservation);

    await logProxyRequest({
      accountId: account.id,
      siteId: site ? site.id : null,
      clientIp,
      duration: durationValue,
      format: resolvedFormat.requestFormat,
      success: true,
      cost,
      responsePreview,
      remark,
    });

    logger.info(`账号提取成功: ${account.name}, cost=${cost}`);

    return {
      success: true,
      message: '获取成功',
      data: {
        response,
        account: {
          id: account.id,
          name: account.name,
          siteName,
          balance: isMonthly ? '包月' : balance,
          cost,
          isMonthly,
        },
      },
    };
  } catch (error) {
    logger.error(`账号提取失败: ${account.name}`, error.message);

    await usageLimitService.rollbackUsageCount(account.id, usageReservation);

    await incrementFailCount(account, site);

    await logProxyRequest({
      accountId: account.id,
      siteId: site ? site.id : null,
      clientIp,
      duration: durationValue,
      format: resolvedFormat.requestFormat,
      success: false,
      cost: 0,
      errorMessage: error.message,
      responsePreview: null,
      remark,
    });

    return getProxy(durationValue, format, clientIp, [...triedAccountIds, account.id], remark);
  }
};

module.exports = {
  getProxy,
  buildExtractUrl,
  extractParamNames,
  isDurationSupported,
  getDurationPrice,
};
