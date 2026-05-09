const crypto = require('crypto');
const { Op, QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const Account = require('../models/Account');
const Site = require('../models/Site');
const ProxyLog = require('../models/ProxyLog');
const SystemConfig = require('../models/SystemConfig');
const cacheService = require('./cacheService');
const proxyService = require('./proxyService');
const { httpClient } = require('../utils/http');
const logger = require('../utils/logger');

const KEEPALIVE_REMARK = '代理白名单保活';
const CONFIG_DEFAULTS = [
  { key: 'proxy_keepalive_enabled', value: '1', description: '代理白名单保活任务开关(1启用 0禁用)' },
  { key: 'proxy_keepalive_interval_days', value: '7', description: '代理白名单保活检测间隔(天)' },
  { key: 'proxy_keepalive_check_hour', value: '3', description: '代理白名单保活检测小时(0-23)' },
  { key: 'proxy_keepalive_check_minute', value: '20', description: '代理白名单保活检测分钟(0-59)' },
  { key: 'proxy_keepalive_target_url', value: 'http://example.com', description: '代理白名单保活访问目标URL' },
];

const normalizeInteger = (value, defaultValue, minValue, maxValue) => {
  const parsedValue = Number.parseInt(value, 10);
  if (Number.isNaN(parsedValue)) {
    return defaultValue;
  }

  return Math.min(Math.max(parsedValue, minValue), maxValue);
};

const createRequestId = () => {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2, 12)}`;
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

const getDurationParams = (account, site) => {
  const accountParams = parseConfigArray(account && account.durationParams);
  if (accountParams.length > 0) {
    return accountParams;
  }

  return parseConfigArray(site && site.durationParams);
};

const getFormatParams = (account, site) => {
  const accountParams = parseConfigArray(account && account.formatParams);
  if (accountParams.length > 0) {
    return accountParams;
  }

  return parseConfigArray(site && site.formatParams);
};

const chooseDurationValue = (account, site) => {
  const durationParams = getDurationParams(account, site)
    .map((item) => Number.parseInt(item && item.times, 10))
    .filter((times) => !Number.isNaN(times) && times > 0)
    .sort((left, right) => left - right);

  return durationParams.length > 0 ? durationParams[0] : null;
};

const chooseFormatValue = (account, site) => {
  const formatParams = getFormatParams(account, site)
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const value = item.value !== undefined && item.value !== null ? String(item.value).trim() : '';
      return value || null;
    })
    .filter(Boolean);

  const txtFormat = formatParams.find((value) => value.toLowerCase() === 'txt');
  return txtFormat || formatParams[0] || 'txt';
};

const isValidTargetUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const getConfig = async () => {
  const [enabled, intervalDays, checkHour, checkMinute, targetUrl] = await Promise.all([
    SystemConfig.getValue('proxy_keepalive_enabled', '1'),
    SystemConfig.getValue('proxy_keepalive_interval_days', '7'),
    SystemConfig.getValue('proxy_keepalive_check_hour', '3'),
    SystemConfig.getValue('proxy_keepalive_check_minute', '20'),
    SystemConfig.getValue('proxy_keepalive_target_url', 'http://example.com'),
  ]);

  return {
    enabled: String(enabled) === '1',
    intervalDays: normalizeInteger(intervalDays, 7, 1, 365),
    checkHour: normalizeInteger(checkHour, 3, 0, 23),
    checkMinute: normalizeInteger(checkMinute, 20, 0, 59),
    targetUrl: isValidTargetUrl(targetUrl) ? targetUrl : 'http://example.com',
  };
};

const ensureProxyKeepaliveConfigDefaults = async () => {
  for (const item of CONFIG_DEFAULTS) {
    const [config, created] = await SystemConfig.findOrCreate({
      where: { configKey: item.key },
      defaults: {
        configKey: item.key,
        configValue: item.value,
        description: item.description,
      },
    });

    if (!created && config.description !== item.description) {
      config.description = item.description;
      await config.save();
    }
  }
};

const getLastRunAt = async () => {
  const value = await SystemConfig.getValue('proxy_keepalive_last_run_at', '');
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const markLastRunAt = async (date = new Date()) => {
  await SystemConfig.setValue('proxy_keepalive_last_run_at', date.toISOString(), '代理白名单保活任务上次执行时间');
};

const shouldRunByInterval = async (intervalDays) => {
  const lastRunAt = await getLastRunAt();
  if (!lastRunAt) {
    return true;
  }

  return Date.now() - lastRunAt.getTime() >= intervalDays * 24 * 60 * 60 * 1000;
};

const getLastSuccessAtMap = async () => {
  const rows = await sequelize.query(
    `
      SELECT account_id AS accountId, MAX(created_at) AS lastSuccessAt
      FROM proxy_logs
      WHERE account_id IS NOT NULL
        AND success = 1
        AND (
          remark <> :keepaliveRemark
          OR remark IS NULL
          OR error_message IS NULL
          OR error_message NOT LIKE '保活访问失败:%'
        )
      GROUP BY account_id
    `,
    {
      replacements: { keepaliveRemark: KEEPALIVE_REMARK },
      type: QueryTypes.SELECT,
    }
  );

  const result = new Map();
  rows.forEach((row) => {
    result.set(Number(row.accountId), row.lastSuccessAt ? new Date(row.lastSuccessAt) : null);
  });
  return result;
};

const getInactiveAccounts = async (intervalDays) => {
  const cutoffTime = Date.now() - intervalDays * 24 * 60 * 60 * 1000;
  const lastSuccessAtMap = await getLastSuccessAtMap();
  const accounts = await Account.findAll({
    where: {
      status: 1,
      [Op.or]: [
        { siteId: { [Op.ne]: null } },
        { extractUrlTemplate: { [Op.ne]: null } },
      ],
    },
    include: [
      {
        model: Site,
        as: 'site',
        required: false,
      },
    ],
    order: [['id', 'ASC']],
  });

  return accounts.filter((account) => {
    if (account.siteId && (!account.site || account.site.status !== 1)) {
      return false;
    }

    const durationValue = chooseDurationValue(account, account.site);
    if (!durationValue) {
      logger.warn(`代理白名单保活跳过账号 ${account.name}: 未配置可用时长`);
      return false;
    }

    const lastSuccessAt = lastSuccessAtMap.get(account.id);
    return !lastSuccessAt || lastSuccessAt.getTime() < cutoffTime;
  });
};

const buildProxyEndpoint = (host, port, username = null, password = null) => {
  const hostValue = String(host || '').trim();
  const portValue = Number.parseInt(port, 10);
  const octetsValid = hostValue.split('.').every((part) => {
    const value = Number.parseInt(part, 10);
    return !Number.isNaN(value) && value >= 0 && value <= 255;
  });

  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostValue) || !octetsValid || portValue <= 0 || portValue > 65535) {
    return null;
  }

  return {
    host: hostValue,
    port: portValue,
    auth: username && password
      ? { username: String(username), password: String(password) }
      : null,
  };
};

const parseProxyEndpointFromText = (text) => {
  const responseText = String(text || '');
  const pattern = /(^|[^\d])(\d{1,3}(?:\.\d{1,3}){3})[:：](\d{2,5})(?:[:：]([^\s:：]+)[:：]([^\s:：]+))?/g;
  let match;

  while ((match = pattern.exec(responseText)) !== null) {
    const proxyEndpoint = buildProxyEndpoint(match[2], match[3], match[4], match[5]);
    if (proxyEndpoint) {
      return proxyEndpoint;
    }
  }

  return null;
};

const parseProxyEndpointFromObject = (value) => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const proxyEndpoint = parseProxyEndpoint(item);
      if (proxyEndpoint) {
        return proxyEndpoint;
      }
    }
    return null;
  }

  const host = value.ip || value.host || value.proxyIp || value.proxy_ip;
  const port = value.port || value.proxyPort || value.proxy_port;
  const username = value.username || value.user || value.account;
  const password = value.password || value.pass || value.pwd;
  const directEndpoint = buildProxyEndpoint(host, port, username, password);
  if (directEndpoint) {
    return directEndpoint;
  }

  for (const item of Object.values(value)) {
    const proxyEndpoint = parseProxyEndpoint(item);
    if (proxyEndpoint) {
      return proxyEndpoint;
    }
  }

  return null;
};

const parseProxyEndpoint = (response) => {
  if (typeof response === 'string') {
    return parseProxyEndpointFromText(response);
  }

  const objectEndpoint = parseProxyEndpointFromObject(response);
  if (objectEndpoint) {
    return objectEndpoint;
  }

  return parseProxyEndpointFromText(JSON.stringify(response || ''));
};

const buildAxiosProxy = (proxyEndpoint) => {
  const proxyConfig = {
    protocol: 'http',
    host: proxyEndpoint.host,
    port: proxyEndpoint.port,
  };

  if (proxyEndpoint.auth) {
    proxyConfig.auth = proxyEndpoint.auth;
  }

  return proxyConfig;
};

const appendKeepaliveVisitResult = async (logId, visitResult) => {
  if (!logId) {
    return;
  }

  const log = await ProxyLog.findByPk(logId);
  if (!log) {
    return;
  }

  const currentPreview = log.responsePreview || '';
  const visitPreview = JSON.stringify(visitResult).slice(0, 500);
  const responsePreview = `${currentPreview}\n\n[保活访问结果] ${visitPreview}`.slice(0, 1000);

  await log.update({
    responsePreview,
    errorMessage: visitResult.success ? log.errorMessage : `保活访问失败: ${visitResult.message}`.slice(0, 500),
  });
};

const visitTargetByProxy = async (proxyEndpoint, targetUrl) => {
  try {
    const response = await httpClient.get(targetUrl, {
      proxy: buildAxiosProxy(proxyEndpoint),
      timeout: 30000,
      responseType: 'text',
      validateStatus: () => true,
      transformResponse: [(data) => data],
    });

    return {
      success: response.status >= 200 && response.status < 400,
      message: `HTTP ${response.status}`,
      targetUrl,
      proxy: `${proxyEndpoint.host}:${proxyEndpoint.port}`,
      status: response.status,
    };
  } catch (error) {
    return {
      success: false,
      message: error.message,
      targetUrl,
      proxy: `${proxyEndpoint.host}:${proxyEndpoint.port}`,
    };
  }
};

const testAccountProxy = async (account, targetUrl, options = {}) => {
  const site = account.site;
  const durationValue = chooseDurationValue(account, site);
  if (!durationValue) {
    return {
      accountId: account.id,
      accountName: account.name,
      success: false,
      message: '账号未配置可用时长',
      stage: 'resolve_duration',
      targetUrl,
    };
  }

  const formatValue = chooseFormatValue(account, site);
  const requestId = createRequestId();
  const remark = options.remark || KEEPALIVE_REMARK;
  const clientIp = options.clientIp || 'scheduler:proxy-keepalive';

  const extractResult = await proxyService.getProxyByAccount(
    account.id,
    durationValue,
    formatValue,
    clientIp,
    remark,
    requestId
  );

  if (!extractResult.success) {
    return {
      accountId: account.id,
      accountName: account.name,
      success: false,
      message: extractResult.message,
      stage: 'extract',
      targetUrl,
    };
  }

  const proxyEndpoint = parseProxyEndpoint(extractResult.data.response);
  if (!proxyEndpoint) {
    const visitResult = {
      success: false,
      message: '未从提取响应中解析到 IP:端口',
      targetUrl,
    };
    await appendKeepaliveVisitResult(extractResult.data.logId, visitResult);

    return {
      accountId: account.id,
      accountName: account.name,
      success: false,
      message: visitResult.message,
      stage: 'parse_proxy',
      targetUrl,
    };
  }

  const visitResult = await visitTargetByProxy(proxyEndpoint, targetUrl);
  await appendKeepaliveVisitResult(extractResult.data.logId, visitResult);

  return {
    accountId: account.id,
    accountName: account.name,
    success: visitResult.success,
    message: visitResult.message,
    stage: 'visit_target',
    proxy: `${proxyEndpoint.host}:${proxyEndpoint.port}`,
    targetUrl,
    logId: extractResult.data.logId,
  };
};

const testAccountById = async (accountId, options = {}) => {
  await ensureProxyKeepaliveConfigDefaults();
  const config = await getConfig();
  const account = await Account.findByPk(accountId, {
    include: [
      {
        model: Site,
        as: 'site',
        required: false,
      },
    ],
  });

  if (!account) {
    return {
      accountId: Number(accountId),
      accountName: null,
      success: false,
      message: '账号不存在',
      stage: 'load_account',
      targetUrl: options.targetUrl || config.targetUrl,
    };
  }

  return testAccountProxy(account, options.targetUrl || config.targetUrl, {
    clientIp: options.clientIp || 'admin:account-test',
    remark: options.remark || '账号手动测试',
  });
};

const runProxyKeepalive = async (options = {}) => {
  await ensureProxyKeepaliveConfigDefaults();
  const config = await getConfig();
  if (!config.enabled) {
    return { skipped: true, reason: 'disabled', total: 0, successCount: 0, failCount: 0, details: [] };
  }

  const force = Boolean(options.force);
  if (!force && !(await shouldRunByInterval(config.intervalDays))) {
    return { skipped: true, reason: 'not_due', total: 0, successCount: 0, failCount: 0, details: [] };
  }

  const lockIdentifier = await cacheService.acquireLock('proxy_keepalive_job', 60 * 60 * 1000);
  if (!lockIdentifier) {
    return { skipped: true, reason: 'locked', total: 0, successCount: 0, failCount: 0, details: [] };
  }

  try {
    const inactiveAccounts = await getInactiveAccounts(config.intervalDays);
    const details = [];

    logger.info(`代理白名单保活开始: inactive=${inactiveAccounts.length}, intervalDays=${config.intervalDays}, target=${config.targetUrl}`);

    for (const account of inactiveAccounts) {
      try {
        const result = await testAccountProxy(account, config.targetUrl);
        details.push(result);
        logger.info(`代理白名单保活账号完成: account=${account.name}, success=${result.success}, stage=${result.stage}, message=${result.message}`);
      } catch (error) {
        details.push({
          accountId: account.id,
          accountName: account.name,
          success: false,
          message: error.message,
          stage: 'unknown',
        });
        logger.error(`代理白名单保活账号异常: ${account.name}`, error);
      }
    }

    await markLastRunAt();

    const successCount = details.filter((item) => item.success).length;
    const failCount = details.length - successCount;
    logger.info(`代理白名单保活结束: total=${details.length}, success=${successCount}, fail=${failCount}`);

    return {
      skipped: false,
      total: details.length,
      successCount,
      failCount,
      details,
    };
  } finally {
    await cacheService.releaseLock('proxy_keepalive_job', lockIdentifier);
  }
};

module.exports = {
  KEEPALIVE_REMARK,
  ensureProxyKeepaliveConfigDefaults,
  getConfig,
  runProxyKeepalive,
  testAccountById,
};
