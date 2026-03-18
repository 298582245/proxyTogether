const statsSnapshotService = require('../services/statsSnapshotService');
const statsNewService = require('../services/statsNewService');
const logger = require('../utils/logger');

const getOptions = async (req, res) => {
  try {
    const data = await statsSnapshotService.getAvailableOptions();
    res.json({ success: true, data });
  } catch (error) {
    logger.error('获取统计快照可选项失败:', error);
    res.status(500).json({ success: false, message: '获取统计快照可选项失败' });
  }
};

const getDetail = async (req, res) => {
  try {
    const { statDate, statDateTime, compareMonth } = req.query;
    if (!statDate && !statDateTime) {
      return res.status(400).json({ success: false, message: '统计日期或时间点不能为空' });
    }

    const resolvedStatDate = statDate || statDateTime?.slice(0, 10);
    const data = await statsSnapshotService.getSnapshotDetail(resolvedStatDate, compareMonth, statDateTime);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('获取统计快照详情失败:', error);
    res.status(500).json({ success: false, message: error.message || '获取统计快照详情失败' });
  }
};

const refresh = async (req, res) => {
  try {
    const { statDate, statDateTime } = req.body || {};
    if (!statDate && !statDateTime) {
      return res.status(400).json({ success: false, message: '统计日期或时间点不能为空' });
    }

    const refreshStatDate = statDate || statDateTime?.slice(0, 10);
    const data = await statsSnapshotService.refreshSnapshotByDate(refreshStatDate);

    res.json({
      success: true,
      message: `刷新统计成功，共更新 ${data.refreshedRowCount} 条快照记录`,
      data,
    });
  } catch (error) {
    logger.error('刷新统计快照失败:', error);
    res.status(500).json({ success: false, message: error.message || '刷新统计快照失败' });
  }
};

/**
 * 获取新的实时统计（新方案）
 * today: Redis缓存 + proxy_logs 实时查询
 * week: daily_stats + today
 * month: daily_stats + today
 */
const getRealtimeStats = async (req, res) => {
  try {
    const { type = 'today' } = req.query;
    const data = await statsNewService.getRealtimeAggregateNew(type);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('获取实时统计失败:', error);
    res.status(500).json({ success: false, message: error.message || '获取实时统计失败' });
  }
};

/**
 * 获取概览数据（新方案）
 */
const getOverviewNew = async (req, res) => {
  try {
    const data = await statsNewService.getOverviewNew();
    res.json({ success: true, data });
  } catch (error) {
    logger.error('获取概览数据失败:', error);
    res.status(500).json({ success: false, message: error.message || '获取概览数据失败' });
  }
};

/**
 * 获取账号成功排行（新方案）
 */
const getAccountSuccessRankingNew = async (req, res) => {
  try {
    const { type = 'today', limit = 10 } = req.query;
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
    const data = await statsNewService.getAccountSuccessRankingNew(type, limitNum);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('获取账号成功排行失败:', error);
    res.status(500).json({ success: false, message: error.message || '获取账号成功排行失败' });
  }
};

/**
 * 获取账号失败排行（新方案）
 */
const getAccountFailRankingNew = async (req, res) => {
  try {
    const { type = 'today', limit = 10 } = req.query;
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
    const data = await statsNewService.getAccountFailRankingNew(type, limitNum);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('获取账号失败排行失败:', error);
    res.status(500).json({ success: false, message: error.message || '获取账号失败排行失败' });
  }
};

/**
 * 获取网站分布（新方案）
 */
const getSiteDistributionNew = async (req, res) => {
  try {
    const { type = 'today' } = req.query;
    const data = await statsNewService.getSiteDistributionNew(type);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('获取网站分布失败:', error);
    res.status(500).json({ success: false, message: error.message || '获取网站分布失败' });
  }
};

/**
 * 获取每小时分布（新方案）
 */
const getHourlyDistributionNew = async (req, res) => {
  try {
    const { type = 'today' } = req.query;
    const data = await statsNewService.getHourlyDistributionNew(type);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('获取每小时分布失败:', error);
    res.status(500).json({ success: false, message: error.message || '获取每小时分布失败' });
  }
};

