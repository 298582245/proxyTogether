const Site = require('../models/Site');
const Account = require('../models/Account');
const SystemConfig = require('../models/SystemConfig');
const cacheService = require('../services/cacheService');
const logStatsService = require('../services/logStatsService');
const usageLimitService = require('../services/usageLimitService');
const { get, buildUrl } = require('../utils/http');
const logger = require('../utils/logger');

/**
 * 鏇挎崲URL涓殑鍙傛暟鍗犱綅绗? * @param {string} url - URL妯℃澘
 * @param {object} params - 鍙傛暟瀵硅薄
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
 * 浠嶶RL妯℃澘涓彁鍙栧弬鏁板悕
 * @param {string} url - URL妯℃澘
 * @returns {array} 鍙傛暟鍚嶅垪琛? */
const extractParamNames = (url) => {
  if (!url) return [];
  const params = [];
  // 鍖归厤 {params.xxx} 鏍煎紡
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
 * 妫€鏌ュ搷搴旀槸鍚﹀寘鍚け璐ュ叧閿瘝
 * @param {string} response - 鍝嶅簲鍐呭
 * @param {array} keywords - 澶辫触鍏抽敭璇嶅垪琛? */
const containsFailureKeyword = (response, keywords) => {
  if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
    return false;
  }
  const responseStr = typeof response === 'object' ? JSON.stringify(response) : String(response);
  return keywords.some((keyword) => responseStr.includes(keyword));
};

/**
 * 鑾峰彇璐﹀彿鍙敤浣欓锛堜紭鍏堜粠缂撳瓨鑾峰彇锛? * @param {number} accountId - 璐﹀彿ID
 */
const getAccountAvailableBalance = async (accountId) => {
  // 鍏堜粠缂撳瓨鑾峰彇
  const cachedBalance = await cacheService.getAccountBalance(accountId);
  if (cachedBalance !== null) {
    return cachedBalance;
  }

  // 缂撳瓨涓嶅瓨鍦ㄥ垯浠庢暟鎹簱鑾峰彇
  const account = await Account.findByPk(accountId);
  return account ? parseFloat(account.balance) || 0 : 0;
};

/**
 * 鏋勫缓鎻愬彇閾炬帴
 * @param {object} account - 璐﹀彿瀵硅薄
 * @param {object} site - 缃戠珯瀵硅薄锛堝彲鑳戒负null锛? * @param {number} durationValue - 鏃堕暱鍊硷紙times锛? * @param {string} format - 鏍煎紡鍙傛暟
 */
const buildExtractUrl = (account, site, durationValue, format) => {
  let url = account.extractUrlTemplate || (site ? site.extractUrlTemplate : '');

  if (!url) {
    throw new Error('缂哄皯鎻愬彇閾炬帴妯℃澘');
  }

  // 鏋勫缓鏇挎崲鍙傛暟
  const replaceParams = {
    duration: durationValue,
    times: durationValue,
    format: format,
  };

  if (account.extractParams) {
    const accountParams = typeof account.extractParams === 'string'
      ? JSON.parse(account.extractParams)
      : account.extractParams;
    Object.entries(accountParams).forEach(([key, value]) => {
      replaceParams[key] = value;
      // 鍚屾椂鏀寔 params.xxx 鏍煎紡
      replaceParams[`params.${key}`] = value;
    });
  }

  // 鏇挎崲妯℃澘鍙橀噺
  url = replaceUrlParams(url, replaceParams);

  return url;
};

/**
 * 璁板綍浠ｇ悊鎻愬彇鏃ュ織
 */
const logProxyRequest = async (data) => {
  try {
    await logStatsService.createProxyLog(data);
  } catch (error) {
    logger.error('璁板綍浠ｇ悊鏃ュ織澶辫触:', error);
  }
};

