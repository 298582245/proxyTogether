const Account = require('../models/Account');
const AccountUsageLimit = require('../models/AccountUsageLimit');
const usageLimitService = require('../services/usageLimitService');
const logger = require('../utils/logger');

/**
 * 获取账号的使用限制配置
 */
const getUsageLimit = async (req, res) => {
  try {
    const { accountId } = req.params;

    const usageLimit = await AccountUsageLimit.findOne({
      where: { accountId },
    });

    if (!usageLimit) {
      return res.json({
        success: true,
        data: null,
        message: '该账号未配置使用限制',
      });
    }

    // 获取详细的使用限制信息
    const info = await usageLimitService.getUsageLimitInfo(accountId);

    res.json({
      success: true,
      data: {
        ...usageLimit.toJSON(),
        ...info,
      },
    });
  } catch (error) {
    logger.error('获取使用限制失败:', error);
    res.status(500).json({ success: false, message: '获取使用限制失败' });
  }
};

/**
 * 设置账号的使用限制
 */
const setUsageLimit = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { limitType, limitCount, limitDays, resetTime } = req.body;

    // 检查账号是否存在
    const account = await Account.findByPk(accountId);
    if (!account) {
      return res.status(404).json({ success: false, message: '账号不存在' });
    }

    const usageLimit = await usageLimitService.setUsageLimit(accountId, {
      limitType,
      limitCount,
      limitDays,
      resetTime,
    });

    logger.info(`设置账号 ${account.name} 使用限制: ${limitType}, 次数: ${limitCount}`);

    res.json({
      success: true,
      data: usageLimit,
      message: '设置使用限制成功',
    });
  } catch (error) {
    logger.error('设置使用限制失败:', error);
    res.status(500).json({ success: false, message: error.message || '设置使用限制失败' });
  }
};

/**
 * 删除账号的使用限制
 */
const removeUsageLimit = async (req, res) => {
  try {
    const { accountId } = req.params;

    // 检查账号是否存在
    const account = await Account.findByPk(accountId);
    if (!account) {
      return res.status(404).json({ success: false, message: '账号不存在' });
    }

    const removed = await usageLimitService.removeUsageLimit(accountId);

    if (removed) {
      // 如果账号因使用限制被禁用，恢复账号状态
      if (account.status === 0) {
        await Account.update(
          { status: 1, failCount: 0 },
          { where: { id: accountId } }
        );
      }
      logger.info(`删除账号 ${account.name} 的使用限制`);
      res.json({ success: true, message: '删除使用限制成功' });
    } else {
      res.json({ success: true, message: '该账号未配置使用限制' });
    }
  } catch (error) {
    logger.error('删除使用限制失败:', error);
    res.status(500).json({ success: false, message: '删除使用限制失败' });
  }
};

/**
 * 重置账号的使用计数（手动重置）
 */
const resetUsageCount = async (req, res) => {
  try {
    const { accountId } = req.params;

    const usageLimit = await AccountUsageLimit.findOne({
      where: { accountId },
    });

    if (!usageLimit) {
      return res.status(404).json({ success: false, message: '该账号未配置使用限制' });
    }

    // 重置计数
    await usageLimit.update({
      currentCount: 0,
      periodStart: new Date(),
      isLimited: false,
    });

    // 如果账号因使用限制被禁用，恢复账号状态
    const account = await Account.findByPk(accountId);
    if (account && account.status === 0) {
      await Account.update(
        { status: 1, failCount: 0 },
        { where: { id: accountId } }
      );
    }

    logger.info(`手动重置账号 ${accountId} 的使用计数`);

    res.json({ success: true, message: '重置使用计数成功' });
  } catch (error) {
    logger.error('重置使用计数失败:', error);
    res.status(500).json({ success: false, message: '重置使用计数失败' });
  }
};

/**
 * 获取所有被限制的账号列表
 */
const getLimitedAccounts = async (req, res) => {
  try {
    const limitedAccounts = await AccountUsageLimit.findAll({
      where: { isLimited: true },
      include: [{
        model: Account,
        as: 'account',
        attributes: ['id', 'name', 'status'],
      }],
    });

    const list = limitedAccounts.map(item => ({
      id: item.id,
      accountId: item.accountId,
      accountName: item.account?.name || '未知账号',
      limitType: item.limitType,
      limitCount: item.limitCount,
      currentCount: item.currentCount,
      periodStart: item.periodStart,
      resetTime: item.resetTime,
      accountStatus: item.account?.status,
    }));

    res.json({ success: true, data: list });
  } catch (error) {
    logger.error('获取限制账号列表失败:', error);
    res.status(500).json({ success: false, message: '获取限制账号列表失败' });
  }
};

module.exports = {
  getUsageLimit,
  setUsageLimit,
  removeUsageLimit,
  resetUsageCount,
  getLimitedAccounts,
};
