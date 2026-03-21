const { Account, AccountUsageLimit } = require('../models');
const { sequelize } = require('../config/database');
const logger = require('../utils/logger');

const calculateNextResetTime = (limitType, limitDays, resetTime, fromDate = new Date()) => {
  const [hours, minutes, seconds] = String(resetTime || '00:00:00').split(':').map(Number);
  const baseDate = new Date(fromDate);

  const buildResetTime = (date) => {
    const resetDate = new Date(date);
    resetDate.setHours(hours || 0, minutes || 0, seconds || 0, 0);
    return resetDate;
  };

  switch (limitType) {
    case 'daily': {
      const currentReset = buildResetTime(baseDate);
      if (baseDate >= currentReset) {
        currentReset.setDate(currentReset.getDate() + 1);
      }
      return currentReset;
    }
    case 'weekly': {
      const currentWeekReset = buildResetTime(baseDate);
      const dayOfWeek = currentWeekReset.getDay();
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      currentWeekReset.setDate(currentWeekReset.getDate() - diffToMonday);

      if (baseDate >= currentWeekReset) {
        currentWeekReset.setDate(currentWeekReset.getDate() + 7);
      }

      return currentWeekReset;
    }
    case 'monthly': {
      const currentMonthReset = buildResetTime(baseDate);
      currentMonthReset.setDate(1);

      if (baseDate >= currentMonthReset) {
        currentMonthReset.setMonth(currentMonthReset.getMonth() + 1, 1);
      }

      return currentMonthReset;
    }
    case 'custom': {
      const nextReset = buildResetTime(baseDate);
      nextReset.setDate(nextReset.getDate() + (limitDays || 1));
      return nextReset;
    }
    default:
      return buildResetTime(baseDate);
  }
};

const normalizeUsageLimitState = (usageLimit, now) => {
  if (!usageLimit.periodStart) {
    return {
      currentCount: 0,
      periodStart: now,
      isLimited: false,
    };
  }

  const periodEnd = calculateNextResetTime(
    usageLimit.limitType,
    usageLimit.limitDays,
    usageLimit.resetTime,
    usageLimit.periodStart
  );

  if (now >= periodEnd) {
    return {
      currentCount: 0,
      periodStart: now,
      isLimited: false,
    };
  }

  return {
    currentCount: usageLimit.currentCount,
    periodStart: usageLimit.periodStart,
    isLimited: usageLimit.isLimited,
  };
};

const syncUsageLimitState = async (usageLimit, normalizedState, transaction) => {
  if (
    usageLimit.currentCount !== normalizedState.currentCount ||
    Number(new Date(usageLimit.periodStart || 0)) !== Number(new Date(normalizedState.periodStart || 0)) ||
    usageLimit.isLimited !== normalizedState.isLimited
  ) {
    await usageLimit.update(normalizedState, { transaction });
  }
};

const disableAccountByUsageLimit = async (accountId, transaction) => {
  await Account.update(
    { status: 0 },
    { where: { id: accountId }, transaction }
  );
};

const checkUsageLimit = async (accountId) => {
  try {
    const usageLimit = await AccountUsageLimit.findOne({
      where: { accountId },
    });

    if (!usageLimit) {
      return { limited: false, reason: null };
    }

    const now = new Date();
    const normalizedState = normalizeUsageLimitState(usageLimit, now);
    await syncUsageLimitState(usageLimit, normalizedState);

    if (normalizedState.currentCount >= usageLimit.limitCount) {
      return {
        limited: true,
        reason: `已达到周期使用上限(${normalizedState.currentCount}/${usageLimit.limitCount})`,
      };
    }

    return { limited: false, reason: null };
  } catch (error) {
    logger.error('检查使用限制失败:', error);
    return { limited: false, reason: null };
  }
};

