const cron = require('node-cron');
const SystemConfig = require('../models/SystemConfig');
const balanceService = require('../services/balanceService');
const logStatsService = require('../services/logStatsService');
const proxyKeepaliveService = require('../services/proxyKeepaliveService');
const statsNewService = require('../services/statsNewService');
const usageLimitService = require('../services/usageLimitService');
const logger = require('../utils/logger');

let balanceCheckJob = null;
let usageLimitResetJob = null;
let logStatsFlushJob = null;
let logCleanupJob = null;
let dailySettlementJob = null;
let monthlySettlementJob = null;
let proxyKeepaliveJob = null;

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

const startProxyKeepaliveJob = async () => {
  stopProxyKeepaliveJob();
  await proxyKeepaliveService.ensureProxyKeepaliveConfigDefaults();

  const { checkHour, checkMinute } = await proxyKeepaliveService.getConfig();
  const cronExpression = `${checkMinute} ${checkHour} * * *`;

  logger.info(`proxy keepalive job started, time=${String(checkHour).padStart(2, '0')}:${String(checkMinute).padStart(2, '0')}`);

  proxyKeepaliveJob = cron.schedule(cronExpression, async () => {
    try {
      const result = await proxyKeepaliveService.runProxyKeepalive();
      if (result.skipped) {
        logger.info(`proxy keepalive job skipped: ${result.reason}`);
        return;
      }

      logger.info(`proxy keepalive job completed: total=${result.total}, success=${result.successCount}, fail=${result.failCount}`);
    } catch (error) {
      logger.error('proxy keepalive job failed:', error);
    }
  });

  return proxyKeepaliveJob;
};

const stopProxyKeepaliveJob = () => {
  if (proxyKeepaliveJob) {
    proxyKeepaliveJob.stop();
    proxyKeepaliveJob = null;
    logger.info('proxy keepalive job stopped');
  }
};

const startDailySettlementJob = async () => {
  stopDailySettlementJob();

  // 每天 0:05 执行，将昨天的数据刷新到 daily_stats
  dailySettlementJob = cron.schedule('5 0 * * *', async () => {
    logger.info('daily settlement job triggered');
    try {
      const result = await statsNewService.dailySettlement();
      logger.info(`daily settlement completed: ${result}`);
    } catch (error) {
      logger.error('daily settlement failed:', error);
    }
  });

  logger.info('daily settlement job started (0:05 daily)');
  return dailySettlementJob;
};

const stopDailySettlementJob = () => {
  if (dailySettlementJob) {
    dailySettlementJob.stop();
    dailySettlementJob = null;
    logger.info('daily settlement job stopped');
  }
};

const startMonthlySettlementJob = async () => {
  stopMonthlySettlementJob();

  // 每月 1 号 0:10 执行，聚合上月数据到 monthly_stats
  monthlySettlementJob = cron.schedule('10 0 1 * *', async () => {
    logger.info('monthly settlement job triggered');
    try {
      const result = await statsNewService.monthlySettlement();
      logger.info(`monthly settlement completed: ${result}`);
    } catch (error) {
      logger.error('monthly settlement failed:', error);
    }
  });

  logger.info('monthly settlement job started (0:10 on 1st of each month)');
  return monthlySettlementJob;
};

const stopMonthlySettlementJob = () => {
  if (monthlySettlementJob) {
    monthlySettlementJob.stop();
    monthlySettlementJob = null;
    logger.info('monthly settlement job stopped');
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

const restartProxyKeepaliveJob = async () => {
  stopProxyKeepaliveJob();
  return startProxyKeepaliveJob();
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

  try {
    await startDailySettlementJob();
  } catch (error) {
    logger.error('daily settlement job init failed:', error);
  }

  try {
    await startMonthlySettlementJob();
  } catch (error) {
    logger.error('monthly settlement job init failed:', error);
  }

  try {
    await startProxyKeepaliveJob();
  } catch (error) {
    logger.error('proxy keepalive job init failed:', error);
  }

  logger.info('all scheduler jobs initialized');
};

const stopAllSchedulers = () => {
  stopBalanceCheckJob();
  stopUsageLimitResetJob();
  stopLogStatsFlushJob();
  stopLogCleanupJob();
  stopDailySettlementJob();
  stopMonthlySettlementJob();
  stopProxyKeepaliveJob();
  logger.info('all scheduler jobs stopped');
};

module.exports = {
  initSchedulers,
  restartBalanceCheckJob,
  restartLogStatsJobs,
  restartProxyKeepaliveJob,
  startBalanceCheckJob,
  startDailySettlementJob,
  startLogCleanupJob,
  startLogStatsFlushJob,
  startMonthlySettlementJob,
  startProxyKeepaliveJob,
  startUsageLimitResetJob,
  stopAllSchedulers,
  stopBalanceCheckJob,
  stopDailySettlementJob,
  stopLogCleanupJob,
  stopLogStatsFlushJob,
  stopMonthlySettlementJob,
  stopProxyKeepaliveJob,
  stopUsageLimitResetJob,
};
