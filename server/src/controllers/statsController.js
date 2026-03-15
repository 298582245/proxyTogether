const { sequelize } = require('../config/database');
const ProxyLog = require('../models/ProxyLog');
const Account = require('../models/Account');
const Site = require('../models/Site');
const logger = require('../utils/logger');
const cacheService = require('../services/cacheService');
const { Op } = require('sequelize');

// 缓存键前缀
const STATS_CACHE_PREFIX = 'stats:';
// 缓存时间（秒）
const CACHE_TTL = {
  realtime: 30,      // 实时数据缓存30秒
  hourly: 300,       // 小时级数据缓存5分钟
  daily: 3600,       // 天级数据缓存1小时
};

/**
 * 获取中国时区的日期字符串 YYYY-MM-DD
 */
const getChinaDateStr = (date) => {
  const TIMEZONE_OFFSET = 8 * 60 * 60 * 1000;
  const d = new Date(date.getTime() + TIMEZONE_OFFSET);
  return d.toISOString().split('T')[0];
};

/**
 * 获取中国时区某天的开始时间（UTC时间）
 */
const getChinaDayStart = (dateStr) => {
  return new Date(dateStr + 'T00:00:00.000+08:00');
};

/**
 * 获取中国时区某天的结束时间（UTC时间）
 */
const getChinaDayEnd = (dateStr) => {
  return new Date(dateStr + 'T23:59:59.999+08:00');
};

/**
 * 获取时间范围
 */
const getTimeRange = (type) => {
  const now = new Date();
  const todayStr = getChinaDateStr(now);
  let startDate, endDate;

  switch (type) {
    case 'today':
      startDate = getChinaDayStart(todayStr);
      endDate = getChinaDayEnd(todayStr);
      break;
    case 'week': {
      const TIMEZONE_OFFSET = 8 * 60 * 60 * 1000;
      const chinaTime = new Date(now.getTime() + TIMEZONE_OFFSET);
      const weekStart = new Date(chinaTime);
      weekStart.setUTCDate(weekStart.getUTCDate() - 6);
      const weekStartStr = weekStart.toISOString().split('T')[0];
      startDate = getChinaDayStart(weekStartStr);
      endDate = getChinaDayEnd(todayStr);
      break;
    }
    case 'month': {
      const TIMEZONE_OFFSET = 8 * 60 * 60 * 1000;
      const chinaTime = new Date(now.getTime() + TIMEZONE_OFFSET);
      const monthStart = new Date(chinaTime);
      monthStart.setUTCDate(monthStart.getUTCDate() - 29);
      const monthStartStr = monthStart.toISOString().split('T')[0];
      startDate = getChinaDayStart(monthStartStr);
      endDate = getChinaDayEnd(todayStr);
      break;
    }
    case 'total':
      // 总计：不限制时间范围
      startDate = null;
      endDate = null;
      break;
    default:
      startDate = getChinaDayStart(todayStr);
      endDate = getChinaDayEnd(todayStr);
  }

  return { startDate, endDate };
};

/**
 * 从缓存获取数据或执行查询
 */
const getWithCache = async (cacheKey, ttl, queryFn) => {
  try {
    const redis = cacheService.getRedis();
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    logger.warn('Redis缓存读取失败:', err.message);
  }

  const data = await queryFn();

  try {
    const redis = cacheService.getRedis();
    await redis.setex(cacheKey, ttl, JSON.stringify(data));
  } catch (err) {
    logger.warn('Redis缓存写入失败:', err.message);
  }

  return data;
};

/**
 * 获取账号请求成功排行
 */
