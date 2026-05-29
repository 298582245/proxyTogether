const Account = require('../models/Account');
const Site = require('../models/Site');
const logStatsService = require('../services/logStatsService');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

const getAccountSuccessRanking = async (req, res) => {
  try {
    const { type = 'today', limit = 10 } = req.query;
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
    const data = await logStatsService.getAccountSuccessRankingData(type, limitNum);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('获取账号成功排行失败:', error);
    res.status(500).json({ success: false, message: '获取账号成功排行失败' });
  }
};

const getAccountFailRanking = async (req, res) => {
  try {
    const { type = 'today', limit = 10 } = req.query;
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
    const data = await logStatsService.getAccountFailRankingData(type, limitNum);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('获取账号失败排行失败:', error);
    res.status(500).json({ success: false, message: '获取账号失败排行失败' });
  }
};

const getSiteDistribution = async (req, res) => {
  try {
    const { type = 'today' } = req.query;
    const data = await logStatsService.getSiteDistributionData(type);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('获取网站分布失败:', error);
    res.status(500).json({ success: false, message: '获取网站分布失败' });
  }
};

const getHourlyDistribution = async (req, res) => {
  try {
    const { type = 'today' } = req.query;
    const data = await logStatsService.getHourlyDistributionData(type);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('获取每小时分布失败:', error);
    res.status(500).json({ success: false, message: '获取每小时分布失败' });
  }
};

const getAbnormalAccounts = async (req, res) => {
  try {
    const accounts = await Account.findAll({
      where: {
        failCount: { [Op.gte]: 3 },
        status: 1,
      },
      attributes: ['id', 'name', 'siteId', 'failCount', 'balance'],
      order: [['failCount', 'DESC']],
      raw: true,
    });

    const siteIds = accounts.map((item) => item.siteId).filter(Boolean);
    const sites = await Site.findAll({
      where: { id: siteIds },
      attributes: ['id', 'name'],
      raw: true,
    });

    const siteMap = {};
    sites.forEach((site) => {
      siteMap[site.id] = site;
    });

    const data = accounts.map((account) => ({
      id: account.id,
      name: account.name,
      siteName: account.siteId ? (siteMap[account.siteId]?.name || '未知站点') : '独立包月',
      failCount: account.failCount,
      balance: Number.parseFloat(account.balance) || 0,
    }));

    res.json({ success: true, data });
  } catch (error) {
    logger.error('获取异常账号失败:', error);
    res.status(500).json({ success: false, message: '获取异常账号失败' });
  }
};

const getLowBalanceAccounts = async (req, res) => {
  try {
    const { threshold = 10 } = req.query;
    const thresholdNum = Number.parseFloat(threshold) || 10;

    const accounts = await Account.findAll({
      where: {
        balance: { [Op.lt]: thresholdNum },
        status: 1,
        siteId: { [Op.ne]: null },
      },
      attributes: ['id', 'name', 'siteId', 'balance'],
      order: [['balance', 'ASC']],
      raw: true,
    });

    const siteIds = accounts.map((item) => item.siteId).filter(Boolean);
    const sites = await Site.findAll({
      where: { id: siteIds },
      attributes: ['id', 'name'],
      raw: true,
    });

    const siteMap = {};
    sites.forEach((site) => {
      siteMap[site.id] = site;
    });

    const data = accounts.map((account) => ({
      id: account.id,
      name: account.name,
      siteName: account.siteId ? (siteMap[account.siteId]?.name || '未知站点') : '-',
      balance: Number.parseFloat(account.balance) || 0,
    }));

    res.json({ success: true, data });
  } catch (error) {
    logger.error('获取低余额账号失败:', error);
    res.status(500).json({ success: false, message: '获取低余额账号失败' });
  }
};

const getExpiringAccounts = async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const daysNum = parseInt(days, 10) || 7;
    const now = new Date();
    const expireThreshold = new Date(now.getTime() + daysNum * 24 * 60 * 60 * 1000);

    const accounts = await Account.findAll({
      where: {
        expireAt: {
          [Op.ne]: null,
          [Op.gt]: now,
          [Op.lte]: expireThreshold,
        },
        status: 1,
      },
      attributes: ['id', 'name', 'siteId', 'expireAt'],
      order: [['expireAt', 'ASC']],
      raw: true,
    });

    const siteIds = accounts.map((item) => item.siteId).filter(Boolean);
    const sites = await Site.findAll({
      where: { id: siteIds },
      attributes: ['id', 'name'],
      raw: true,
    });

    const siteMap = {};
    sites.forEach((site) => {
      siteMap[site.id] = site;
    });

    const data = accounts.map((account) => ({
      id: account.id,
      name: account.name,
      siteName: account.siteId ? (siteMap[account.siteId]?.name || '未知站点') : '独立包月',
      expireAt: account.expireAt,
      daysLeft: Math.ceil((new Date(account.expireAt) - now) / (24 * 60 * 60 * 1000)),
    }));

    res.json({ success: true, data });
  } catch (error) {
    logger.error('获取即将过期账号失败:', error);
    res.status(500).json({ success: false, message: '获取即将过期账号失败' });
  }
};

const getOverview = async (req, res) => {
  try {
    const data = await logStatsService.getOverviewData();
    res.json({ success: true, data });
  } catch (error) {
    logger.error('获取统计概览失败:', error);
    res.status(500).json({ success: false, message: '获取统计概览失败' });
  }
};

const clearStatsCache = async (req, res) => {
  try {
    await logStatsService.clearStatsCache();
    res.json({ success: true, message: '缓存已清除' });
  } catch (error) {
    logger.error('清除统计缓存失败:', error);
    res.status(500).json({ success: false, message: '清除缓存失败' });
  }
};

const getRemarkRequestRanking = async (req, res) => {
  try {
    const { type = 'today', limit = 10 } = req.query;
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
    const data = await logStatsService.getRemarkRequestRankingData(type, limitNum);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('获取备注请求排行失败:', error);
    res.status(500).json({ success: false, message: '获取备注请求排行失败' });
  }
};

const getRemarkCostRanking = async (req, res) => {
  try {
    const { type = 'today', limit = 10 } = req.query;
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
    const data = await logStatsService.getRemarkCostRankingData(type, limitNum);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('获取备注消费排行失败:', error);
    res.status(500).json({ success: false, message: '获取备注消费排行失败' });
  }
};

module.exports = {
  clearStatsCache,
  getAbnormalAccounts,
  getAccountFailRanking,
  getAccountSuccessRanking,
  getExpiringAccounts,
  getHourlyDistribution,
  getLowBalanceAccounts,
  getOverview,
  getRemarkCostRanking,
  getRemarkRequestRanking,
  getSiteDistribution,
};
