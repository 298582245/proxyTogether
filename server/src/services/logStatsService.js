const { QueryTypes, Op } = require('sequelize');
const { sequelize } = require('../config/database');
const ProxyLog = require('../models/ProxyLog');
const Account = require('../models/Account');
const Site = require('../models/Site');
const SystemConfig = require('../models/SystemConfig');
const cacheService = require('./cacheService');
const logger = require('../utils/logger');
const {
  BUCKET_INTERVAL_MINUTES,
  addDays,
  addMinutes,
  formatBucketId,
  getBucketLabel,
  getBucketStart,
  getChinaDateStr,
  getChinaDayEnd,
  getChinaDayStart,
  getChinaHour,
  getTimeRange,
  isDateRangeIncludesToday,
  parseBucketId,
} = require('../utils/statsTime');

const REALTIME_PREFIX = 'proxy:log-stats:realtime';
const QUERY_CACHE_PREFIX = 'stats:';
const DEFAULT_REALTIME_TTL_SECONDS = 3 * 24 * 60 * 60;
const DEFAULT_LOG_RETENTION_DAYS = 30;
const DEFAULT_LOG_STATS_FLUSH_INTERVAL_MINUTES = 10;
const DEFAULT_LOG_CLEANUP_HOUR = 3;
const DEFAULT_LOG_CLEANUP_MINUTE = 30;
const LOG_STATS_INITIALIZED_KEY = 'log_stats_initialized';
const LOG_STATS_LAST_FLUSHED_BUCKET_KEY = 'log_stats_last_flushed_bucket';
const LOG_RETENTION_DAYS_KEY = 'log_retention_days';
const LOG_STATS_REALTIME_TTL_SECONDS_KEY = 'log_stats_realtime_ttl_seconds';
const LOG_STATS_FLUSH_INTERVAL_MINUTES_KEY = 'log_stats_flush_interval_minutes';
const LOG_CLEANUP_HOUR_KEY = 'log_cleanup_hour';
const LOG_CLEANUP_MINUTE_KEY = 'log_cleanup_minute';
const LOG_STATS_CONFIG_DEFAULTS = [
  { key: LOG_STATS_INITIALIZED_KEY, value: '0', description: 'log stats aggregate initialized flag' },
  { key: LOG_STATS_LAST_FLUSHED_BUCKET_KEY, value: '', description: 'last flushed log stats bucket' },
  { key: LOG_RETENTION_DAYS_KEY, value: String(DEFAULT_LOG_RETENTION_DAYS), description: 'proxy log retention days' },
  { key: LOG_STATS_REALTIME_TTL_SECONDS_KEY, value: String(DEFAULT_REALTIME_TTL_SECONDS), description: 'log stats realtime ttl seconds' },
  { key: LOG_STATS_FLUSH_INTERVAL_MINUTES_KEY, value: String(DEFAULT_LOG_STATS_FLUSH_INTERVAL_MINUTES), description: 'log stats flush schedule interval minutes' },
  { key: LOG_CLEANUP_HOUR_KEY, value: String(DEFAULT_LOG_CLEANUP_HOUR), description: 'proxy log cleanup hour' },
  { key: LOG_CLEANUP_MINUTE_KEY, value: String(DEFAULT_LOG_CLEANUP_MINUTE), description: 'proxy log cleanup minute' },
];

const buildEmptyMetrics = () => ({
  requestCount: 0,
  successCount: 0,
  failCount: 0,
  totalCost: 0,
});

const toInteger = (value) => Number.parseInt(value, 10) || 0;
const toFloat = (value) => Number.parseFloat(value) || 0;

const normalizeMetrics = (row = {}) => ({
  requestCount: toInteger(row.requestCount),
  successCount: toInteger(row.successCount),
  failCount: toInteger(row.failCount),
  totalCost: toFloat(row.totalCost),
});

const addMetricsInPlace = (target, source) => {
  target.requestCount += toInteger(source.requestCount);
  target.successCount += toInteger(source.successCount);
  target.failCount += toInteger(source.failCount);
  target.totalCost += toFloat(source.totalCost);
  return target;
};

const normalizeRemark = (remark) => {
  if (typeof remark !== 'string') {
    return null;
  }

  const trimmedRemark = remark.trim();
  if (!trimmedRemark) {
    return null;
  }

  return trimmedRemark.slice(0, 255);
};

const encodeRemark = (remark) => Buffer.from(remark, 'utf8').toString('base64');
const decodeRemark = (remark) => Buffer.from(remark, 'base64').toString('utf8');

const getRealtimeBucketKeys = (date) => {
  const dateStr = getChinaDateStr(date);
  const bucketLabel = getBucketLabel(date);
  return {
    summary: `${REALTIME_PREFIX}:summary:${dateStr}:${bucketLabel}`,
    hourly: `${REALTIME_PREFIX}:hourly:${dateStr}:${bucketLabel}`,
    account: `${REALTIME_PREFIX}:account:${dateStr}:${bucketLabel}`,
    site: `${REALTIME_PREFIX}:site:${dateStr}:${bucketLabel}`,
    remark: `${REALTIME_PREFIX}:remark:${dateStr}:${bucketLabel}`,
  };
};

const getRealtimeDatePattern = (dateStr) => `${REALTIME_PREFIX}:*:${dateStr}:*`;

const buildStatDateWhere = (startDate, endDate, replacements, columnName = 'stat_date') => {
  const conditions = [];

  if (startDate) {
    replacements.startDate = getChinaDateStr(startDate);
    conditions.push(`${columnName} >= :startDate`);
  }

  if (endDate) {
    replacements.endDate = getChinaDateStr(endDate);
    conditions.push(`${columnName} <= :endDate`);
  }

  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
};

const buildCreatedAtWhere = (startDate, endDate, replacements) => {
  const conditions = [];

  if (startDate) {
    replacements.createdStart = startDate;
    conditions.push('created_at >= :createdStart');
  }

  if (endDate) {
    replacements.createdEnd = endDate;
    conditions.push('created_at <= :createdEnd');
  }

  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
};

const queryOne = async (sql, replacements = {}) => {
  const rows = await sequelize.query(sql, {
    replacements,
    type: QueryTypes.SELECT,
  });

  return rows[0] || {};
};

const queryAll = async (sql, replacements = {}) => sequelize.query(sql, {
  replacements,
  type: QueryTypes.SELECT,
});

