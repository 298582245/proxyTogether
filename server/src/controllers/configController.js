const SystemConfig = require('../models/SystemConfig');
const cacheService = require('../services/cacheService');
const scheduler = require('../schedulers/balanceScheduler');
const logger = require('../utils/logger');

const MASKED_KEYS = ['jwt_private_key', 'jwt_public_key', 'admin_password'];
const READ_ONLY_KEYS = ['jwt_private_key', 'jwt_public_key'];
const JSON_ARRAY_KEYS = ['ip_whitelist', 'proxy_failure_keywords'];
const LOG_SCHEDULER_KEYS = [
  'log_stats_flush_interval_minutes',
  'log_cleanup_hour',
  'log_cleanup_minute',
];

const normalizeInteger = (value) => {
  const parsedValue = Number.parseInt(value, 10);
  return Number.isNaN(parsedValue) ? null : parsedValue;
};

const assertIntegerRange = (value, minValue, maxValue, message) => {
  const parsedValue = normalizeInteger(value);
  if (parsedValue === null || parsedValue < minValue || parsedValue > maxValue) {
    throw createValidationError(message);
  }
};

const normalizeJsonArrayValue = (value, message) => {
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }

  if (typeof value !== 'string') {
    throw createValidationError(message);
  }

  let parsedValue;
  try {
    parsedValue = JSON.parse(value);
  } catch (error) {
    throw createValidationError(message);
  }

  if (!Array.isArray(parsedValue)) {
    throw createValidationError(message);
  }

  return JSON.stringify(parsedValue);
};

const validateAndNormalizeConfigValue = (key, value) => {
  if (key === 'admin_password') {
    if (!value || value === '******') {
      return null;
    }

    if (String(value).length < 6) {
      throw createValidationError('密码长度不能少于6位');
    }

    return String(value);
  }

  if (JSON_ARRAY_KEYS.includes(key)) {
    const message = key === 'ip_whitelist'
      ? 'IP白名单格式错误，应为JSON数组'
      : '失败关键词格式错误，应为JSON数组';
    return normalizeJsonArrayValue(value, message);
  }

  if (key === 'balance_check_interval') {
    assertIntegerRange(value, 1, 59, '余额检查间隔必须是1到59之间的整数');
    return String(normalizeInteger(value));
  }

  if (key === 'log_stats_flush_interval_minutes') {
    assertIntegerRange(value, 1, 59, '日志统计刷盘间隔必须是1到59之间的整数');
    return String(normalizeInteger(value));
  }

  if (key === 'log_stats_realtime_ttl_seconds') {
    assertIntegerRange(value, 600, 604800, '实时统计缓存TTL必须是600到604800之间的整数');
    return String(normalizeInteger(value));
  }

  if (key === 'log_retention_days') {
    assertIntegerRange(value, 1, 3650, '日志保留天数必须是1到3650之间的整数');
    return String(normalizeInteger(value));
  }

  if (key === 'log_cleanup_hour') {
    assertIntegerRange(value, 0, 23, '日志清理小时必须是0到23之间的整数');
    return String(normalizeInteger(value));
  }

  if (key === 'log_cleanup_minute') {
    assertIntegerRange(value, 0, 59, '日志清理分钟必须是0到59之间的整数');
    return String(normalizeInteger(value));
  }

  if (value === undefined || value === null) {
    return '';
  }

  return value;
};

const getConfig = async (req, res) => {
  try {
    const configs = await SystemConfig.findAll({
      order: [['id', 'ASC']],
    });

    const result = configs.map((config) => ({
      key: config.configKey,
      description: config.description,
      value: MASKED_KEYS.includes(config.configKey) ? '******' : config.configValue,
    }));

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('获取系统配置失败:', error);
    res.status(500).json({
      success: false,
      message: '获取系统配置失败',
    });
  }
};

const updateConfig = async (req, res) => {
  try {
    const { configs } = req.body;

    if (!configs || !Array.isArray(configs)) {
      return res.status(400).json({
        success: false,
        message: '参数格式错误',
      });
    }

    const updatedKeys = [];

    for (const item of configs) {
      const { key, value } = item || {};
      if (!key || READ_ONLY_KEYS.includes(key)) {
        continue;
      }

      const normalizedValue = validateAndNormalizeConfigValue(key, value);
      if (normalizedValue === null) {
        continue;
      }

      await SystemConfig.setValue(key, normalizedValue);
      await cacheService.deleteConfigCache(key);
      updatedKeys.push(key);
    }

    if (updatedKeys.includes('balance_check_interval')) {
      await scheduler.restartBalanceCheckJob();
    }

    if (updatedKeys.some((key) => LOG_SCHEDULER_KEYS.includes(key))) {
      await scheduler.restartLogStatsJobs();
    }

    res.json({
      success: true,
      message: '配置更新成功',
    });
  } catch (error) {
    logger.error('更新系统配置失败:', error);
    const isValidationError = error instanceof Error;
    res.status(isValidationError ? 400 : 500).json({
      success: false,
      message: isValidationError ? error.message : '更新系统配置失败',
    });
  }
};

const getConfigValue = async (req, res) => {
  try {
    const { key } = req.params;
    const value = await SystemConfig.getValue(key);

    res.json({
      success: true,
      data: {
        key,
        value: MASKED_KEYS.includes(key) ? '******' : value,
      },
    });
  } catch (error) {
    logger.error('获取配置失败:', error);
    res.status(500).json({
      success: false,
      message: '获取配置失败',
    });
  }
};

module.exports = {
  getConfig,
  updateConfig,
  getConfigValue,
};

