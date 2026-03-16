const cron = require('node-cron');
const SystemConfig = require('../models/SystemConfig');
const balanceService = require('../services/balanceService');
const logStatsService = require('../services/logStatsService');
const usageLimitService = require('../services/usageLimitService');
const logger = require('../utils/logger');

let balanceCheckJob = null;
let usageLimitResetJob = null;
let logStatsFlushJob = null;
let logCleanupJob = null;

const normalizeInteger = (value, defaultValue, minValue, maxValue) => {
  const parsedValue = Number.parseInt(value, 10);
  if (Number.isNaN(parsedValue)) {
    return defaultValue;
  }

  return Math.min(Math.max(parsedValue, minValue), maxValue);
};

const buildIntervalCron = (intervalMinutes) => {
  if (intervalMinutes <= 1) {
    return '* * * * *';
  }

  return `1-59/${intervalMinutes} * * * *`;
};

const startBalanceCheckJob = async () => {
  stopBalanceCheckJob();

  const interval = await SystemConfig.getValue('balance_check_interval', '30');
  const intervalMinutes = normalizeInteger(interval, 30, 1, 59);
  const cronExpression = `*/${intervalMinutes} * * * *`;

  logger.info(`balance check job started, interval=${intervalMinutes}m`);

  balanceCheckJob = cron.schedule(cronExpression, async () => {
    logger.info('balance check job triggered');
    try {
      await balanceService.queryAllBalances();
    } catch (error) {
      logger.error('balance check job failed:', error);
    }
  });

  return balanceCheckJob;
};

const stopBalanceCheckJob = () => {
  if (balanceCheckJob) {
    balanceCheckJob.stop();
    balanceCheckJob = null;
    logger.info('balance check job stopped');
  }
};

const startUsageLimitResetJob = async () => {
  stopUsageLimitResetJob();

  usageLimitResetJob = cron.schedule('* * * * *', async () => {
    try {
      const result = await usageLimitService.resetLimitedAccounts();
      if (result.resetCount > 0) {
        logger.info(`usage limit reset completed: ${result.resetCount}`);
      }
    } catch (error) {
      logger.error('usage limit reset failed:', error);
    }
  });

  return usageLimitResetJob;
};

const stopUsageLimitResetJob = () => {
  if (usageLimitResetJob) {
    usageLimitResetJob.stop();
    usageLimitResetJob = null;
    logger.info('usage limit reset job stopped');
  }
};

const startLogStatsFlushJob = async () => {
  stopLogStatsFlushJob();
  await logStatsService.ensureLogStatsConfigDefaults();
  await logStatsService.initializeAggregatedStats();

  const { flushIntervalMinutes } = await logStatsService.getLogStatsSchedulerConfig();
  const cronExpression = buildIntervalCron(flushIntervalMinutes);

  logger.info(`log stats flush job started, interval=${flushIntervalMinutes}m`);

  logStatsFlushJob = cron.schedule(cronExpression, async () => {
    try {
      const flushedCount = await logStatsService.flushClosedBuckets();
      if (flushedCount > 0) {
        logger.info(`log stats flush completed: ${flushedCount}`);
      }
    } catch (error) {
      logger.error('log stats flush failed:', error);
    }
  });

  return logStatsFlushJob;
};

const stopLogStatsFlushJob = () => {
  if (logStatsFlushJob) {
    logStatsFlushJob.stop();
    logStatsFlushJob = null;
    logger.info('log stats flush job stopped');
  }
};

const startLogCleanupJob = async () => {
  stopLogCleanupJob();
  await logStatsService.ensureLogStatsConfigDefaults();

  const { cleanupHour, cleanupMinute } = await logStatsService.getLogStatsSchedulerConfig();
  const cronExpression = `${cleanupMinute} ${cleanupHour} * * *`;

  logger.info(`log cleanup job started, time=${String(cleanupHour).padStart(2, '0')}:${String(cleanupMinute).padStart(2, '0')}`);

  logCleanupJob = cron.schedule(cronExpression, async () => {
    try {
      const deletedCount = await logStatsService.cleanupExpiredLogs();
      if (deletedCount > 0) {
        logger.info(`proxy log cleanup completed: ${deletedCount}`);
      }
    } catch (error) {
      logger.error('proxy log cleanup failed:', error);
    }
  });

  return logCleanupJob;
};

const stopLogCleanupJob = () => {
  if (logCleanupJob) {
    logCleanupJob.stop();
    logCleanupJob = null;
    logger.info('log cleanup job stopped');
  }
};

const restartBalanceCheckJob = async () => {
  stopBalanceCheckJob();
  return startBalanceCheckJob();
};

const restartLogStatsJobs = async () => {
  stopLogStatsFlushJob();
  stopLogCleanupJob();
  await startLogStatsFlushJob();
  await startLogCleanupJob();
  return true;
};

const initSchedulers = async () => {
  await startBalanceCheckJob();
  await startUsageLimitResetJob();

  try {
    await startLogStatsFlushJob();
  } catch (error) {
    logger.error('log stats flush job init failed:', error);
  }

  try {
    await startLogCleanupJob();
  } catch (error) {
    logger.error('log cleanup job init failed:', error);
  }

  logger.info('all scheduler jobs initialized');
};

const stopAllSchedulers = () => {
  stopBalanceCheckJob();
  stopUsageLimitResetJob();
  stopLogStatsFlushJob();
  stopLogCleanupJob();
  logger.info('all scheduler jobs stopped');
};

module.exports = {
  initSchedulers,
  restartBalanceCheckJob,
  restartLogStatsJobs,
  startBalanceCheckJob,
  startLogCleanupJob,
  startLogStatsFlushJob,
  startUsageLimitResetJob,
  stopAllSchedulers,
  stopBalanceCheckJob,
  stopLogCleanupJob,
  stopLogStatsFlushJob,
  stopUsageLimitResetJob,
};