const upsertSystemConfigValue = async (transaction, key, value, description) => {
  await sequelize.query(
    `
      INSERT INTO system_configs (config_key, config_value, description, created_at, updated_at)
      VALUES (:configKey, :configValue, :description, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        config_value = VALUES(config_value),
        description = VALUES(description),
        updated_at = NOW()
    `,
    {
      transaction,
      replacements: {
        configKey: key,
        configValue: value,
        description,
      },
      type: QueryTypes.INSERT,
    },
  );
};

const ensureSystemConfigDefault = async (key, value, description, transaction = null) => {
  await sequelize.query(
    `
      INSERT INTO system_configs (config_key, config_value, description, created_at, updated_at)
      VALUES (:configKey, :configValue, :description, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        description = VALUES(description),
        updated_at = updated_at
    `,
    {
      transaction,
      replacements: {
        configKey: key,
        configValue: value,
        description,
      },
      type: QueryTypes.INSERT,
    },
  );
};

const ensureLogStatsConfigDefaults = async (transaction = null) => {
  for (const item of LOG_STATS_CONFIG_DEFAULTS) {
    await ensureSystemConfigDefault(item.key, item.value, item.description, transaction);
  }
};

const clampNumber = (value, minValue, maxValue) => Math.min(Math.max(value, minValue), maxValue);

const getSystemConfigValueCached = async (key, defaultValue) => {
  try {
    const cachedValue = await cacheService.getConfigCache(key);
    if (cachedValue !== null && cachedValue !== undefined) {
      return cachedValue;
    }
  } catch (error) {
    logger.warn(`load config cache failed: ${key}`, error.message);
  }

  const value = await SystemConfig.getValue(key, defaultValue);

  try {
    await cacheService.setConfigCache(key, value);
  } catch (error) {
    logger.warn(`write config cache failed: ${key}`, error.message);
  }

  return value;
};

const getRealtimeTtlSeconds = async () => {
  const value = toInteger(
    await getSystemConfigValueCached(LOG_STATS_REALTIME_TTL_SECONDS_KEY, String(DEFAULT_REALTIME_TTL_SECONDS)),
  ) || DEFAULT_REALTIME_TTL_SECONDS;
  return clampNumber(value, 600, 7 * 24 * 60 * 60);
};

const getLogRetentionDays = async () => {
  const value = toInteger(
    await getSystemConfigValueCached(LOG_RETENTION_DAYS_KEY, String(DEFAULT_LOG_RETENTION_DAYS)),
  ) || DEFAULT_LOG_RETENTION_DAYS;
  return clampNumber(value, 1, 3650);
};

const getLogStatsSchedulerConfig = async () => {
  await ensureLogStatsConfigDefaults();

  const flushIntervalMinutes = clampNumber(
    toInteger(
      await getSystemConfigValueCached(
        LOG_STATS_FLUSH_INTERVAL_MINUTES_KEY,
        String(DEFAULT_LOG_STATS_FLUSH_INTERVAL_MINUTES),
      ),
    ) || DEFAULT_LOG_STATS_FLUSH_INTERVAL_MINUTES,
    1,
    59,
  );

  const cleanupHour = clampNumber(
    toInteger(await getSystemConfigValueCached(LOG_CLEANUP_HOUR_KEY, String(DEFAULT_LOG_CLEANUP_HOUR)))
      || DEFAULT_LOG_CLEANUP_HOUR,
    0,
    23,
  );

  const cleanupMinute = clampNumber(
    toInteger(await getSystemConfigValueCached(LOG_CLEANUP_MINUTE_KEY, String(DEFAULT_LOG_CLEANUP_MINUTE)))
      || DEFAULT_LOG_CLEANUP_MINUTE,
    0,
    59,
  );

  return {
    flushIntervalMinutes,
    cleanupHour,
    cleanupMinute,
  };
};

const getLastFlushedBucketStart = async () => {
  const bucketValue = await SystemConfig.getValue(LOG_STATS_LAST_FLUSHED_BUCKET_KEY, '');
  if (!bucketValue) {
    return null;
  }

  return parseBucketId(bucketValue);
};

const getPendingRealtimeStart = async () => {
  const todayStart = getChinaDayStart(getChinaDateStr(new Date()));
  const lastFlushedBucketStart = await getLastFlushedBucketStart();
  if (!lastFlushedBucketStart) {
    return todayStart;
  }

  const nextBucketStart = addMinutes(lastFlushedBucketStart, BUCKET_INTERVAL_MINUTES);
  return nextBucketStart > todayStart ? nextBucketStart : todayStart;
};

const clearStatsQueryCache = async () => {
  try {
    const redis = cacheService.getRedis();
    const cacheKeys = await redis.keys(`${QUERY_CACHE_PREFIX}*`);
    if (cacheKeys.length > 0) {
      await redis.del(cacheKeys);
    }
  } catch (error) {
    logger.warn('clear stats query cache failed:', error.message);
  }
};

const recordRealtimeLogStat = async (logData, createdAt = new Date()) => {
  try {
    const redis = cacheService.getRedis();
    const realtimeTtlSeconds = await getRealtimeTtlSeconds();
    const bucketKeys = getRealtimeBucketKeys(createdAt);
    const accountId = logData.accountId || 0;
    const siteId = logData.siteId || 0;
    const successCount = logData.success ? 1 : 0;
    const failCount = logData.success ? 0 : 1;
    const totalCost = logData.success ? toFloat(logData.cost) : 0;
    const hour = getChinaHour(createdAt);
    const remark = normalizeRemark(logData.remark);
    const pipeline = redis.pipeline();

    pipeline.hincrby(bucketKeys.summary, 'requestCount', 1);
    pipeline.hincrby(bucketKeys.summary, 'successCount', successCount);
    pipeline.hincrby(bucketKeys.summary, 'failCount', failCount);
    pipeline.hincrbyfloat(bucketKeys.summary, 'totalCost', totalCost);

    pipeline.hincrby(bucketKeys.hourly, `${hour}:requestCount`, 1);
    pipeline.hincrby(bucketKeys.hourly, `${hour}:successCount`, successCount);
    pipeline.hincrby(bucketKeys.hourly, `${hour}:failCount`, failCount);
    pipeline.hincrbyfloat(bucketKeys.hourly, `${hour}:totalCost`, totalCost);

    pipeline.hincrby(bucketKeys.account, `${accountId}:requestCount`, 1);
    pipeline.hincrby(bucketKeys.account, `${accountId}:successCount`, successCount);
    pipeline.hincrby(bucketKeys.account, `${accountId}:failCount`, failCount);
    pipeline.hincrbyfloat(bucketKeys.account, `${accountId}:totalCost`, totalCost);

    pipeline.hincrby(bucketKeys.site, `${siteId}:requestCount`, 1);
    pipeline.hincrby(bucketKeys.site, `${siteId}:successCount`, successCount);
    pipeline.hincrby(bucketKeys.site, `${siteId}:failCount`, failCount);
    pipeline.hincrbyfloat(bucketKeys.site, `${siteId}:totalCost`, totalCost);

    if (remark) {
      const encodedRemark = encodeRemark(remark);
      pipeline.hincrby(bucketKeys.remark, `${encodedRemark}:requestCount`, 1);
      pipeline.hincrby(bucketKeys.remark, `${encodedRemark}:successCount`, successCount);
      pipeline.hincrby(bucketKeys.remark, `${encodedRemark}:failCount`, failCount);
      pipeline.hincrbyfloat(bucketKeys.remark, `${encodedRemark}:totalCost`, totalCost);
    }

    Object.values(bucketKeys).forEach((key) => {
      pipeline.expire(key, realtimeTtlSeconds);
    });

    await pipeline.exec();
  } catch (error) {
    logger.warn('record realtime log stat failed:', error.message);
  }
};

