const Redis = require('ioredis');
const config = require('../config');
const logger = require('../utils/logger');

// Redis键前缀
const PREFIX = 'proxy:';

// 创建Redis客户端
let redisClient = null;

// 初始化Redis连接
const initRedis = async () => {
  if (redisClient) {
    return redisClient;
  }

  redisClient = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    retryStrategy: (times) => {
      if (times > 3) {
        logger.error('Redis连接失败，超过最大重试次数');
        return null;
      }
      return Math.min(times * 100, 2000);
    },
  });

  redisClient.on('connect', () => {
    logger.info('Redis连接成功');
  });

  redisClient.on('error', (err) => {
    logger.error('Redis错误:', err.message);
  });

  return redisClient;
};

// 获取Redis客户端
const getRedis = () => {
  if (!redisClient) {
    throw new Error('Redis未初始化');
  }
  return redisClient;
};

// 关闭Redis连接
const closeRedis = async () => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis连接已关闭');
  }
};

// ==================== 余额缓存相关 ====================

// 获取账号余额缓存键
const getBalanceKey = (accountId) => `${PREFIX}balance:${accountId}`;

// 设置账号余额缓存
const setAccountBalance = async (accountId, balance) => {
  const redis = getRedis();
  await redis.set(getBalanceKey(accountId), balance.toString());
};

// 获取账号余额缓存
const getAccountBalance = async (accountId) => {
  const redis = getRedis();
  const balance = await redis.get(getBalanceKey(accountId));
  return balance ? parseFloat(balance) : null;
};

// 获取多个账号余额
const getMultipleBalances = async (accountIds) => {
  const redis = getRedis();
  const keys = accountIds.map((id) => getBalanceKey(id));
  const values = await redis.mget(keys);
  const result = {};
  accountIds.forEach((id, index) => {
    result[id] = values[index] ? parseFloat(values[index]) : null;
  });
  return result;
};

// 删除账号余额缓存
const deleteAccountBalance = async (accountId) => {
  const redis = getRedis();
  await redis.del(getBalanceKey(accountId));
};

// ==================== 系统配置缓存相关 ====================

// 获取系统配置缓存键
const getConfigKey = (key) => `${PREFIX}config:${key}`;

// 设置系统配置缓存
const setConfigCache = async (key, value) => {
  const redis = getRedis();
  await redis.set(getConfigKey(key), value);
};

// 获取系统配置缓存
const getConfigCache = async (key) => {
  const redis = getRedis();
  return await redis.get(getConfigKey(key));
};

// 删除系统配置缓存
const deleteConfigCache = async (key) => {
  const redis = getRedis();
  await redis.del(getConfigKey(key));
};

// 清除所有配置缓存
const clearAllConfigCache = async () => {
  const redis = getRedis();
  const keys = await redis.keys(`${PREFIX}config:*`);
  if (keys.length > 0) {
    await redis.del(keys);
  }
};

module.exports = {
  initRedis,
  getRedis,
  closeRedis,
  // 余额缓存
  setAccountBalance,
  getAccountBalance,
  getMultipleBalances,
  deleteAccountBalance,
  // 配置缓存
  setConfigCache,
  getConfigCache,
  deleteConfigCache,
  clearAllConfigCache,
};