/**
 * 鏍规嵁鏃堕暱鑾峰彇浠锋牸
 * @param {object} site - 缃戠珯瀵硅薄锛堝彲鑳戒负null锛? * @param {object} account - 璐﹀彿瀵硅薄
 * @param {number} durationValue - 鏃堕暱鍊? * @returns {number} 浠锋牸
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
 * 澧炲姞璐﹀彿澶辫触娆℃暟
 * @param {object} account - 璐﹀彿瀵硅薄
 * @param {object} site - 缃戠珯瀵硅薄锛堝彲鑳戒负null锛? */
const incrementFailCount = async (account, site) => {
  const accountId = account.id;
  const accountEntity = await Account.findByPk(accountId);
  if (!accountEntity) return;

  const newFailCount = accountEntity.failCount + 1;

  // 妫€鏌ユ槸鍚︿负鍖呮湀璐﹀彿锛堢嫭绔嬪寘鏈堣处鍙枫€佺綉绔欑被鍨嬩负鍖呮湀 鎴?璐﹀彿鏈夊埌鏈熸椂闂翠笖鏈繃鏈燂級
  const isMonthly = isStandaloneMonthlyAccount(accountEntity) ||
    (site && site.balanceType === 'monthly') ||
    (accountEntity.expireAt && new Date(accountEntity.expireAt) > new Date());

  if (isMonthly) {
    // 鍖呮湀璐﹀彿锛氬彧澧炲姞澶辫触娆℃暟锛屼笉绂佺敤
    await Account.update({ failCount: newFailCount }, { where: { id: accountId } });
    logger.warn(`account disabled after failures: ${accountEntity.name}, count=${newFailCount}`);
  } else {
    // 闈炲寘鏈堣处鍙凤細杈惧埌鏈€澶уけ璐ユ鏁板悗绂佺敤
    const maxFailCount = parseInt(await SystemConfig.getValue('max_fail_count', '3'), 10);

    if (newFailCount >= maxFailCount) {
      await Account.update(
        { failCount: newFailCount, status: 0 },
        { where: { id: accountId } }
      );
      logger.warn(`account disabled after failures: ${accountEntity.name}, count=${newFailCount}`);
    } else {
      await Account.update({ failCount: newFailCount }, { where: { id: accountId } });
    }
  }
};

/**
 * 閲嶇疆璐﹀彿澶辫触娆℃暟
 */
const resetFailCount = async (accountId) => {
  await Account.update({ failCount: 0 }, { where: { id: accountId } });
};

/**
 * 妫€鏌ヨ处鍙锋槸鍚︿负鐙珛鐨勫寘鏈堣处鍙凤紙涓嶅叧鑱旂綉绔欙級
 * @param {object} account - 璐﹀彿瀵硅薄
 */
const isStandaloneMonthlyAccount = (account) => {
  return !account.siteId && account.extractUrlTemplate;
};

/**
 * 妫€鏌ヨ处鍙锋槸鍚︽敮鎸佹寚瀹氭椂闀? * @param {object} site - 缃戠珯瀵硅薄锛堝彲鑳戒负null锛? * @param {object} account - 璐﹀彿瀵硅薄
 * @param {number} durationValue - 鏃堕暱鍊? */
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
 * 妫€鏌ヨ处鍙锋槸鍚︿负鏈夋晥鐨勫寘鏈堣处鍙? * @param {object} account - 璐﹀彿瀵硅薄
 * @param {object} site - 缃戠珯瀵硅薄锛堝彲鑳戒负null锛? */
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
 * 妫€鏌ヨ处鍙锋槸鍚﹁繃鏈燂紙浠呭鍖呮湀璐﹀彿鏈夋晥锛? * @param {object} account - 璐﹀彿瀵硅薄
 * @param {object} site - 缃戠珯瀵硅薄锛堝彲鑳戒负null锛? */