const createProxyLog = async (data) => {
  const normalizedRemark = normalizeRemark(data.remark);

  const log = await ProxyLog.create({
    accountId: data.accountId || null,
    siteId: data.siteId || null,
    clientIp: data.clientIp,
    duration: data.duration,
    format: data.format,
    success: data.success ? 1 : 0,
    cost: data.cost || 0,
    errorMessage: data.errorMessage,
    remark: normalizedRemark,
    responsePreview: data.responsePreview,
  });

  await recordRealtimeLogStat({
    accountId: log.accountId,
    siteId: log.siteId,
    success: Number(log.success) === 1,
    cost: log.cost,
    remark: log.remark,
  }, log.createdAt || new Date());

  return log;
};

const deleteRealtimeKeysByDate = async (dateStr) => {
  try {
    const redis = cacheService.getRedis();
    const keys = await redis.keys(getRealtimeDatePattern(dateStr));
    if (keys.length > 0) {
      await redis.del(keys);
    }
  } catch (error) {
    logger.warn('delete realtime keys by date failed:', error.message);
  }
};

const syncPendingRealtimeFromRaw = async () => {
  const pendingStart = await getPendingRealtimeStart();
  const now = new Date();

  if (pendingStart > now) {
    return 0;
  }

  const pendingDateStr = getChinaDateStr(now);
  await deleteRealtimeKeysByDate(pendingDateStr);

  const logs = await ProxyLog.findAll({
    where: {
      createdAt: {
        [Op.gte]: pendingStart,
        [Op.lte]: now,
      },
    },
    attributes: ['accountId', 'siteId', 'success', 'cost', 'remark', 'createdAt'],
    raw: true,
  });

  for (const log of logs) {
    await recordRealtimeLogStat({
      accountId: log.accountId,
      siteId: log.siteId,
      success: Number(log.success) === 1,
      cost: log.cost,
      remark: log.remark,
    }, new Date(log.createdAt));
  }

  return logs.length;
};

const initializeAggregatedStats = async () => {
  const initialized = await SystemConfig.getValue(LOG_STATS_INITIALIZED_KEY, '0');
  const currentBucketStart = getBucketStart(new Date());
  const lastClosedBucketStart = addMinutes(currentBucketStart, -BUCKET_INTERVAL_MINUTES);

  if (initialized === '1') {
    await syncPendingRealtimeFromRaw();
    return false;
  }

  await sequelize.transaction(async (transaction) => {
    await sequelize.query('DELETE FROM proxy_log_daily_stats', { transaction, type: QueryTypes.DELETE });
    await sequelize.query('DELETE FROM proxy_log_hourly_stats', { transaction, type: QueryTypes.DELETE });
    await sequelize.query('DELETE FROM proxy_log_remark_daily_stats', { transaction, type: QueryTypes.DELETE });

    await sequelize.query(
      `
        INSERT INTO proxy_log_daily_stats (stat_date, site_id, account_id, request_count, success_count, fail_count, total_cost, created_at, updated_at)
        SELECT
          DATE(created_at) AS stat_date,
          site_id,
          account_id,
          COUNT(*) AS request_count,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS success_count,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS fail_count,
          SUM(CASE WHEN success = 1 THEN cost ELSE 0 END) AS total_cost,
          NOW(),
          NOW()
        FROM proxy_logs
        WHERE created_at < :currentBucketStart
        GROUP BY DATE(created_at), site_id, account_id
      `,
      {
        transaction,
        replacements: { currentBucketStart },
        type: QueryTypes.INSERT,
      },
    );

    await sequelize.query(
      `
        INSERT INTO proxy_log_hourly_stats (stat_date, stat_hour, request_count, success_count, fail_count, total_cost, created_at, updated_at)
        SELECT
          DATE(created_at) AS stat_date,
          HOUR(created_at) AS stat_hour,
          COUNT(*) AS request_count,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS success_count,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS fail_count,
          SUM(CASE WHEN success = 1 THEN cost ELSE 0 END) AS total_cost,
          NOW(),
          NOW()
        FROM proxy_logs
        WHERE created_at < :currentBucketStart
        GROUP BY DATE(created_at), HOUR(created_at)
      `,
      {
        transaction,
        replacements: { currentBucketStart },
        type: QueryTypes.INSERT,
      },
    );

    await sequelize.query(
      `
        INSERT INTO proxy_log_remark_daily_stats (stat_date, remark, request_count, success_count, fail_count, total_cost, created_at, updated_at)
        SELECT
          DATE(created_at) AS stat_date,
          TRIM(remark) AS remark,
          COUNT(*) AS request_count,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS success_count,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS fail_count,
          SUM(CASE WHEN success = 1 THEN cost ELSE 0 END) AS total_cost,
          NOW(),
          NOW()
        FROM proxy_logs
        WHERE created_at < :currentBucketStart AND remark IS NOT NULL AND TRIM(remark) <> ''
        GROUP BY DATE(created_at), TRIM(remark)
      `,
      {
        transaction,
        replacements: { currentBucketStart },
        type: QueryTypes.INSERT,
      },
    );

    await upsertSystemConfigValue(transaction, LOG_STATS_INITIALIZED_KEY, '1', 'log stats aggregate initialized flag');
    await upsertSystemConfigValue(
      transaction,
      LOG_STATS_LAST_FLUSHED_BUCKET_KEY,
      formatBucketId(lastClosedBucketStart),
      'last flushed log stats bucket',
    );
  });

  await syncPendingRealtimeFromRaw();
  await clearStatsQueryCache();
  logger.info('log stats aggregate initialized');
  return true;
};

