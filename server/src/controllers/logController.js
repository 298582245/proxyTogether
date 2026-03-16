const ProxyLog = require('../models/ProxyLog');
const Site = require('../models/Site');
const Account = require('../models/Account');
const logStatsService = require('../services/logStatsService');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

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
      remark,
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
    if (remark) {
      whereClause.remark = { [Op.like]: `%${remark}%` };
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
    logger.error('鑾峰彇鏃ュ織鍒楄〃澶辫触:', error);
    res.status(500).json({ success: false, message: '鑾峰彇鏃ュ織鍒楄〃澶辫触' });
  }
};

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
      return res.status(404).json({ success: false, message: '鏃ュ織涓嶅瓨鍦?' });
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
    logger.error('鑾峰彇鏃ュ織璇︽儏澶辫触:', error);
    res.status(500).json({ success: false, message: '鑾峰彇鏃ュ織璇︽儏澶辫触' });
  }
};

const getStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const data = await logStatsService.getLogStatsData(startDate, endDate);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('鑾峰彇鏃ュ織缁熻澶辫触:', error);
    res.status(500).json({ success: false, message: '鑾峰彇鏃ュ織缁熻澶辫触' });
  }
};

const getChartData = async (req, res) => {
  try {
    const { type = 'week' } = req.query;
    const data = await logStatsService.getLogChartData(type);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('鑾峰彇鍥捐〃鏁版嵁澶辫触:', error);
    res.status(500).json({ success: false, message: '鑾峰彇鍥捐〃鏁版嵁澶辫触' });
  }
};

const getDurationConfig = async (req, res) => {
  try {
    const sites = await Site.findAll({
      where: { status: 1 },
      attributes: ['id', 'name', 'durationParams'],
      raw: true,
    });

    const accounts = await Account.findAll({
      where: {
        status: 1,
        siteId: null,
        extractUrlTemplate: { [Op.ne]: null },
      },
      attributes: ['id', 'name', 'durationParams'],
      raw: true,
    });

    const siteDurationMap = {};
    sites.forEach((site) => {
      if (site.durationParams) {
        const params = typeof site.durationParams === 'string'
          ? JSON.parse(site.durationParams)
          : site.durationParams;
        if (Array.isArray(params)) {
          siteDurationMap[`site_${site.id}`] = {
            name: site.name,
            params: params.map((item) => ({
              times: item.times,
              label: item.label || `${item.times}分钟`,
            })),
          };
        }
      }
    });

    const accountDurationMap = {};
    accounts.forEach((account) => {
      if (account.durationParams) {
        const params = typeof account.durationParams === 'string'
          ? JSON.parse(account.durationParams)
          : account.durationParams;
        if (Array.isArray(params)) {
          accountDurationMap[`account_${account.id}`] = {
            name: account.name,
            params: params.map((item) => ({
              times: item.times,
              label: item.label || `${item.times}分钟`,
            })),
          };
        }
      }
    });

    res.json({
      success: true,
      data: {
        sites: siteDurationMap,
        accounts: accountDurationMap,
      },
    });
  } catch (error) {
    logger.error('鑾峰彇鏃堕暱鍙傛暟閰嶇疆澶辫触:', error);
    res.status(500).json({ success: false, message: '鑾峰彇鏃堕暱鍙傛暟閰嶇疆澶辫触' });
  }
};

module.exports = {
  getChartData,
  getDetail,
  getDurationConfig,
  getList,
  getStats,
};
