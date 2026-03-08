const ProxyLog = require('../models/ProxyLog');
const Site = require('../models/Site');
const Account = require('../models/Account');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

/**
 * 获取代理日志列表
 */
const getList = async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 20,
      accountId,
      siteId,
      success,
      startDate,
      endDate,
    } = req.query;

    const offset = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);
    const limit = parseInt(pageSize, 10);

    const whereClause = {};

    if (accountId) {
      whereClause.accountId = parseInt(accountId, 10);
    }
    if (siteId) {
      whereClause.siteId = parseInt(siteId, 10);
    }
    if (success !== undefined && success !== '') {
      whereClause.success = parseInt(success, 10);
    }
    if (startDate) {
      whereClause.createdAt = {
        ...whereClause.createdAt,
        [Op.gte]: new Date(startDate),
      };
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      whereClause.createdAt = {
        ...whereClause.createdAt,
        [Op.lte]: end,
      };
    }

    const { count, rows } = await ProxyLog.findAndCountAll({
      where: whereClause,
      offset,
      limit,
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: Account,
          as: 'account',
          attributes: ['id', 'name'],
          required: false,
        },
        {
          model: Site,
          as: 'site',
          attributes: ['id', 'name'],
          required: false,
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
    logger.error('获取日志列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取日志列表失败',
    });
  }
};

/**
 * 获取日志详情
 */
const getDetail = async (req, res) => {
  try {
    const { id } = req.params;

    const log = await ProxyLog.findByPk(id, {
      include: [
        {
          model: Account,
          as: 'account',
          attributes: ['id', 'name'],
          required: false,
        },
        {
          model: Site,
          as: 'site',
          attributes: ['id', 'name'],
          required: false,
        },
      ],
    });

    if (!log) {
      return res.status(404).json({
        success: false,
        message: '日志不存在',
      });
    }

    res.json({
      success: true,
      data: log,
    });
  } catch (error) {
    logger.error('获取日志详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取日志详情失败',
    });
  }
};

/**
 * 获取日志统计
 */
const getStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const whereClause = {};
    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) {
        whereClause.createdAt[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        whereClause.createdAt[Op.lte] = end;
      }
    }

    // 总请求数
    const totalRequests = await ProxyLog.count({ where: whereClause });

    // 成功请求数
    const successRequests = await ProxyLog.count({
      where: { ...whereClause, success: 1 },
    });

    // 失败请求数
    const failRequests = totalRequests - successRequests;

    // 今日统计
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayRequests = await ProxyLog.count({
      where: {
        ...whereClause,
        createdAt: { [Op.gte]: today },
      },
    });

    const todaySuccess = await ProxyLog.count({
      where: {
        ...whereClause,
        createdAt: { [Op.gte]: today },
        success: 1,
      },
    });

    res.json({
      success: true,
      data: {
        totalRequests,
        successRequests,
        failRequests,
        todayRequests,
        todaySuccess,
        successRate: totalRequests > 0 ? ((successRequests / totalRequests) * 100).toFixed(2) : 0,
      },
    });
  } catch (error) {
    logger.error('获取日志统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取日志统计失败',
    });
  }
};

module.exports = {
  getList,
  getDetail,
  getStats,
};