const flushBucketToMysql = async (bucketStart) => {
  const bucketEnd = addMinutes(bucketStart, BUCKET_INTERVAL_MINUTES);

  await sequelize.transaction(async (transaction) => {
    await sequelize.query(
      `
        INSERT INTO proxy_log_daily_stats (stat_date, site_id, account_id, request_count, success_count, fail_count, total_cost, created_at, updated_at)
        SELECT
          DATE(created_at) AS stat_date,
          site_id,
          account_id,
          COUNT(*) AS request_count,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS success_count,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS fail_count,
          SUM(CASE WHEN success = 1 THEN cost ELSE 0 END) AS total_cost,
          NOW(),
          NOW()
        FROM proxy_logs
        WHERE created_at >= :bucketStart AND created_at < :bucketEnd
        GROUP BY DATE(created_at), site_id, account_id
        ON DUPLICATE KEY UPDATE
          request_count = request_count + VALUES(request_count),
          success_count = success_count + VALUES(success_count),
          fail_count = fail_count + VALUES(fail_count),
          total_cost = total_cost + VALUES(total_cost),
          updated_at = NOW()
      `,
      {
        transaction,
        replacements: { bucketStart, bucketEnd },
        type: QueryTypes.INSERT,
      },
    );

    await sequelize.query(
      `
        INSERT INTO proxy_log_hourly_stats (stat_date, stat_hour, request_count, success_count, fail_count, total_cost, created_at, updated_at)
        SELECT
          DATE(created_at) AS stat_date,
          HOUR(created_at) AS stat_hour,
          COUNT(*) AS request_count,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS success_count,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS fail_count,
          SUM(CASE WHEN success = 1 THEN cost ELSE 0 END) AS total_cost,
          NOW(),
          NOW()
        FROM proxy_logs
        WHERE created_at >= :bucketStart AND created_at < :bucketEnd
        GROUP BY DATE(created_at), HOUR(created_at)
        ON DUPLICATE KEY UPDATE
          request_count = request_count + VALUES(request_count),
          success_count = success_count + VALUES(success_count),
          fail_count = fail_count + VALUES(fail_count),
          total_cost = total_cost + VALUES(total_cost),
          updated_at = NOW()
      `,
      {
        transaction,
        replacements: { bucketStart, bucketEnd },
        type: QueryTypes.INSERT,
      },
    );

    await sequelize.query(
      `
        INSERT INTO proxy_log_remark_daily_stats (stat_date, remark, request_count, success_count, fail_count, total_cost, created_at, updated_at)
        SELECT
          DATE(created_at) AS stat_date,
          TRIM(remark) AS remark,
          COUNT(*) AS request_count,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS success_count,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS fail_count,
          SUM(CASE WHEN success = 1 THEN cost ELSE 0 END) AS total_cost,
          NOW(),
          NOW()
        FROM proxy_logs
        WHERE created_at >= :bucketStart AND created_at < :bucketEnd AND remark IS NOT NULL AND TRIM(remark) <> ''
        GROUP BY DATE(created_at), TRIM(remark)
        ON DUPLICATE KEY UPDATE
          request_count = request_count + VALUES(request_count),
          success_count = success_count + VALUES(success_count),
          fail_count = fail_count + VALUES(fail_count),
          total_cost = total_cost + VALUES(total_cost),
          updated_at = NOW()
      `,
      {
        transaction,
        replacements: { bucketStart, bucketEnd },
        type: QueryTypes.INSERT,
      },
    );

    await upsertSystemConfigValue(
      transaction,
      LOG_STATS_LAST_FLUSHED_BUCKET_KEY,
      formatBucketId(bucketStart),
      'last flushed log stats bucket',
    );
  });

  await clearStatsQueryCache();
};

const flushClosedBuckets = async () => {
  await initializeAggregatedStats();

  const currentBucketStart = getBucketStart(new Date());
  const lastClosedBucketStart = addMinutes(currentBucketStart, -BUCKET_INTERVAL_MINUTES);
  const lastFlushedBucketStart = await getLastFlushedBucketStart();

  if (!lastFlushedBucketStart || lastFlushedBucketStart >= lastClosedBucketStart) {
    return 0;
  }

  let flushedCount = 0;
  let nextBucketStart = addMinutes(lastFlushedBucketStart, BUCKET_INTERVAL_MINUTES);

  while (nextBucketStart <= lastClosedBucketStart) {
    await flushBucketToMysql(nextBucketStart);
    flushedCount += 1;
    nextBucketStart = addMinutes(nextBucketStart, BUCKET_INTERVAL_MINUTES);
  }

  await syncPendingRealtimeFromRaw();
  return flushedCount;
};

const cleanupExpiredLogs = async () => {
  const retentionDays = toInteger(await SystemConfig.getValue(LOG_RETENTION_DAYS_KEY, '30')) || 30;
  const cutoffDate = getChinaDayStart(getChinaDateStr(addDays(new Date(), -retentionDays)));
  let totalDeleted = 0;

  while (true) {
    const deletedCount = await ProxyLog.destroy({
      where: {
        createdAt: {
          [Op.lt]: cutoffDate,
        },
      },
      limit: 5000,
    });

    if (!deletedCount) {
      break;
    }

    totalDeleted += deletedCount;
  }

  return totalDeleted;
};

