const Account = require('../models/Account');
const Site = require('../models/Site');
const cacheService = require('../services/cacheService');
const balanceService = require('../services/balanceService');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

/**
 * 获取账号列表
 */
const getList = async (req, res) => {
  try {
    const { page = 1, pageSize = 10, siteId, status, name } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);
    const limit = parseInt(pageSize, 10);

    const whereClause = {};
    if (siteId) {
      whereClause.siteId = parseInt(siteId, 10);
    }
    if (status !== undefined && status !== '') {
      whereClause.status = parseInt(status, 10);
    }
    if (name) {
      whereClause.name = { [Op.like]: `%${name}%` };
    }

    const { count, rows } = await Account.findAndCountAll({
      where: whereClause,
      offset,
      limit,
      order: [['balance', 'DESC']],
      include: [
        {
          model: Site,
          as: 'site',
          attributes: ['id', 'name', 'balanceType'],
        },
      ],
    });

    res.json({
      success: true,
      data: {
        list: rows,
        total: count,
        page: parseInt(page, 10),
        pageSize: limit,
      },
    });
  } catch (error) {
    logger.error('获取账号列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取账号列表失败',
    });
  }
};

/**
 * 获取账号详情
 */
const getDetail = async (req, res) => {
  try {
    const { id } = req.params;

    const account = await Account.findByPk(id, {
      include: [
        {
          model: Site,
          as: 'site',
        },
      ],
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        message: '账号不存在',
      });
    }

    res.json({
      success: true,
      data: account,
    });
  } catch (error) {
    logger.error('获取账号详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取账号详情失败',
    });
  }
};

/**
 * 创建账号
 */
const create = async (req, res) => {
  try {
    const { siteId, name, extractParams, balanceParams } = req.body;

    // 验证必填字段
    if (!siteId) {
      return res.status(400).json({
        success: false,
        message: '请选择网站',
      });
    }

    // 检查网站是否存在
    const site = await Site.findByPk(siteId);
    if (!site) {
      return res.status(400).json({
        success: false,
        message: '网站不存在',
      });
    }

    const account = await Account.create({
      siteId,
      name: name || `账号-${Date.now()}`,
      extractParams: extractParams || null,
      balanceParams: balanceParams || null,
      balance: 0,
      status: 1,
      failCount: 0,
    });

    res.json({
      success: true,
      message: '创建成功',
      data: account,
    });
  } catch (error) {
    logger.error('创建账号失败:', error);
    res.status(500).json({
      success: false,
      message: '创建账号失败',
    });
  }
};

/**
 * 更新账号
 */
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, extractParams, balanceParams, status } = req.body;

    const account = await Account.findByPk(id);
    if (!account) {
      return res.status(404).json({
        success: false,
        message: '账号不存在',
      });
    }

    await account.update({
      name: name || account.name,
      extractParams: extractParams !== undefined ? extractParams : account.extractParams,
      balanceParams: balanceParams !== undefined ? balanceParams : account.balanceParams,
      status: status !== undefined ? status : account.status,
    });

    res.json({
      success: true,
      message: '更新成功',
      data: account,
    });
  } catch (error) {
    logger.error('更新账号失败:', error);
    res.status(500).json({
      success: false,
      message: '更新账号失败',
    });
  }
};

/**
 * 删除账号
 */
const remove = async (req, res) => {
  try {
    const { id } = req.params;

    const account = await Account.findByPk(id);
    if (!account) {
      return res.status(404).json({
        success: false,
        message: '账号不存在',
      });
    }

    // 删除缓存
    await cacheService.deleteAccountBalance(id);

    await account.destroy();

    res.json({
      success: true,
      message: '删除成功',
    });
  } catch (error) {
    logger.error('删除账号失败:', error);
    res.status(500).json({
      success: false,
      message: '删除账号失败',
    });
  }
};

/**
 * 切换账号状态
 */
const toggleStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const account = await Account.findByPk(id);
    if (!account) {
      return res.status(404).json({
        success: false,
        message: '账号不存在',
      });
    }

    const newStatus = account.status === 1 ? 0 : 1;

    await account.update({
      status: newStatus,
      // 如果是启用，重置失败次数
      failCount: newStatus === 1 ? 0 : account.failCount,
    });

    res.json({
      success: true,
      message: newStatus === 1 ? '已启用' : '已禁用',
      data: { status: newStatus },
    });
  } catch (error) {
    logger.error('切换账号状态失败:', error);
    res.status(500).json({
      success: false,
      message: '切换账号状态失败',
    });
  }
};

/**
 * 手动刷新账号余额
 */
const refreshBalance = async (req, res) => {
  try {
    const { id } = req.params;

    const account = await Account.findByPk(id, {
      include: [
        {
          model: Site,
          as: 'site',
        },
      ],
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        message: '账号不存在',
      });
    }

    if (!account.site) {
      return res.status(400).json({
        success: false,
        message: '账号关联的网站不存在',
      });
    }

    // 检查是否为包月类型
    if (account.site.balanceType === 'monthly' || !account.site.balanceUrl) {
      return res.json({
        success: true,
        message: '该网站为包月类型，无需查询余额',
        data: { balance: null, isMonthly: true },
      });
    }

    const result = await balanceService.queryAccountBalance(account, account.site);

    if (result.success) {
      await balanceService.updateAccountBalance(account.id, result.balance);

      res.json({
        success: true,
        message: '余额刷新成功',
        data: { balance: result.balance },
      });
    } else {
      res.json({
        success: false,
        message: result.error || '余额查询失败',
      });
    }
  } catch (error) {
    logger.error('刷新账号余额失败:', error);
    res.status(500).json({
      success: false,
      message: '刷新账号余额失败',
    });
  }
};

/**
 * 批量刷新余额
 */
const refreshAllBalance = async (req, res) => {
  try {
    // 异步执行，不等待完成
    balanceService.queryAllBalances().catch((err) => {
      logger.error('批量刷新余额失败:', err);
    });

    res.json({
      success: true,
      message: '已开始批量刷新余额，请稍后查看',
    });
  } catch (error) {
    logger.error('批量刷新余额失败:', error);
    res.status(500).json({
      success: false,
      message: '批量刷新余额失败',
    });
  }
};

/**
 * 获取账号统计
 */
const getStats = async (req, res) => {
  try {
    const stats = await balanceService.getAccountStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('获取账号统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取账号统计失败',
    });
  }
};

module.exports = {
  getList,
  getDetail,
  create,
  update,
  remove,
  toggleStatus,
  refreshBalance,
  refreshAllBalance,
  getStats,
};