/**
 * 获取备注请求排行（新方案）
 */
const getRemarkRequestRankingNew = async (req, res) => {
  try {
    const { type = 'today', limit = 10 } = req.query;
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
    const data = await statsNewService.getRemarkRequestRankingNew(type, limitNum);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('获取备注请求排行失败:', error);
    res.status(500).json({ success: false, message: error.message || '获取备注请求排行失败' });
  }
};

/**
 * 获取备注消费排行（新方案）
 */
const getRemarkCostRankingNew = async (req, res) => {
  try {
    const { type = 'today', limit = 10 } = req.query;
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
    const data = await statsNewService.getRemarkCostRankingNew(type, limitNum);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('获取备注消费排行失败:', error);
    res.status(500).json({ success: false, message: error.message || '获取备注消费排行失败' });
  }
};

/**
 * 清除今日统计缓存
 */
const clearTodayCache = async (req, res) => {
  try {
    const { date } = req.query;
    await statsNewService.clearTodayStatsCache(date);
    res.json({ success: true, message: '缓存已清除' });
  } catch (error) {
    logger.error('清除今日统计缓存失败:', error);
    res.status(500).json({ success: false, message: error.message || '清除缓存失败' });
  }
};

/**
 * 手动触发每日结算
 */
const triggerDailySettlement = async (req, res) => {
  try {
    const { date } = req.body || {};
    const result = await statsNewService.dailySettlement(date);
    res.json({ success: true, message: `每日结算完成: ${result}`, data: { date: result } });
  } catch (error) {
    logger.error('触发每日结算失败:', error);
    res.status(500).json({ success: false, message: error.message || '每日结算失败' });
  }
};

/**
 * 批量结算历史数据
 */
const triggerBatchSettlement = async (req, res) => {
  try {
    const { startDate, endDate } = req.body || {};
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: '请提供开始日期和结束日期' });
    }

    const results = [];
    const current = new Date(startDate);
    const end = new Date(endDate);

    while (current <= end) {
      const dateStr = current.toISOString().slice(0, 10);
      // eslint-disable-next-line no-await-in-loop
      const result = await statsNewService.dailySettlement(dateStr);
      results.push(result);
      current.setDate(current.getDate() + 1);
    }

    res.json({
      success: true,
      message: `批量结算完成，共处理 ${results.length} 天`,
      data: { dates: results },
    });
  } catch (error) {
    logger.error('批量结算失败:', error);
    res.status(500).json({ success: false, message: error.message || '批量结算失败' });
  }
};

/**
 * 手动触发月度结算
 */
const triggerMonthlySettlement = async (req, res) => {
  try {
    const result = await statsNewService.monthlySettlement();
    res.json({ success: true, message: `月度结算完成: ${result}`, data: { month: result } });
  } catch (error) {
    logger.error('触发月度结算失败:', error);
    res.status(500).json({ success: false, message: error.message || '月度结算失败' });
  }
};

/**
 * 清空新方案所有数据
 */
const clearAllNewStats = async (req, res) => {
  try {
    const result = await statsNewService.clearAllNewStatsData();
    logger.info('清空新方案数据完成:', result);
    res.json({
      success: true,
      message: `已清空: daily_stats ${result.dailyStatsDeleted} 条, monthly_stats ${result.monthlyStatsDeleted} 条, 缓存${result.cacheCleared ? '已清除' : '清除失败'}`,
      data: result,
    });
  } catch (error) {
    logger.error('清空新方案数据失败:', error);
    res.status(500).json({ success: false, message: error.message || '清空数据失败' });
  }
};

module.exports = {
  clearTodayCache,
  clearAllNewStats,
  getDetail,
  getOptions,
  getRealtimeStats,
  getOverviewNew,
  getAccountSuccessRankingNew,
  getAccountFailRankingNew,
  getSiteDistributionNew,
  getHourlyDistributionNew,
  getRemarkRequestRankingNew,
  getRemarkCostRankingNew,
  refresh,
  triggerDailySettlement,
  triggerBatchSettlement,
  triggerMonthlySettlement,
};
