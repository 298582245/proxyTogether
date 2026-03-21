const Redis = require('ioredis');
const config = require('../config');
const logger = require('../utils/logger');

const PREFIX = 'proxy:';
const STATS_TODAY_PREFIX = 'stats:today';
const STATS_TODAY_TTL_SECONDS = 60;
const LOCK_PREFIX = 'lock:';

let redisClient = null;

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

  redisClient.on('error', (error) => {
    logger.error('Redis错误:', error.message);
  });

  return redisClient;
};

const getRedis = () => {
  if (!redisClient) {
    throw new Error('Redis未初始化');
  }
  return redisClient;
};

const closeRedis = async () => {
  if (!redisClient) {
    return;
  }

  await redisClient.quit();
  redisClient = null;
  logger.info('Redis连接已关闭');
};

const scanKeysByPattern = async (pattern, count = 200) => {
  const redis = getRedis();
  let cursor = '0';
  const matchedKeys = [];

  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', count);
    cursor = nextCursor;
    if (keys.length > 0) {
      matchedKeys.push(...keys);
    }
  } while (cursor !== '0');

  return matchedKeys;
};

const deleteKeysByPattern = async (pattern, batchSize = 200) => {
  const keys = await scanKeysByPattern(pattern, batchSize);
  if (keys.length === 0) {
    return 0;
  }

  const redis = getRedis();
  let deletedCount = 0;

  for (let index = 0; index < keys.length; index += batchSize) {
    const batchKeys = keys.slice(index, index + batchSize);
    deletedCount += await redis.del(...batchKeys);
  }

  return deletedCount;
};

const getBalanceKey = (accountId) => `${PREFIX}balance:${accountId}`;
const getConfigKey = (key) => `${PREFIX}config:${key}`;
const getStatsTodayKey = (dateStr) => `${STATS_TODAY_PREFIX}:${dateStr}`;

const setAccountBalance = async (accountId, balance) => {
  const redis = getRedis();
  await redis.set(getBalanceKey(accountId), balance.toString());
};

const getAccountBalance = async (accountId) => {
  const redis = getRedis();
  const balance = await redis.get(getBalanceKey(accountId));
  return balance ? Number.parseFloat(balance) : null;
};

const getMultipleBalances = async (accountIds) => {
  const redis = getRedis();
  const keys = accountIds.map((accountId) => getBalanceKey(accountId));
  const values = await redis.mget(keys);
  const result = {};

  accountIds.forEach((accountId, index) => {
    result[accountId] = values[index] ? Number.parseFloat(values[index]) : null;
  });

  return result;
};

const deleteAccountBalance = async (accountId) => {
  const redis = getRedis();
  await redis.del(getBalanceKey(accountId));
};

const setConfigCache = async (key, value) => {
  const redis = getRedis();
  await redis.set(getConfigKey(key), value);
};

const getConfigCache = async (key) => {
  const redis = getRedis();
  return redis.get(getConfigKey(key));
};

const deleteConfigCache = async (key) => {
  const redis = getRedis();
  await redis.del(getConfigKey(key));
};

const clearAllConfigCache = async () => deleteKeysByPattern(`${PREFIX}config:*`);

const getStatsTodayCache = async (dateStr) => {
  const redis = getRedis();
  const data = await redis.get(getStatsTodayKey(dateStr));
  return data ? JSON.parse(data) : null;
};

const setStatsTodayCache = async (dateStr, data, ttlSeconds = STATS_TODAY_TTL_SECONDS) => {
  const redis = getRedis();
  await redis.set(getStatsTodayKey(dateStr), JSON.stringify(data), 'EX', ttlSeconds);
};

const deleteStatsTodayCache = async (dateStr) => {
  const redis = getRedis();
  await redis.del(getStatsTodayKey(dateStr));
};

const clearAllStatsTodayCache = async () => deleteKeysByPattern(`${STATS_TODAY_PREFIX}:*`);

const incrStatsTodayField = async (dateStr, field, value = 1) => {
  const redis = getRedis();
  const key = getStatsTodayKey(dateStr);
  await redis.hincrby(key, field, value);
  await redis.expire(key, 86400);
};

const incrStatsTodayFields = async (dateStr, fields) => {
  const redis = getRedis();
  const key = getStatsTodayKey(dateStr);
  const multi = redis.multi();

  Object.entries(fields).forEach(([field, value]) => {
    multi.hincrby(key, field, value);
  });

  multi.expire(key, 86400);
  await multi.exec();
};

const getStatsTodayHash = async (dateStr) => {
  const redis = getRedis();
  return redis.hgetall(getStatsTodayKey(dateStr));
};

const acquireLock = async (lockKey, ttlMs = 30000, identifier = null) => {
  const redis = getRedis();
  const key = `${LOCK_PREFIX}${lockKey}`;
  const value = identifier || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const result = await redis.set(key, value, 'PX', ttlMs, 'NX');

  if (result === 'OK') {
    return value;
  }
  return null;
};

const releaseLock = async (lockKey, identifier) => {
  const redis = getRedis();
  const key = `${LOCK_PREFIX}${lockKey}`;
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  const result = await redis.eval(script, 1, key, identifier);
  return result === 1;
};

const withLock = async (lockKey, fn, ttlMs = 30000) => {
  const identifier = await acquireLock(lockKey, ttlMs);
  if (!identifier) {
    return {
      success: false,
      error: '操作正在执行中，请稍后重试',
    };
  }

  try {
    const result = await fn();
    return {
      success: true,
      result,
    };
  } finally {
    await releaseLock(lockKey, identifier);
  }
};

module.exports = {
  initRedis,
  getRedis,
  closeRedis,
  scanKeysByPattern,
  deleteKeysByPattern,
  setAccountBalance,
  getAccountBalance,
  getMultipleBalances,
  deleteAccountBalance,
  setConfigCache,
  getConfigCache,
  deleteConfigCache,
  clearAllConfigCache,
  getStatsTodayKey,
  getStatsTodayCache,
  setStatsTodayCache,
  deleteStatsTodayCache,
  clearAllStatsTodayCache,
  incrStatsTodayField,
  incrStatsTodayFields,
  getStatsTodayHash,
  acquireLock,
  releaseLock,
  withLock,
};
