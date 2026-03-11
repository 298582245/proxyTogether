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
      whereClause.created_at = {
        ...whereClause.created_at,
        [Op.gte]: new Date(startDate),
      };
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      whereClause.created_at = {
        ...whereClause.created_at,
        [Op.lte]: end,
      };
    }

    const { count, rows } = await ProxyLog.findAndCountAll({
      where: whereClause,
      offset,
      limit,
      order: [['created_at', 'DESC']],
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

    // 转换字段名确保前端能正确显示
    const list = rows.map((log) => {
      const logJson = log.toJSON();
      return {
        ...logJson,
        createdAt: logJson.created_at || logJson.createdAt,
      };
    });

    res.json({
      success: true,
      data: {
        list,
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

    const logJson = log.toJSON();
    res.json({
      success: true,
      data: {
        ...logJson,
        createdAt: logJson.created_at || logJson.createdAt,
      },
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
      whereClause.created_at = {};
      if (startDate) {
        whereClause.created_at[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        whereClause.created_at[Op.lte] = end;
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

    // 总消费金额（只计算成功的）
    const totalCostResult = await ProxyLog.findOne({
      attributes: [
        [require('sequelize').fn('SUM', require('sequelize').col('cost')), 'totalCost'],
      ],
      where: { ...whereClause, success: 1 },
      raw: true,
    });

    // 今日统计
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayRequests = await ProxyLog.count({
      where: {
        ...whereClause,
        created_at: { [Op.gte]: today },
      },
    });

    const todaySuccess = await ProxyLog.count({
      where: {
        ...whereClause,
        created_at: { [Op.gte]: today },
        success: 1,
      },
    });

    // 今日消费
    const todayCostResult = await ProxyLog.findOne({
      attributes: [
        [require('sequelize').fn('SUM', require('sequelize').col('cost')), 'todayCost'],
      ],
      where: {
        ...whereClause,
        created_at: { [Op.gte]: today },
        success: 1,
      },
      raw: true,
    });

    // 昨日统计
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayRequests = await ProxyLog.count({
      where: {
        ...whereClause,
        created_at: { [Op.gte]: yesterday, [Op.lt]: today },
      },
    });

    const yesterdaySuccess = await ProxyLog.count({
      where: {
        ...whereClause,
        created_at: { [Op.gte]: yesterday, [Op.lt]: today },
        success: 1,
      },
    });

    const yesterdayCostResult = await ProxyLog.findOne({
      attributes: [
        [require('sequelize').fn('SUM', require('sequelize').col('cost')), 'yesterdayCost'],
      ],
      where: {
        ...whereClause,
        created_at: { [Op.gte]: yesterday, [Op.lt]: today },
        success: 1,
      },
      raw: true,
    });

    res.json({
      success: true,
      data: {
        totalRequests,
        successRequests,
        failRequests,
        totalCost: parseFloat(totalCostResult.totalCost) || 0,
        todayRequests,
        todaySuccess,
        todayCost: parseFloat(todayCostResult.todayCost) || 0,
        yesterdayRequests,
        yesterdaySuccess,
        yesterdayCost: parseFloat(yesterdayCostResult.yesterdayCost) || 0,
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

/**
 * 获取图表数据（按日期分组）
 */
const getChartData = async (req, res) => {
  try {
    const { type = 'week' } = req.query; // today, yesterday, week, month
    const sequelize = require('sequelize');
    const { fn, col, literal } = sequelize;

    // 使用本地时间计算日期范围
    const now = new Date();

    // 获取本地日期字符串 YYYY-MM-DD
    const getLocalDateStr = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // 获取本地日期的开始和结束时间
    const getLocalStartOfDay = (date) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const getLocalEndOfDay = (date) => {
      const d = new Date(date);
      d.setHours(23, 59, 59, 999);
      return d;
    };

    const todayStr = getLocalDateStr(now);
    let startDate, endDate;

    switch (type) {
      case 'today':
        // 今天
        startDate = getLocalStartOfDay(now);
        endDate = getLocalEndOfDay(now);
        break;
      case 'yesterday': {
        // 昨天
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        startDate = getLocalStartOfDay(yesterday);
        endDate = getLocalEndOfDay(yesterday);
        break;
      }
      case 'week': {
        // 最近7天
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - 6);
        startDate = getLocalStartOfDay(weekStart);
        endDate = getLocalEndOfDay(now);
        break;
      }
      case 'month': {
        // 最近30天
        const monthStart = new Date(now);
        monthStart.setDate(monthStart.getDate() - 29);
        startDate = getLocalStartOfDay(monthStart);
        endDate = getLocalEndOfDay(now);
        break;
      }
      default: {
        const defaultStart = new Date(now);
        defaultStart.setDate(defaultStart.getDate() - 6);
        startDate = getLocalStartOfDay(defaultStart);
        endDate = getLocalEndOfDay(now);
      }
    }

    // 使用 DATE_FORMAT 函数按本地日期分组
    const results = await ProxyLog.findAll({
      attributes: [
        [fn('DATE_FORMAT', col('created_at'), '%Y-%m-%d'), 'date'],
        [fn('COUNT', col('id')), 'requests'],
        [fn('SUM', literal('CASE WHEN success = 1 THEN 1 ELSE 0 END')), 'successCount'],
        [fn('SUM', literal('CASE WHEN success = 1 THEN cost ELSE 0 END')), 'cost'],
      ],
      where: {
        created_at: {
          [Op.gte]: startDate,
          [Op.lte]: endDate,
        },
      },
      group: [fn('DATE_FORMAT', col('created_at'), '%Y-%m-%d')],
      order: [[fn('DATE_FORMAT', col('created_at'), '%Y-%m-%d'), 'ASC']],
      raw: true,
    });

    // 生成完整的日期范围
    const chartData = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateStr = getLocalDateStr(currentDate);
      const found = results.find((r) => r.date === dateStr);
      chartData.push({
        date: dateStr,
        requests: found ? parseInt(found.requests) : 0,
        successCount: found ? parseInt(found.successCount) : 0,
        cost: found ? parseFloat(found.cost) || 0 : 0,
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    res.json({
      success: true,
      data: chartData,
    });
  } catch (error) {
    logger.error('获取图表数据失败:', error);
    res.status(500).json({
      success: false,
      message: '获取图表数据失败',
    });
  }
};

module.exports = {
  getList,
  getDetail,
  getStats,
  getChartData,
};