const getAccountSuccessRanking = async (req, res) => {
  try {
    const { type = 'today', limit = 10 } = req.query;
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
    const { startDate, endDate } = getTimeRange(type);

    const cacheKey = `${STATS_CACHE_PREFIX}account_ranking:${type}:${limitNum}`;
    const result = await getWithCache(cacheKey, CACHE_TTL.hourly, async () => {
      const whereClause = {
        account_id: { [Op.ne]: null },
      };
      if (startDate && endDate) {
        whereClause.created_at = { [Op.gte]: startDate, [Op.lte]: endDate };
      }

      const results = await ProxyLog.findAll({
        attributes: [
          'account_id',
          [sequelize.fn('COUNT', sequelize.col('id')), 'totalRequests'],
          [sequelize.fn('SUM', sequelize.literal('CASE WHEN success = 1 THEN 1 ELSE 0 END')), 'successCount'],
          [sequelize.fn('SUM', sequelize.literal('CASE WHEN success = 1 THEN cost ELSE 0 END')), 'totalCost'],
        ],
        where: whereClause,
        group: ['account_id'],
        order: [[sequelize.literal('successCount'), 'DESC']],
        limit: limitNum,
        raw: true,
      });

      // 获取总计
      const totalResult = await ProxyLog.findOne({
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'totalRequests'],
          [sequelize.fn('SUM', sequelize.literal('CASE WHEN success = 1 THEN 1 ELSE 0 END')), 'successCount'],
        ],
        where: whereClause,
        raw: true,
      });

      const accountIds = results.map(r => r.account_id).filter(Boolean);
      const accounts = await Account.findAll({
        where: { id: accountIds },
        attributes: ['id', 'name', 'site_id'],
        raw: true,
      });

      const siteIds = [...new Set(accounts.map(a => a.site_id).filter(Boolean))];
      const sites = await Site.findAll({
        where: { id: siteIds },
        attributes: ['id', 'name'],
        raw: true,
      });

      const accountMap = {};
      accounts.forEach(a => { accountMap[a.id] = a; });
      const siteMap = {};
      sites.forEach(s => { siteMap[s.id] = s; });

      const list = results.map(r => ({
        accountId: r.account_id,
        accountName: accountMap[r.account_id]?.name || '未知账号',
        siteName: accountMap[r.account_id]?.site_id ? (siteMap[accountMap[r.account_id].site_id]?.name || '未知网站') : '独立包月',
        totalRequests: parseInt(r.totalRequests) || 0,
        successCount: parseInt(r.successCount) || 0,
        successRate: r.totalRequests > 0 ? ((r.successCount / r.totalRequests) * 100).toFixed(2) : 0,
        totalCost: parseFloat(r.totalCost) || 0,
      }));

      return {
        list,
        total: {
          successCount: parseInt(totalResult?.successCount) || 0,
          totalRequests: parseInt(totalResult?.totalRequests) || 0,
        },
      };
    });

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('获取账号成功排行失败:', error);
    res.status(500).json({ success: false, message: '获取账号成功排行失败' });
  }
};

/**
 * 获取账号失败排行
 */
const getAccountFailRanking = async (req, res) => {
  try {
    const { type = 'today', limit = 10 } = req.query;
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
    const { startDate, endDate } = getTimeRange(type);

    const cacheKey = `${STATS_CACHE_PREFIX}account_fail_ranking:${type}:${limitNum}`;
    const result = await getWithCache(cacheKey, CACHE_TTL.hourly, async () => {
      const whereClause = {
        account_id: { [Op.ne]: null },
      };
      if (startDate && endDate) {
        whereClause.created_at = { [Op.gte]: startDate, [Op.lte]: endDate };
      }

      const results = await ProxyLog.findAll({
        attributes: [
          'account_id',
          [sequelize.fn('COUNT', sequelize.col('id')), 'totalRequests'],
          [sequelize.fn('SUM', sequelize.literal('CASE WHEN success = 0 THEN 1 ELSE 0 END')), 'failCount'],
        ],
        where: whereClause,
        group: ['account_id'],
        order: [[sequelize.literal('failCount'), 'DESC']],
        limit: limitNum,
        raw: true,
      });

      // 获取总计
      const totalResult = await ProxyLog.findOne({
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'totalRequests'],
          [sequelize.fn('SUM', sequelize.literal('CASE WHEN success = 0 THEN 1 ELSE 0 END')), 'failCount'],
        ],
        where: whereClause,
        raw: true,
      });

      const accountIds = results.map(r => r.account_id).filter(Boolean);
      const accounts = await Account.findAll({
        where: { id: accountIds },
        attributes: ['id', 'name', 'site_id', 'fail_count'],
        raw: true,
      });

      const accountMap = {};
      accounts.forEach(a => { accountMap[a.id] = a; });

      const list = results.map(r => ({
        accountId: r.account_id,
        accountName: accountMap[r.account_id]?.name || '未知账号',
        totalRequests: parseInt(r.totalRequests) || 0,
        failCount: parseInt(r.failCount) || 0,
        currentFailCount: accountMap[r.account_id]?.fail_count || 0,
      }));

      return {
        list,
        total: {
          failCount: parseInt(totalResult?.failCount) || 0,
          totalRequests: parseInt(totalResult?.totalRequests) || 0,
        },
      };
    });

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('获取账号失败排行失败:', error);
    res.status(500).json({ success: false, message: '获取账号失败排行失败' });
  }
};