const getRealtimeAggregateFromRedis = async () => {
  const result = {
    summary: buildEmptyMetrics(),
    hours: {},
    accounts: {},
    sites: {},
    remarks: {},
  };

  try {
    const redis = cacheService.getRedis();
    const todayStr = getChinaDateStr(new Date());
    const [summaryKeys, hourlyKeys, accountKeys, siteKeys, remarkKeys] = await Promise.all([
      redis.keys(`${REALTIME_PREFIX}:summary:${todayStr}:*`),
      redis.keys(`${REALTIME_PREFIX}:hourly:${todayStr}:*`),
      redis.keys(`${REALTIME_PREFIX}:account:${todayStr}:*`),
      redis.keys(`${REALTIME_PREFIX}:site:${todayStr}:*`),
      redis.keys(`${REALTIME_PREFIX}:remark:${todayStr}:*`),
    ]);

    if (
      summaryKeys.length === 0
      && hourlyKeys.length === 0
      && accountKeys.length === 0
      && siteKeys.length === 0
      && remarkKeys.length === 0
    ) {
      return null;
    }

    const readHashValues = async (keys) => {
      if (!keys.length) {
        return [];
      }

      const pipeline = redis.pipeline();
      keys.forEach((key) => pipeline.hgetall(key));
      const values = await pipeline.exec();
      return values.map(([error, data]) => (error ? {} : data));
    };

    const [summaryHashes, hourlyHashes, accountHashes, siteHashes, remarkHashes] = await Promise.all([
      readHashValues(summaryKeys),
      readHashValues(hourlyKeys),
      readHashValues(accountKeys),
      readHashValues(siteKeys),
      readHashValues(remarkKeys),
    ]);

    summaryHashes.forEach((hash) => {
      addMetricsInPlace(result.summary, normalizeMetrics(hash));
    });

    const mergeHashMetrics = (hashes, target, valueParser = (value) => value) => {
      hashes.forEach((hash) => {
        Object.entries(hash).forEach(([field, rawValue]) => {
          const separatorIndex = field.lastIndexOf(':');
          if (separatorIndex === -1) {
            return;
          }

          const itemKey = field.slice(0, separatorIndex);
          const metricKey = field.slice(separatorIndex + 1);
          const parsedKey = valueParser(itemKey);

          if (!target[parsedKey]) {
            target[parsedKey] = buildEmptyMetrics();
          }

          if (metricKey === 'totalCost') {
            target[parsedKey].totalCost += toFloat(rawValue);
          } else if (metricKey === 'requestCount') {
            target[parsedKey].requestCount += toInteger(rawValue);
          } else if (metricKey === 'successCount') {
            target[parsedKey].successCount += toInteger(rawValue);
          } else if (metricKey === 'failCount') {
            target[parsedKey].failCount += toInteger(rawValue);
          }
        });
      });
    };

    mergeHashMetrics(hourlyHashes, result.hours, (key) => String(toInteger(key)));
    mergeHashMetrics(accountHashes, result.accounts, (key) => String(toInteger(key)));
    mergeHashMetrics(siteHashes, result.sites, (key) => String(toInteger(key)));
    mergeHashMetrics(remarkHashes, result.remarks, (key) => decodeRemark(key));

    return result;
  } catch (error) {
    logger.warn('load realtime aggregate from redis failed:', error.message);
    return null;
  }
};

const getRealtimeAggregateFromRaw = async (startDate, endDate) => {
  const result = {
    summary: buildEmptyMetrics(),
    hours: {},
    accounts: {},
    sites: {},
    remarks: {},
  };

  if (!startDate || startDate > endDate) {
    return result;
  }

  const replacements = {};
  const whereSql = buildCreatedAtWhere(startDate, endDate, replacements);

  const [summaryRow, hourlyRows, accountRows, siteRows, remarkRows] = await Promise.all([
    queryOne(
      `
        SELECT
          COUNT(*) AS requestCount,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successCount,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failCount,
          SUM(CASE WHEN success = 1 THEN cost ELSE 0 END) AS totalCost
        FROM proxy_logs
        ${whereSql}
      `,
      replacements,
    ),
    queryAll(
      `
        SELECT
          HOUR(created_at) AS statHour,
          COUNT(*) AS requestCount,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successCount,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failCount,
          SUM(CASE WHEN success = 1 THEN cost ELSE 0 END) AS totalCost
        FROM proxy_logs
        ${whereSql}
        GROUP BY HOUR(created_at)
      `,
      replacements,
    ),
    queryAll(
      `
        SELECT
          COALESCE(account_id, 0) AS accountId,
          COUNT(*) AS requestCount,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successCount,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failCount,
          SUM(CASE WHEN success = 1 THEN cost ELSE 0 END) AS totalCost
        FROM proxy_logs
        ${whereSql}
        GROUP BY account_id
      `,
      replacements,
    ),
    queryAll(
      `
        SELECT
          COALESCE(site_id, 0) AS siteId,
          COUNT(*) AS requestCount,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successCount,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failCount,
          SUM(CASE WHEN success = 1 THEN cost ELSE 0 END) AS totalCost
        FROM proxy_logs
        ${whereSql}
        GROUP BY site_id
      `,
      replacements,
    ),
    queryAll(
      `
        SELECT
          TRIM(remark) AS remark,
          COUNT(*) AS requestCount,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successCount,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failCount,
          SUM(CASE WHEN success = 1 THEN cost ELSE 0 END) AS totalCost
        FROM proxy_logs
        ${whereSql} ${whereSql ? 'AND' : 'WHERE'} remark IS NOT NULL AND TRIM(remark) <> ''
        GROUP BY TRIM(remark)
      `,
      replacements,
    ),
  ]);

  result.summary = normalizeMetrics(summaryRow);

  hourlyRows.forEach((row) => {
    result.hours[String(toInteger(row.statHour))] = normalizeMetrics(row);
  });

  accountRows.forEach((row) => {
    result.accounts[String(toInteger(row.accountId))] = normalizeMetrics(row);
  });

  siteRows.forEach((row) => {
    result.sites[String(toInteger(row.siteId))] = normalizeMetrics(row);
  });

  remarkRows.forEach((row) => {
    const remark = normalizeRemark(row.remark);
    if (remark) {
      result.remarks[remark] = normalizeMetrics(row);
    }
  });

  return result;
};

const getTodayRealtimeAggregate = async () => {
  const pendingStart = await getPendingRealtimeStart();
  const now = new Date();

  if (pendingStart > now) {
    return {
      summary: buildEmptyMetrics(),
      hours: {},
      accounts: {},
      sites: {},
      remarks: {},
    };
  }

  try {
    return await getRealtimeAggregateFromRaw(pendingStart, now);
  } catch (error) {
    logger.warn('load realtime aggregate from raw failed:', error.message);
  }

  const redisAggregate = await getRealtimeAggregateFromRedis();
  if (redisAggregate) {
    return redisAggregate;
  }

  return {
    summary: buildEmptyMetrics(),
    hours: {},
    accounts: {},
    sites: {},
    remarks: {},
  };
};

