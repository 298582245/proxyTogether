const AccountUsageLimit = require('../models/AccountUsageLimit');
const Account = require('../models/Account');
const logger = require('../utils/logger');

/**
 * 账号使用次数限制服务
 */

/**
 * 获取中国时区的当前时间
 */
const getChinaNow = () => {
  const TIMEZONE_OFFSET = 8 * 60 * 60 * 1000;
  return new Date(Date.now() + TIMEZONE_OFFSET);
};

/**
 * 计算下一个重置时间
 * @param {string} limitType - 限制类型
 * @param {number} limitDays - 自定义天数
 * @param {string} resetTime - 重置时间点 HH:mm:ss
 * @param {Date} fromDate - 计算起点时间
 * @returns {Date} 下一个重置时间
 */
const calculateNextResetTime = (limitType, limitDays, resetTime, fromDate = new Date()) => {
  const TIMEZONE_OFFSET = 8 * 60 * 60 * 1000;
  const chinaTime = new Date(fromDate.getTime() + TIMEZONE_OFFSET);

  // 解析重置时间
  const [hours, minutes, seconds] = resetTime.split(':').map(Number);

  // 创建今天的重置时间点（中国时区）
  const todayReset = new Date(chinaTime);
  todayReset.setUTCHours(hours - 8, minutes, seconds, 0); // 转换为UTC

  let nextReset;

  switch (limitType) {
    case 'daily':
      // 每天：今天重置时间已过则用明天
      if (fromDate >= todayReset) {
        nextReset = new Date(todayReset);
        nextReset.setUTCDate(nextReset.getUTCDate() + 1);
      } else {
        nextReset = todayReset;
      }
      break;

    case 'weekly':
      // 每周：计算到下一个周一的重置时间
      const dayOfWeek = chinaTime.getUTCDay();
      const daysUntilMonday = (8 - dayOfWeek) % 7 || 7;
      nextReset = new Date(todayReset);
      nextReset.setUTCDate(nextReset.getUTCDate() + daysUntilMonday);
      break;

    case 'monthly':
      // 每月：计算到下个月1号的重置时间
      nextReset = new Date(todayReset);
      nextReset.setUTCMonth(nextReset.getUTCMonth() + 1, 1);
      break;

    case 'custom':
      // 自定义天数
      const days = limitDays || 1;
      nextReset = new Date(todayReset);
      nextReset.setUTCDate(nextReset.getUTCDate() + days);
      break;

    default:
      nextReset = todayReset;
  }

  return nextReset;
};

/**
 * 检查账号是否达到使用限制
 * @param {number} accountId - 账号ID
 * @returns {Promise<{limited: boolean, reason: string}>}
 */
const checkUsageLimit = async (accountId) => {
  try {
    const usageLimit = await AccountUsageLimit.findOne({
      where: { accountId },
    });

    if (!usageLimit) {
      return { limited: false, reason: null };
    }

    // 检查是否需要重置周期
    const now = new Date();
    const periodEnd = calculateNextResetTime(
      usageLimit.limitType,
      usageLimit.limitDays,
      usageLimit.resetTime,
      usageLimit.periodStart || now
    );

    // 如果当前时间超过了周期结束时间，重置计数
    if (now >= periodEnd) {
      await usageLimit.update({
        currentCount: 0,
        periodStart: now,
        isLimited: false,
      });
      return { limited: false, reason: null };
    }

    // 检查是否达到限制
    if (usageLimit.currentCount >= usageLimit.limitCount) {
      return {
        limited: true,
        reason: `已达到周期使用上限 (${usageLimit.currentCount}/${usageLimit.limitCount})`,
      };
    }

    return { limited: false, reason: null };
  } catch (error) {
    logger.error('检查使用限制失败:', error);
    // 出错时不限制，避免影响正常使用
    return { limited: false, reason: null };
  }
};

/**
 * 增加使用次数
 * @param {number} accountId - 账号ID
 * @returns {Promise<boolean>} 是否成功
 */
const incrementUsageCount = async (accountId) => {
  try {
    const usageLimit = await AccountUsageLimit.findOne({
      where: { accountId },
    });

    if (!usageLimit) {
      return true; // 没有限制配置，直接返回成功
    }

    const now = new Date();

    // 如果没有周期开始时间，初始化
    if (!usageLimit.periodStart) {
      await usageLimit.update({
        currentCount: 1,
        periodStart: now,
      });
      return true;
    }

    // 检查是否需要重置周期
    const periodEnd = calculateNextResetTime(
      usageLimit.limitType,
      usageLimit.limitDays,
      usageLimit.resetTime,
      usageLimit.periodStart
    );

    if (now >= periodEnd) {
      // 重置周期
      await usageLimit.update({
        currentCount: 1,
        periodStart: now,
        isLimited: false,
      });
    } else {
      // 增加计数
      const newCount = usageLimit.currentCount + 1;

      // 检查是否达到限制
      if (newCount >= usageLimit.limitCount) {
        await usageLimit.update({
          currentCount: newCount,
          isLimited: true,
        });

        // 禁用账号
        await Account.update(
          { status: 0 },
          { where: { id: accountId } }
        );

        logger.info(`账号 ${accountId} 已达到使用限制 ${newCount}/${usageLimit.limitCount}，已自动禁用`);
      } else {
        await usageLimit.update({
          currentCount: newCount,
        });
      }
    }

    return true;
  } catch (error) {
    logger.error('增加使用次数失败:', error);
    return false;
  }
};