/**
 * 获取网站请求分布
 */
const getSiteDistribution = async (req, res) => {
  try {
    const { type = 'today' } = req.query;
    const { startDate, endDate } = getTimeRange(type);

    const cacheKey = `${STATS_CACHE_PREFIX}site_distribution:${type}`;
    const result = await getWithCache(cacheKey, CACHE_TTL.hourly, async () => {
      const whereClause = {};
      if (startDate && endDate) {
        whereClause.created_at = { [Op.gte]: startDate, [Op.lte]: endDate };
      }

      const results = await ProxyLog.findAll({
        attributes: [
          'site_id',
          [sequelize.fn('COUNT', sequelize.col('id')), 'totalRequests'],
          [sequelize.fn('SUM', sequelize.literal('CASE WHEN success = 1 THEN 1 ELSE 0 END')), 'successCount'],
          [sequelize.fn('SUM', sequelize.literal('CASE WHEN success = 1 THEN cost ELSE 0 END')), 'totalCost'],
        ],
        where: whereClause,
        group: ['site_id'],
        raw: true,
      });

      // 获取总计
      const totalResult = await ProxyLog.findOne({
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'totalRequests'],
          [sequelize.fn('SUM', sequelize.literal('CASE WHEN success = 1 THEN 1 ELSE 0 END')), 'successCount'],
        ],
        where: whereClause,
        raw: true,
      });

      const siteIds = results.map(r => r.site_id).filter(Boolean);
      const sites = await Site.findAll({
        where: { id: siteIds },
        attributes: ['id', 'name'],
        raw: true,
      });

      const siteMap = {};
      sites.forEach(s => { siteMap[s.id] = s; });

      const list = results.map(r => ({
        siteId: r.site_id,
        siteName: r.site_id ? (siteMap[r.site_id]?.name || '未知网站') : '独立包月',
        totalRequests: parseInt(r.totalRequests) || 0,
        successCount: parseInt(r.successCount) || 0,
        successRate: r.totalRequests > 0 ? ((r.successCount / r.totalRequests) * 100).toFixed(2) : 0,
        totalCost: parseFloat(r.totalCost) || 0,
      })).sort((a, b) => b.totalRequests - a.totalRequests);

      return {
        list,
        total: {
          totalRequests: parseInt(totalResult?.totalRequests) || 0,
          successCount: parseInt(totalResult?.successCount) || 0,
        },
      };
    });

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('获取网站分布失败:', error);
    res.status(500).json({ success: false, message: '获取网站分布失败' });
  }
};

/**
 * 获取每小时请求分布
 */