const queryMysqlSummaryMetrics = async (startDate, endDate) => {
  const replacements = {};
  const whereSql = buildStatDateWhere(startDate, endDate, replacements);
  const row = await queryOne(
    `
      SELECT
        COALESCE(SUM(request_count), 0) AS requestCount,
        COALESCE(SUM(success_count), 0) AS successCount,
        COALESCE(SUM(fail_count), 0) AS failCount,
        COALESCE(SUM(total_cost), 0) AS totalCost
      FROM proxy_log_daily_stats
      ${whereSql}
    `,
    replacements,
  );

  return normalizeMetrics(row);
};

const queryMysqlAccountMetrics = async (startDate, endDate) => {
  const replacements = {};
  const whereSql = buildStatDateWhere(startDate, endDate, replacements);

  return queryAll(
    `
      SELECT
        account_id AS accountId,
        COALESCE(SUM(request_count), 0) AS requestCount,
        COALESCE(SUM(success_count), 0) AS successCount,
        COALESCE(SUM(fail_count), 0) AS failCount,
        COALESCE(SUM(total_cost), 0) AS totalCost
      FROM proxy_log_daily_stats
      ${whereSql ? `${whereSql} AND` : 'WHERE'} account_id IS NOT NULL
      GROUP BY account_id
    `,
    replacements,
  );
};

const queryMysqlSiteMetrics = async (startDate, endDate) => {
  const replacements = {};
  const whereSql = buildStatDateWhere(startDate, endDate, replacements);

  return queryAll(
    `
      SELECT
        site_id AS siteId,
        COALESCE(SUM(request_count), 0) AS requestCount,
        COALESCE(SUM(success_count), 0) AS successCount,
        COALESCE(SUM(fail_count), 0) AS failCount,
        COALESCE(SUM(total_cost), 0) AS totalCost
      FROM proxy_log_daily_stats
      ${whereSql}
      GROUP BY site_id
    `,
    replacements,
  );
};

const queryMysqlRemarkMetrics = async (startDate, endDate) => {
  const replacements = {};
  const whereSql = buildStatDateWhere(startDate, endDate, replacements);

  return queryAll(
    `
      SELECT
        TRIM(remark) AS remark,
        COALESCE(SUM(request_count), 0) AS requestCount,
        COALESCE(SUM(success_count), 0) AS successCount,
        COALESCE(SUM(fail_count), 0) AS failCount,
        COALESCE(SUM(total_cost), 0) AS totalCost
      FROM proxy_log_remark_daily_stats
      ${whereSql}
      GROUP BY TRIM(remark)
    `,
    replacements,
  );
};

const queryMysqlHourlyMetrics = async (startDate, endDate) => {
  const replacements = {};
  const whereSql = buildStatDateWhere(startDate, endDate, replacements);

  return queryAll(
    `
      SELECT
        stat_hour AS statHour,
        COALESCE(SUM(request_count), 0) AS requestCount,
        COALESCE(SUM(success_count), 0) AS successCount,
        COALESCE(SUM(fail_count), 0) AS failCount,
        COALESCE(SUM(total_cost), 0) AS totalCost
      FROM proxy_log_hourly_stats
      ${whereSql}
      GROUP BY stat_hour
      ORDER BY stat_hour ASC
    `,
    replacements,
  );
};

const queryMysqlChartMetrics = async (startDate, endDate) => {
  const replacements = {};
  const whereSql = buildStatDateWhere(startDate, endDate, replacements);

  return queryAll(
    `
      SELECT
        stat_date AS statDate,
        COALESCE(SUM(request_count), 0) AS requestCount,
        COALESCE(SUM(success_count), 0) AS successCount,
        COALESCE(SUM(fail_count), 0) AS failCount,
        COALESCE(SUM(total_cost), 0) AS totalCost
      FROM proxy_log_daily_stats
      ${whereSql}
      GROUP BY stat_date
      ORDER BY stat_date ASC
    `,
    replacements,
  );
};

const mergeMetricsMaps = (mysqlRows, realtimeRows, keyGetter) => {
  const resultMap = {};

  mysqlRows.forEach((row) => {
    const key = keyGetter(row);
    resultMap[key] = normalizeMetrics(row);
  });

  Object.entries(realtimeRows).forEach(([key, metrics]) => {
    if (!resultMap[key]) {
      resultMap[key] = buildEmptyMetrics();
    }

    addMetricsInPlace(resultMap[key], metrics);
  });

  return resultMap;
};

const getOverviewData = async () => {
  const now = new Date();
  const todayStr = getChinaDateStr(now);
  const todayStart = getChinaDayStart(todayStr);
  const todayEnd = getChinaDayEnd(todayStr);
  const yesterdayStart = addDays(todayStart, -1);
  const yesterdayEnd = addDays(todayEnd, -1);
  const weekStart = addDays(todayStart, -6);
  const monthStart = addDays(todayStart, -29);
  const realtimeAggregate = await getTodayRealtimeAggregate();

  const [todayMetrics, yesterdayMetrics, weekMetrics, monthMetrics, totalMetrics, totalAccounts, activeAccounts, abnormalAccounts, lowBalanceAccounts] = await Promise.all([
    queryMysqlSummaryMetrics(todayStart, todayEnd),
    queryMysqlSummaryMetrics(yesterdayStart, yesterdayEnd),
    queryMysqlSummaryMetrics(weekStart, todayEnd),
    queryMysqlSummaryMetrics(monthStart, todayEnd),
    queryMysqlSummaryMetrics(null, null),
    Account.count(),
    Account.count({ where: { status: 1 } }),
    Account.count({ where: { failCount: { [Op.gte]: 3 }, status: 1 } }),
    Account.count({ where: { balance: { [Op.lt]: 10 }, status: 1, siteId: { [Op.ne]: null } } }),
  ]);

  addMetricsInPlace(todayMetrics, realtimeAggregate.summary);
  addMetricsInPlace(weekMetrics, realtimeAggregate.summary);
  addMetricsInPlace(monthMetrics, realtimeAggregate.summary);
  addMetricsInPlace(totalMetrics, realtimeAggregate.summary);

  return {
    today: {
      requests: todayMetrics.requestCount,
      successCount: todayMetrics.successCount,
      cost: todayMetrics.totalCost,
    },
    yesterday: {
      requests: yesterdayMetrics.requestCount,
      successCount: yesterdayMetrics.successCount,
      cost: yesterdayMetrics.totalCost,
    },
    week: {
      requests: weekMetrics.requestCount,
      successCount: weekMetrics.successCount,
      cost: weekMetrics.totalCost,
    },
    month: {
      requests: monthMetrics.requestCount,
      successCount: monthMetrics.successCount,
      cost: monthMetrics.totalCost,
    },
    total: {
      requests: totalMetrics.requestCount,
      successCount: totalMetrics.successCount,
      cost: totalMetrics.totalCost,
    },
    accounts: {
      total: totalAccounts,
      active: activeAccounts,
      abnormal: abnormalAccounts,
      lowBalance: lowBalanceAccounts,
    },
  };
};