const reserveUsageCount = async (accountId) => {
  try {
    return await sequelize.transaction(async (transaction) => {
      const usageLimit = await AccountUsageLimit.findOne({
        where: { accountId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!usageLimit) {
        return {
          reserved: true,
          hasUsageLimit: false,
          reachedLimit: false,
          reason: null,
        };
      }

      const now = new Date();
      const normalizedState = normalizeUsageLimitState(usageLimit, now);
      await syncUsageLimitState(usageLimit, normalizedState, transaction);

      if (normalizedState.currentCount >= usageLimit.limitCount) {
        await usageLimit.update({ isLimited: true }, { transaction });
        await disableAccountByUsageLimit(accountId, transaction);

        return {
          reserved: false,
          hasUsageLimit: true,
          reachedLimit: true,
          reason: `已达到周期使用上限(${normalizedState.currentCount}/${usageLimit.limitCount})`,
        };
      }

      const nextCount = normalizedState.currentCount + 1;
      await usageLimit.update({
        currentCount: nextCount,
        periodStart: normalizedState.periodStart,
        isLimited: false,
      }, { transaction });

      return {
        reserved: true,
        hasUsageLimit: true,
        reachedLimit: nextCount >= usageLimit.limitCount,
        reason: null,
      };
    });
  } catch (error) {
    logger.error('预占使用次数失败:', error);
    return {
      reserved: false,
      hasUsageLimit: true,
      reachedLimit: false,
      reason: '使用次数检查异常',
    };
  }
};

const confirmUsageCount = async (accountId, reservationResult = null) => {
  if (!reservationResult?.hasUsageLimit || !reservationResult.reachedLimit) {
    return true;
  }

  try {
    await sequelize.transaction(async (transaction) => {
      const usageLimit = await AccountUsageLimit.findOne({
        where: { accountId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!usageLimit) {
        return;
      }

      if (usageLimit.currentCount >= usageLimit.limitCount) {
        await usageLimit.update({ isLimited: true }, { transaction });
        await disableAccountByUsageLimit(accountId, transaction);
      }
    });

    return true;
  } catch (error) {
    logger.error('确认使用次数失败:', error);
    return false;
  }
};

const rollbackUsageCount = async (accountId, reservationResult = null) => {
  if (!reservationResult?.hasUsageLimit) {
    return true;
  }

  try {
    await sequelize.transaction(async (transaction) => {
      const usageLimit = await AccountUsageLimit.findOne({
        where: { accountId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!usageLimit) {
        return;
      }

      const nextCount = Math.max((usageLimit.currentCount || 0) - 1, 0);
      await usageLimit.update({
        currentCount: nextCount,
        isLimited: false,
      }, { transaction });
    });

    return true;
  } catch (error) {
    logger.error('回滚使用次数失败:', error);
    return false;
  }
};

const incrementUsageCount = async (accountId) => {
  const reservationResult = await reserveUsageCount(accountId);
  if (!reservationResult.reserved) {
    return false;
  }

  return confirmUsageCount(accountId, reservationResult);
};

const resetLimitedAccounts = async () => {
  try {
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
      const periodEnd = calculateNextResetTime(
        usageLimit.limitType,
        usageLimit.limitDays,
        usageLimit.resetTime,
        usageLimit.periodStart
      );

      if (now >= periodEnd) {
        await usageLimit.update({
          currentCount: 0,
          periodStart: now,
          isLimited: false,
        });

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

const setUsageLimit = async (accountId, config) => {
  const { limitType, limitCount, limitDays, resetTime } = config;

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

const removeUsageLimit = async (accountId) => {
  const result = await AccountUsageLimit.destroy({
    where: { accountId },
  });
  return result > 0;
};

module.exports = {
  checkUsageLimit,
  reserveUsageCount,
  confirmUsageCount,
  rollbackUsageCount,
  incrementUsageCount,
  resetLimitedAccounts,
  getUsageLimitInfo,
  setUsageLimit,
  removeUsageLimit,
  calculateNextResetTime,
};