const getHourlyDistribution = async (req, res) => {
  try {
    const { type = 'today' } = req.query;
    const { startDate, endDate } = getTimeRange(type);

    const cacheKey = `${STATS_CACHE_PREFIX}hourly_distribution:${type}`;
    const data = await getWithCache(cacheKey, CACHE_TTL.realtime, async () => {
      // 使用 CONVERT_TZ 函数将 UTC 时间转换为中国时区（+8小时）
      // 然后提取小时
      const results = await ProxyLog.findAll({
        attributes: [
          [sequelize.literal('HOUR(CONVERT_TZ(created_at, "+00:00", "+08:00"))'), 'hour'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'requests'],
          [sequelize.fn('SUM', sequelize.literal('CASE WHEN success = 1 THEN 1 ELSE 0 END')), 'successCount'],
        ],
        where: {
          created_at: { [Op.gte]: startDate, [Op.lte]: endDate },
        },
        group: [sequelize.literal('HOUR(CONVERT_TZ(created_at, "+00:00", "+08:00"))')],
        order: [[sequelize.literal('HOUR(CONVERT_TZ(created_at, "+00:00", "+08:00"))'), 'ASC']],
        raw: true,
      });

      // 生成完整的24小时数据
      const hourlyData = [];
      for (let i = 0; i < 24; i++) {
        const found = results.find(r => parseInt(r.hour) === i);
        hourlyData.push({
          hour: i,
          label: `${i.toString().padStart(2, '0')}:00`,
          requests: found ? parseInt(found.requests) : 0,
          successCount: found ? parseInt(found.successCount) : 0,
        });
      }

      return hourlyData;
    });

    res.json({ success: true, data });
  } catch (error) {
    logger.error('获取每小时分布失败:', error);
    res.status(500).json({ success: false, message: '获取每小时分布失败' });
  }
};

/**
 * 获取异常账号（连续失败>=3次）
 */
const getAbnormalAccounts = async (req, res) => {
  try {
    const cacheKey = `${STATS_CACHE_PREFIX}abnormal_accounts`;
    const data = await getWithCache(cacheKey, CACHE_TTL.realtime, async () => {
      const accounts = await Account.findAll({
        where: {
          fail_count: { [Op.gte]: 3 },
          status: 1,
        },
        attributes: ['id', 'name', 'site_id', 'fail_count', 'balance', 'status'],
        order: [['fail_count', 'DESC']],
        raw: true,
      });

      const siteIds = accounts.map(a => a.site_id).filter(Boolean);
      const sites = await Site.findAll({
        where: { id: siteIds },
        attributes: ['id', 'name'],
        raw: true,
      });

      const siteMap = {};
      sites.forEach(s => { siteMap[s.id] = s; });

      return accounts.map(a => ({
        id: a.id,
        name: a.name,
        siteName: a.site_id ? (siteMap[a.site_id]?.name || '未知网站') : '独立包月',
        failCount: a.fail_count,
        balance: parseFloat(a.balance) || 0,
      }));
    });

    res.json({ success: true, data });
  } catch (error) {
    logger.error('获取异常账号失败:', error);
    res.status(500).json({ success: false, message: '获取异常账号失败' });
  }
};

/**
 * 获取低余额账号
 */
const getLowBalanceAccounts = async (req, res) => {
  try {
    const { threshold = 10 } = req.query;
    const thresholdNum = parseFloat(threshold) || 10;

    const cacheKey = `${STATS_CACHE_PREFIX}low_balance:${thresholdNum}`;
    const data = await getWithCache(cacheKey, CACHE_TTL.hourly, async () => {
      const accounts = await Account.findAll({
        where: {
          balance: { [Op.lt]: thresholdNum },
          status: 1,
          site_id: { [Op.ne]: null }, // 排除独立包月
        },
        attributes: ['id', 'name', 'site_id', 'balance', 'status'],
        order: [['balance', 'ASC']],
        raw: true,
      });

      const siteIds = accounts.map(a => a.site_id).filter(Boolean);
      const sites = await Site.findAll({
        where: { id: siteIds },
        attributes: ['id', 'name', 'balance_type'],
        raw: true,
      });

      const siteMap = {};
      sites.forEach(s => { siteMap[s.id] = s; });

      return accounts.map(a => ({
        id: a.id,
        name: a.name,
        siteName: a.site_id ? (siteMap[a.site_id]?.name || '未知网站') : '-',
        balance: parseFloat(a.balance) || 0,
      }));
    });

    res.json({ success: true, data });
  } catch (error) {
    logger.error('获取低余额账号失败:', error);
    res.status(500).json({ success: false, message: '获取低余额账号失败' });
  }
};