const getAccountSuccessRankingData = async (type, limit) => {
  const { startDate, endDate } = getTimeRange(type);
  const includeToday = isDateRangeIncludesToday(startDate, endDate);
  const realtimeAggregate = includeToday ? await getTodayRealtimeAggregate() : null;
  const mysqlRows = await queryMysqlAccountMetrics(startDate, endDate);
  const mergedMetrics = mergeMetricsMaps(mysqlRows, includeToday ? realtimeAggregate.accounts : {}, (row) => String(toInteger(row.accountId)));

  const accountIds = Object.keys(mergedMetrics).map((key) => toInteger(key)).filter((key) => key > 0);
  const accounts = await Account.findAll({
    where: { id: accountIds },
    attributes: ['id', 'name', 'siteId'],
    raw: true,
  });

  const siteIds = [...new Set(accounts.map((item) => item.siteId).filter(Boolean))];
  const sites = await Site.findAll({
    where: { id: siteIds },
    attributes: ['id', 'name'],
    raw: true,
  });

  const accountMap = {};
  accounts.forEach((account) => {
    accountMap[account.id] = account;
  });

  const siteMap = {};
  sites.forEach((site) => {
    siteMap[site.id] = site;
  });

  const list = Object.entries(mergedMetrics)
    .filter(([key]) => toInteger(key) > 0)
    .map(([key, metrics]) => ({
      accountId: toInteger(key),
      accountName: accountMap[toInteger(key)]?.name || '未知账号',
      siteName: accountMap[toInteger(key)]?.siteId
        ? (siteMap[accountMap[toInteger(key)].siteId]?.name || '未知站点')
        : '独立包月',
      totalRequests: metrics.requestCount,
      successCount: metrics.successCount,
      successRate: metrics.requestCount > 0 ? ((metrics.successCount / metrics.requestCount) * 100).toFixed(2) : '0.00',
      totalCost: metrics.totalCost,
    }))
    .sort((left, right) => right.successCount - left.successCount)
    .slice(0, limit);

  const totalMetrics = Object.values(mergedMetrics).reduce((result, metrics) => addMetricsInPlace(result, metrics), buildEmptyMetrics());

  return {
    list,
    total: {
      successCount: totalMetrics.successCount,
      totalRequests: totalMetrics.requestCount,
    },
  };
};

const getAccountFailRankingData = async (type, limit) => {
  const { startDate, endDate } = getTimeRange(type);
  const includeToday = isDateRangeIncludesToday(startDate, endDate);
  const realtimeAggregate = includeToday ? await getTodayRealtimeAggregate() : null;
  const mysqlRows = await queryMysqlAccountMetrics(startDate, endDate);
  const mergedMetrics = mergeMetricsMaps(mysqlRows, includeToday ? realtimeAggregate.accounts : {}, (row) => String(toInteger(row.accountId)));

  const accountIds = Object.keys(mergedMetrics).map((key) => toInteger(key)).filter((key) => key > 0);
  const accounts = await Account.findAll({
    where: { id: accountIds },
    attributes: ['id', 'name', 'siteId', 'failCount'],
    raw: true,
  });

  const accountMap = {};
  accounts.forEach((account) => {
    accountMap[account.id] = account;
  });

  const list = Object.entries(mergedMetrics)
    .filter(([key]) => toInteger(key) > 0)
    .map(([key, metrics]) => ({
      accountId: toInteger(key),
      accountName: accountMap[toInteger(key)]?.name || '未知账号',
      totalRequests: metrics.requestCount,
      failCount: metrics.failCount,
      currentFailCount: accountMap[toInteger(key)]?.failCount || 0,
    }))
    .sort((left, right) => right.failCount - left.failCount)
    .slice(0, limit);

  const totalMetrics = Object.values(mergedMetrics).reduce((result, metrics) => addMetricsInPlace(result, metrics), buildEmptyMetrics());

  return {
    list,
    total: {
      failCount: totalMetrics.failCount,
      totalRequests: totalMetrics.requestCount,
    },
  };
};

const getSiteDistributionData = async (type) => {
  const { startDate, endDate } = getTimeRange(type);
  const includeToday = isDateRangeIncludesToday(startDate, endDate);
  const realtimeAggregate = includeToday ? await getTodayRealtimeAggregate() : null;
  const mysqlRows = await queryMysqlSiteMetrics(startDate, endDate);
  const mergedMetrics = mergeMetricsMaps(mysqlRows, includeToday ? realtimeAggregate.sites : {}, (row) => String(toInteger(row.siteId)));

  const siteIds = Object.keys(mergedMetrics).map((key) => toInteger(key)).filter((key) => key > 0);
  const sites = await Site.findAll({
    where: { id: siteIds },
    attributes: ['id', 'name'],
    raw: true,
  });

  const siteMap = {};
  sites.forEach((site) => {
    siteMap[site.id] = site;
  });

  const list = Object.entries(mergedMetrics)
    .map(([key, metrics]) => {
      const siteId = toInteger(key);
      return {
        siteId: siteId || null,
        siteName: siteId > 0 ? (siteMap[siteId]?.name || '未知站点') : '独立包月',
        totalRequests: metrics.requestCount,
        successCount: metrics.successCount,
        successRate: metrics.requestCount > 0 ? ((metrics.successCount / metrics.requestCount) * 100).toFixed(2) : '0.00',
        totalCost: metrics.totalCost,
      };
    })
    .sort((left, right) => right.totalRequests - left.totalRequests);

  const totalMetrics = Object.values(mergedMetrics).reduce((result, metrics) => addMetricsInPlace(result, metrics), buildEmptyMetrics());

  return {
    list,
    total: {
      totalRequests: totalMetrics.requestCount,
      successCount: totalMetrics.successCount,
    },
  };
};

const getHourlyDistributionData = async (type) => {
  const { startDate, endDate } = getTimeRange(type);
  const includeToday = isDateRangeIncludesToday(startDate, endDate);
  const realtimeAggregate = includeToday ? await getTodayRealtimeAggregate() : null;
  const mysqlRows = await queryMysqlHourlyMetrics(startDate, endDate);
  const mergedMetrics = mergeMetricsMaps(mysqlRows, includeToday ? realtimeAggregate.hours : {}, (row) => String(toInteger(row.statHour)));

  return Array.from({ length: 24 }, (_, hour) => {
    const metrics = mergedMetrics[String(hour)] || buildEmptyMetrics();
    return {
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
      requests: metrics.requestCount,
      successCount: metrics.successCount,
    };
  });
};