const isAccountExpired = (account, site) => {
  // 闈炲寘鏈堣处鍙蜂笉浼氬洜鏃堕棿杩囨湡
  if (!isMonthlyAccount(account, site)) {
    return false;
  }
  if (account.expireAt) {
    return new Date(account.expireAt) <= new Date();
  }
  // 缃戠珯绫诲瀷涓哄寘鏈堜絾娌℃湁璁剧疆鍒版湡鏃堕棿锛岃涓烘湭杩囨湡
  if (site && site.balanceType === 'monthly') {
    return false;
  }
  // 鐙珛鍖呮湀璐﹀彿娌℃湁璁剧疆鍒版湡鏃堕棿锛岃涓烘湭杩囨湡
  if (isStandaloneMonthlyAccount(account)) {
    return false;
  }
  return false;
};

/**
 * 鑾峰彇浠ｇ悊IP鏍稿績鏂规硶
 * @param {number} durationValue - 鏃堕暱鍊? * @param {string} format - 鏍煎紡鍙傛暟
 * @param {string} clientIp - 瀹㈡埛绔疘P
 * @param {array} triedAccountIds - 宸插皾璇曡繃鐨勮处鍙稩D鍒楄〃
 * @param {string} remark - 澶囨敞锛堝彲閫夛級
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
      ? '\u6240\u6709\u53ef\u7528\u8d26\u53f7\u90fd\u5df2\u5c1d\u8bd5\uff0c\u65e0\u6cd5\u83b7\u53d6\u4ee3\u7406'
      : '\u6ca1\u6709\u53ef\u7528\u8d26\u53f7\u652f\u6301\u8be5\u65f6\u957f\u53c2\u6570\u6216\u8d26\u53f7\u5df2\u8fc7\u671f';

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

    logger.info(`account skipped by usage limit: ${item.account.name}, reason=${reservationResult.reason || 'unknown'}`);
  }

  if (!selectedAccountItem) {
    const limitMessage = '\u6240\u6709\u53ef\u7528\u8d26\u53f7\u90fd\u5df2\u8fbe\u5230\u4f7f\u7528\u9650\u5236';

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

  const siteName = site ? site.name : '\u72ec\u7acb\u5305\u6708';
  logger.info(`selected account: ${account.name}(${siteName}), monthly=${isMonthly}, balance=${balance}, cost=${cost}`);

  const extractUrl = buildExtractUrl(account, site, durationValue, format);
  logger.info(`extract url: ${extractUrl}`);

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
        await SystemConfig.getValue('proxy_failure_keywords', '["\\u4f59\\u989d\\u4e0d\\u8db3","\\u5df2\\u8fc7\\u671f"]')
      );
      failureKeywords = [...failureKeywords, ...defaultKeywords];
    } catch {
      failureKeywords = [...failureKeywords, '\u4f59\u989d\u4e0d\u8db3', '\u5df2\u8fc7\u671f'];
    }

    if (containsFailureKeyword(response, failureKeywords)) {
      logger.warn(`account extract failed by keyword: ${account.name}`);

      await usageLimitService.rollbackUsageCount(account.id, usageReservation);

      await incrementFailCount(account, site);

      await logProxyRequest({
        accountId: account.id,
        siteId: site ? site.id : null,
        clientIp,
        duration: durationValue,
        format,
        success: false,
        cost: 0,
        errorMessage: '\u54cd\u5e94\u5305\u542b\u5931\u8d25\u5173\u952e\u8bcd',
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
      format,
      success: true,
      cost,
      responsePreview,
      remark,
    });

    logger.info(`account extract success: ${account.name}, cost=${cost}`);

    return {
      success: true,
      message: '\u83b7\u53d6\u6210\u529f',
      data: {
        response,
        account: {
          id: account.id,
          name: account.name,
          siteName,
          balance: isMonthly ? '\u5305\u6708' : balance,
          cost,
          isMonthly,
        },
      },
    };
  } catch (error) {
    logger.error(`account extract failed: ${account.name}`, error.message);

    await usageLimitService.rollbackUsageCount(account.id, usageReservation);

    await incrementFailCount(account, site);

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