/**
 * 获取即将过期的包月账号
 */
const getExpiringAccounts = async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const daysNum = parseInt(days, 10) || 7;

    const cacheKey = `${STATS_CACHE_PREFIX}expiring_accounts:${daysNum}`;
    const data = await getWithCache(cacheKey, CACHE_TTL.hourly, async () => {
      const now = new Date();
      const expireThreshold = new Date(now.getTime() + daysNum * 24 * 60 * 60 * 1000);

      const accounts = await Account.findAll({
        where: {
          expire_at: {
            [Op.ne]: null,
            [Op.gt]: now,
            [Op.lte]: expireThreshold,
          },
          status: 1,
        },
        attributes: ['id', 'name', 'site_id', 'expire_at'],
        order: [['expire_at', 'ASC']],
        raw: true,
      });

      const siteIds = accounts.map(a => a.site_id).filter(Boolean);
      const sites = await Site.findAll({
        where: { id: siteIds },
        attributes: ['id', 'name'],
        raw: true,
      });

      const siteMap = {};
      sites.forEach(s => { siteMap[s.id] = s; });

      return accounts.map(a => ({
        id: a.id,
        name: a.name,
        siteName: a.site_id ? (siteMap[a.site_id]?.name || '未知网站') : '独立包月',
        expireAt: a.expire_at,
        daysLeft: Math.ceil((new Date(a.expire_at) - now) / (24 * 60 * 60 * 1000)),
      }));
    });

    res.json({ success: true, data });
  } catch (error) {
    logger.error('获取即将过期账号失败:', error);
    res.status(500).json({ success: false, message: '获取即将过期账号失败' });
  }
};

/**
 * 获取实时统计概览
 */