const getRemarkRequestRankingData = async (type, limit) => {
  const { startDate, endDate } = getTimeRange(type);
  const includeToday = isDateRangeIncludesToday(startDate, endDate);
  const realtimeAggregate = includeToday ? await getTodayRealtimeAggregate() : null;
  const mysqlRows = await queryMysqlRemarkMetrics(startDate, endDate);
  const mergedMetrics = mergeMetricsMaps(mysqlRows, includeToday ? realtimeAggregate.remarks : {}, (row) => row.remark);

  const list = Object.entries(mergedMetrics)
    .map(([remark, metrics]) => ({
      remark,
      totalRequests: metrics.requestCount,
      successCount: metrics.successCount,
      failCount: metrics.failCount,
    }))
    .sort((left, right) => right.totalRequests - left.totalRequests)
    .slice(0, limit);

  const totalMetrics = Object.values(mergedMetrics).reduce((result, metrics) => addMetricsInPlace(result, metrics), buildEmptyMetrics());

  return {
    list,
    total: {
      totalRequests: totalMetrics.requestCount,
    },
  };
};

const getRemarkCostRankingData = async (type, limit) => {
  const { startDate, endDate } = getTimeRange(type);
  const includeToday = isDateRangeIncludesToday(startDate, endDate);
  const realtimeAggregate = includeToday ? await getTodayRealtimeAggregate() : null;
  const mysqlRows = await queryMysqlRemarkMetrics(startDate, endDate);
  const mergedMetrics = mergeMetricsMaps(mysqlRows, includeToday ? realtimeAggregate.remarks : {}, (row) => row.remark);

  const list = Object.entries(mergedMetrics)
    .map(([remark, metrics]) => ({
      remark,
      totalRequests: metrics.requestCount,
      totalCost: metrics.totalCost,
    }))
    .sort((left, right) => right.totalCost - left.totalCost)
    .slice(0, limit);

  const totalMetrics = Object.values(mergedMetrics).reduce((result, metrics) => addMetricsInPlace(result, metrics), buildEmptyMetrics());

  return {
    list,
    total: {
      totalCost: totalMetrics.totalCost,
    },
  };
};

const getLogStatsData = async (startDateValue, endDateValue) => {
  const todayStr = getChinaDateStr(new Date());
  const todayStart = getChinaDayStart(todayStr);
  const todayEnd = getChinaDayEnd(todayStr);
  const yesterdayStart = addDays(todayStart, -1);
  const yesterdayEnd = addDays(todayEnd, -1);
  const startDate = startDateValue ? getChinaDayStart(startDateValue) : null;
  const endDate = endDateValue ? getChinaDayEnd(endDateValue) : null;
  const includeToday = isDateRangeIncludesToday(startDate, endDate);
  const realtimeAggregate = includeToday ? await getTodayRealtimeAggregate() : null;

  const [totalMetrics, todayMetrics, yesterdayMetrics] = await Promise.all([
    queryMysqlSummaryMetrics(startDate, endDate),
    (!startDate || startDate <= todayEnd) && (!endDate || endDate >= todayStart)
      ? queryMysqlSummaryMetrics(todayStart, todayEnd)
      : Promise.resolve(buildEmptyMetrics()),
    (!startDate || startDate <= yesterdayEnd) && (!endDate || endDate >= yesterdayStart)
      ? queryMysqlSummaryMetrics(yesterdayStart, yesterdayEnd)
      : Promise.resolve(buildEmptyMetrics()),
  ]);

  if (includeToday) {
    addMetricsInPlace(totalMetrics, realtimeAggregate.summary);
    addMetricsInPlace(todayMetrics, realtimeAggregate.summary);
  }

  return {
    totalRequests: totalMetrics.requestCount,
    successRequests: totalMetrics.successCount,
    failRequests: totalMetrics.failCount,
    totalCost: totalMetrics.totalCost,
    todayRequests: todayMetrics.requestCount,
    todaySuccess: todayMetrics.successCount,
    todayCost: todayMetrics.totalCost,
    yesterdayRequests: yesterdayMetrics.requestCount,
    yesterdaySuccess: yesterdayMetrics.successCount,
    yesterdayCost: yesterdayMetrics.totalCost,
    successRate: totalMetrics.requestCount > 0 ? ((totalMetrics.successCount / totalMetrics.requestCount) * 100).toFixed(2) : '0.00',
  };
};

const getLogChartData = async (type) => {
  const { startDate, endDate } = getTimeRange(type);
  const includeToday = isDateRangeIncludesToday(startDate, endDate);
  const realtimeAggregate = includeToday ? await getTodayRealtimeAggregate() : null;
  const rows = await queryMysqlChartMetrics(startDate, endDate);
  const chartMap = {};

  rows.forEach((row) => {
    chartMap[row.statDate] = normalizeMetrics(row);
  });

  if (includeToday && endDate) {
    const todayKey = getChinaDateStr(new Date());
    if (!chartMap[todayKey]) {
      chartMap[todayKey] = buildEmptyMetrics();
    }

    addMetricsInPlace(chartMap[todayKey], realtimeAggregate.summary);
  }

  const chartData = [];
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const dateKey = getChinaDateStr(currentDate);
    const metrics = chartMap[dateKey] || buildEmptyMetrics();
    chartData.push({
      date: dateKey,
      requests: metrics.requestCount,
      successCount: metrics.successCount,
      cost: metrics.totalCost,
    });
    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
  }

  return chartData;
};

const clearStatsCache = async () => {
  await clearStatsQueryCache();
  return true;
};

module.exports = {
  cleanupExpiredLogs,
  clearStatsCache,
  createProxyLog,
  ensureLogStatsConfigDefaults,
  flushClosedBuckets,
  getAccountFailRankingData,
  getAccountSuccessRankingData,
  getHourlyDistributionData,
  getLogChartData,
  getLogStatsData,
  getLogStatsSchedulerConfig,
  getOverviewData,
  getRemarkCostRankingData,
  getRemarkRequestRankingData,
  getSiteDistributionData,
  initializeAggregatedStats,
  syncPendingRealtimeFromRaw,
};


