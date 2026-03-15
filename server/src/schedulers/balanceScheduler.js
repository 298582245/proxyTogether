const cron = require('node-cron');
const SystemConfig = require('../models/SystemConfig');
const balanceService = require('../services/balanceService');
const usageLimitService = require('../services/usageLimitService');
const logger = require('../utils/logger');

let balanceCheckJob = null;
let usageLimitResetJob = null;

/**
 * 启动余额查询定时任务
 */
const startBalanceCheckJob = async () => {
  // 先停止已有的任务
  stopBalanceCheckJob();

  // 获取查询间隔（分钟）
  const interval = await SystemConfig.getValue('balance_check_interval', '30');
  const intervalMinutes = parseInt(interval, 10) || 30;

  // 创建cron表达式：每N分钟执行一次
  const cronExpression = `*/${intervalMinutes} * * * *`;

  logger.info(`启动余额查询定时任务，间隔: ${intervalMinutes} 分钟`);

  balanceCheckJob = cron.schedule(cronExpression, async () => {
    logger.info('定时任务触发: 查询所有账号余额');
    try {
      await balanceService.queryAllBalances();
    } catch (error) {
      logger.error('定时余额查询失败:', error);
    }
  });

  return balanceCheckJob;
};

/**
 * 停止余额查询定时任务
 */
const stopBalanceCheckJob = () => {
  if (balanceCheckJob) {
    balanceCheckJob.stop();
    balanceCheckJob = null;
    logger.info('余额查询定时任务已停止');
  }
};

/**
 * 启动使用限制重置定时任务
 * 每分钟检查一次是否有账号需要重置
 */
const startUsageLimitResetJob = async () => {
  // 先停止已有的任务
  stopUsageLimitResetJob();

  // 每分钟执行一次
  const cronExpression = '* * * * *';

  logger.info('启动使用限制重置定时任务');

  usageLimitResetJob = cron.schedule(cronExpression, async () => {
    try {
      const result = await usageLimitService.resetLimitedAccounts();
      if (result.resetCount > 0) {
        logger.info(`使用限制重置: ${result.resetCount} 个账号已解禁`);
      }
    } catch (error) {
      logger.error('使用限制重置失败:', error);
    }
  });

  return usageLimitResetJob;
};

/**
 * 停止使用限制重置定时任务
 */
const stopUsageLimitResetJob = () => {
  if (usageLimitResetJob) {
    usageLimitResetJob.stop();
    usageLimitResetJob = null;
    logger.info('使用限制重置定时任务已停止');
  }
};

/**
 * 重启余额查询定时任务（用于配置更新后）
 */
const restartBalanceCheckJob = async () => {
  stopBalanceCheckJob();
  return startBalanceCheckJob();
};

/**
 * 初始化所有定时任务
 */
const initSchedulers = async () => {
  await startBalanceCheckJob();
  await startUsageLimitResetJob();
  logger.info('定时任务初始化完成');
};

/**
 * 停止所有定时任务
 */
const stopAllSchedulers = () => {
  stopBalanceCheckJob();
  stopUsageLimitResetJob();
  logger.info('所有定时任务已停止');
};

module.exports = {
  startBalanceCheckJob,
  stopBalanceCheckJob,
  restartBalanceCheckJob,
  startUsageLimitResetJob,
  stopUsageLimitResetJob,
  initSchedulers,
  stopAllSchedulers,
};