const getOverview = async (req, res) => {
  try {
    const cacheKey = `${STATS_CACHE_PREFIX}overview`;
    const data = await getWithCache(cacheKey, CACHE_TTL.realtime, async () => {
      const now = new Date();
      const todayStr = getChinaDateStr(now);
      const todayStart = getChinaDayStart(todayStr);
      const todayEnd = getChinaDayEnd(todayStr);

      // 昨天时间范围
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = getChinaDateStr(yesterday);
      const yesterdayStart = getChinaDayStart(yesterdayStr);
      const yesterdayEnd = getChinaDayEnd(yesterdayStr);

      // 本周时间范围
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - 6);
      const weekStartStr = getChinaDateStr(weekStart);

      // 本月时间范围
      const monthStart = new Date(now);
      monthStart.setDate(monthStart.getDate() - 29);
      const monthStartStr = getChinaDateStr(monthStart);

      // 今日统计
      const todayStats = await ProxyLog.findOne({
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'requests'],
          [sequelize.fn('SUM', sequelize.literal('CASE WHEN success = 1 THEN 1 ELSE 0 END')), 'successCount'],
          [sequelize.fn('SUM', sequelize.literal('CASE WHEN success = 1 THEN cost ELSE 0 END')), 'cost'],
        ],
        where: {
          created_at: { [Op.gte]: todayStart, [Op.lte]: todayEnd },
        },
        raw: true,
      });

      // 昨日统计
      const yesterdayStats = await ProxyLog.findOne({
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'requests'],
          [sequelize.fn('SUM', sequelize.literal('CASE WHEN success = 1 THEN 1 ELSE 0 END')), 'successCount'],
          [sequelize.fn('SUM', sequelize.literal('CASE WHEN success = 1 THEN cost ELSE 0 END')), 'cost'],
        ],
        where: {
          created_at: { [Op.gte]: yesterdayStart, [Op.lte]: yesterdayEnd },
        },
        raw: true,
      });

      // 本周统计
      const weekStats = await ProxyLog.findOne({
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'requests'],
          [sequelize.fn('SUM', sequelize.literal('CASE WHEN success = 1 THEN 1 ELSE 0 END')), 'successCount'],
          [sequelize.fn('SUM', sequelize.literal('CASE WHEN success = 1 THEN cost ELSE 0 END')), 'cost'],
        ],
        where: {
          created_at: { [Op.gte]: getChinaDayStart(weekStartStr), [Op.lte]: todayEnd },
        },
        raw: true,
      });

      // 本月统计
      const monthStats = await ProxyLog.findOne({
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'requests'],
          [sequelize.fn('SUM', sequelize.literal('CASE WHEN success = 1 THEN 1 ELSE 0 END')), 'successCount'],
          [sequelize.fn('SUM', sequelize.literal('CASE WHEN success = 1 THEN cost ELSE 0 END')), 'cost'],
        ],
        where: {
          created_at: { [Op.gte]: getChinaDayStart(monthStartStr), [Op.lte]: todayEnd },
        },
        raw: true,
      });

      // 累计统计
      const totalStats = await ProxyLog.findOne({
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'requests'],
          [sequelize.fn('SUM', sequelize.literal('CASE WHEN success = 1 THEN 1 ELSE 0 END')), 'successCount'],
          [sequelize.fn('SUM', sequelize.literal('CASE WHEN success = 1 THEN cost ELSE 0 END')), 'cost'],
        ],
        raw: true,
      });

      // 账号统计
      const totalAccounts = await Account.count();
      const activeAccounts = await Account.count({ where: { status: 1 } });
      const abnormalAccounts = await Account.count({ where: { fail_count: { [Op.gte]: 3 }, status: 1 } });
      const lowBalanceAccounts = await Account.count({ where: { balance: { [Op.lt]: 10 }, status: 1, site_id: { [Op.ne]: null } } });

      return {
        today: {
          requests: parseInt(todayStats?.requests) || 0,
          successCount: parseInt(todayStats?.successCount) || 0,
          cost: parseFloat(todayStats?.cost) || 0,
        },
        yesterday: {
          requests: parseInt(yesterdayStats?.requests) || 0,
          successCount: parseInt(yesterdayStats?.successCount) || 0,
          cost: parseFloat(yesterdayStats?.cost) || 0,
        },
        week: {
          requests: parseInt(weekStats?.requests) || 0,
          successCount: parseInt(weekStats?.successCount) || 0,
          cost: parseFloat(weekStats?.cost) || 0,
        },
        month: {
          requests: parseInt(monthStats?.requests) || 0,
          successCount: parseInt(monthStats?.successCount) || 0,
          cost: parseFloat(monthStats?.cost) || 0,
        },
        total: {
          requests: parseInt(totalStats?.requests) || 0,
          successCount: parseInt(totalStats?.successCount) || 0,
          cost: parseFloat(totalStats?.cost) || 0,
        },
        accounts: {
          total: totalAccounts,
          active: activeAccounts,
          abnormal: abnormalAccounts,
          lowBalance: lowBalanceAccounts,
        },
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    logger.error('获取统计概览失败:', error);
    res.status(500).json({ success: false, message: '获取统计概览失败' });
  }
};

/**
 * 清除统计缓存
 */
const clearStatsCache = async (req, res) => {
  try {
    const redis = cacheService.getRedis();
    const keys = await redis.keys(`${STATS_CACHE_PREFIX}*`);
    if (keys.length > 0) {
      await redis.del(keys);
    }
    res.json({ success: true, message: '缓存已清除' });
  } catch (error) {
    logger.error('清除统计缓存失败:', error);
    res.status(500).json({ success: false, message: '清除缓存失败' });
  }
};

/**
 * 获取备注请求排行
 */