/**
 * 重置达到限制的账号
 * 在定时任务中调用，检查是否满足解禁条件
 * @returns {Promise<{resetCount: number, details: Array}>}
 */
const resetLimitedAccounts = async () => {
  try {
    // 查找所有因使用限制被禁用的账号
    const limitedAccounts = await AccountUsageLimit.findAll({
      where: { isLimited: true },
      include: [{
        model: Account,
        as: 'account',
        where: { status: 0 },
      }],
    });

    const resetDetails = [];
    const now = new Date();

    for (const usageLimit of limitedAccounts) {
      // 计算周期结束时间
      const periodEnd = calculateNextResetTime(
        usageLimit.limitType,
        usageLimit.limitDays,
        usageLimit.resetTime,
        usageLimit.periodStart
      );

      // 如果当前时间已超过周期结束时间，重置
      if (now >= periodEnd) {
        // 重置使用限制
        await usageLimit.update({
          currentCount: 0,
          periodStart: now,
          isLimited: false,
        });

        // 启用账号
        await Account.update(
          { status: 1, failCount: 0 },
          { where: { id: usageLimit.accountId } }
        );

        const accountName = usageLimit.account?.name || usageLimit.accountId;
        resetDetails.push({
          accountId: usageLimit.accountId,
          accountName,
          limitType: usageLimit.limitType,
        });

        logger.info(`账号 ${accountName} 使用限制周期已重置，已重新启用`);
      }
    }

    return {
      resetCount: resetDetails.length,
      details: resetDetails,
    };
  } catch (error) {
    logger.error('重置限制账号失败:', error);
    return { resetCount: 0, details: [] };
  }
};

/**
 * 获取账号的使用限制信息
 * @param {number} accountId - 账号ID
 */
const getUsageLimitInfo = async (accountId) => {
  try {
    const usageLimit = await AccountUsageLimit.findOne({
      where: { accountId },
    });

    if (!usageLimit) {
      return null;
    }

    const now = new Date();
    const periodEnd = calculateNextResetTime(
      usageLimit.limitType,
      usageLimit.limitDays,
      usageLimit.resetTime,
      usageLimit.periodStart || now
    );

    return {
      limitType: usageLimit.limitType,
      limitCount: usageLimit.limitCount,
      limitDays: usageLimit.limitDays,
      currentCount: usageLimit.currentCount,
      remainingCount: Math.max(0, usageLimit.limitCount - usageLimit.currentCount),
      periodStart: usageLimit.periodStart,
      periodEnd,
      resetTime: usageLimit.resetTime,
      isLimited: usageLimit.isLimited,
    };
  } catch (error) {
    logger.error('获取使用限制信息失败:', error);
    return null;
  }
};

/**
 * 设置账号的使用限制
 * @param {number} accountId - 账号ID
 * @param {object} config - 限制配置
 */
const setUsageLimit = async (accountId, config) => {
  const { limitType, limitCount, limitDays, resetTime } = config;

  // 验证参数
  if (!['daily', 'weekly', 'monthly', 'custom'].includes(limitType)) {
    throw new Error('无效的限制类型');
  }

  if (!limitCount || limitCount < 1) {
    throw new Error('限制次数必须大于0');
  }

  if (limitType === 'custom' && (!limitDays || limitDays < 1)) {
    throw new Error('自定义天数必须大于0');
  }

  const data = {
    accountId,
    limitType,
    limitCount,
    limitDays: limitType === 'custom' ? limitDays : null,
    resetTime: resetTime || '00:00:00',
    periodStart: new Date(),
    currentCount: 0,
    isLimited: false,
  };

  const [usageLimit, created] = await AccountUsageLimit.findOrCreate({
    where: { accountId },
    defaults: data,
  });

  if (!created) {
    await usageLimit.update(data);
  }

  return usageLimit;
};

/**
 * 删除账号的使用限制
 * @param {number} accountId - 账号ID
 */
const removeUsageLimit = async (accountId) => {
  const result = await AccountUsageLimit.destroy({
    where: { accountId },
  });
  return result > 0;
};

module.exports = {
  checkUsageLimit,
  incrementUsageCount,
  resetLimitedAccounts,
  getUsageLimitInfo,
  setUsageLimit,
  removeUsageLimit,
  calculateNextResetTime,
};