const getRemarkRequestRanking = async (req, res) => {
  try {
    const { type = 'today', limit = 10 } = req.query;
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
    const { startDate, endDate } = getTimeRange(type);

    const cacheKey = `${STATS_CACHE_PREFIX}remark_request_ranking:${type}:${limitNum}`;
    const result = await getWithCache(cacheKey, CACHE_TTL.hourly, async () => {
      const whereClause = {
        remark: { [Op.ne]: null }, // 只统计有备注的记录
      };
      if (startDate && endDate) {
        whereClause.created_at = { [Op.gte]: startDate, [Op.lte]: endDate };
      }

      const results = await ProxyLog.findAll({
        attributes: [
          'remark',
          [sequelize.fn('COUNT', sequelize.col('id')), 'totalRequests'],
          [sequelize.fn('SUM', sequelize.literal('CASE WHEN success = 1 THEN 1 ELSE 0 END')), 'successCount'],
          [sequelize.fn('SUM', sequelize.literal('CASE WHEN success = 0 THEN 1 ELSE 0 END')), 'failCount'],
        ],
        where: whereClause,
        group: ['remark'],
        order: [[sequelize.literal('totalRequests'), 'DESC']],
        limit: limitNum,
        raw: true,
      });

      // 获取总计（只统计有备注的）
      const totalResult = await ProxyLog.findOne({
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'totalRequests'],
        ],
        where: whereClause,
        raw: true,
      });

      const list = results.map(r => ({
        remark: r.remark || '(无备注)',
        totalRequests: parseInt(r.totalRequests) || 0,
        successCount: parseInt(r.successCount) || 0,
        failCount: parseInt(r.failCount) || 0,
      }));

      return {
        list,
        total: {
          totalRequests: parseInt(totalResult?.totalRequests) || 0,
        },
      };
    });

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('获取备注请求排行失败:', error);
    res.status(500).json({ success: false, message: '获取备注请求排行失败' });
  }
};

/**
 * 获取备注消费排行
 */
const getRemarkCostRanking = async (req, res) => {
  try {
    const { type = 'today', limit = 10 } = req.query;
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
    const { startDate, endDate } = getTimeRange(type);

    const cacheKey = `${STATS_CACHE_PREFIX}remark_cost_ranking:${type}:${limitNum}`;
    const result = await getWithCache(cacheKey, CACHE_TTL.hourly, async () => {
      const whereClause = {
        success: 1, // 只统计成功的请求
        remark: { [Op.ne]: null }, // 只统计有备注的记录
      };
      if (startDate && endDate) {
        whereClause.created_at = { [Op.gte]: startDate, [Op.lte]: endDate };
      }

      const results = await ProxyLog.findAll({
        attributes: [
          'remark',
          [sequelize.fn('COUNT', sequelize.col('id')), 'totalRequests'],
          [sequelize.fn('SUM', sequelize.col('cost')), 'totalCost'],
        ],
        where: whereClause,
        group: ['remark'],
        order: [[sequelize.literal('totalCost'), 'DESC']],
        limit: limitNum,
        raw: true,
      });

      // 获取总计（只统计有备注的）
      const totalResult = await ProxyLog.findOne({
        attributes: [
          [sequelize.fn('SUM', sequelize.col('cost')), 'totalCost'],
        ],
        where: whereClause,
        raw: true,
      });

      const list = results.map(r => ({
        remark: r.remark || '(无备注)',
        totalRequests: parseInt(r.totalRequests) || 0,
        totalCost: parseFloat(r.totalCost) || 0,
      }));

      return {
        list,
        total: {
          totalCost: parseFloat(totalResult?.totalCost) || 0,
        },
      };
    });

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('获取备注消费排行失败:', error);
    res.status(500).json({ success: false, message: '获取备注消费排行失败' });
  }
};

module.exports = {
  getAccountSuccessRanking,
  getAccountFailRanking,
  getSiteDistribution,
  getHourlyDistribution,
  getAbnormalAccounts,
  getLowBalanceAccounts,
  getExpiringAccounts,
  getOverview,
  clearStatsCache,
  getRemarkRequestRanking,
  getRemarkCostRanking,
  clearStatsCache,
};
