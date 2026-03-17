const ProxyLog = require('../models/ProxyLog');
const Site = require('../models/Site');
const Account = require('../models/Account');
const logStatsService = require('../services/logStatsService');
const logger = require('../utils/logger');
const { Op } = require('sequelize');
const { addDays, getChinaDateStr, getChinaDayEnd, getChinaDayStart } = require('../utils/statsTime');

const parsePositiveInteger = (value) => {
  const parsedValue = Number.parseInt(value, 10);
  if (Number.isNaN(parsedValue) || parsedValue <= 0) {
    return null;
  }
  return parsedValue;
};

const parseJsonArray = (value) => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    try {
      const parsedValue = JSON.parse(value);
      return Array.isArray(parsedValue) ? parsedValue : [];
    } catch {
      return [];
    }
  }

  return [];
};

const isValidDateString = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

const parseCleanupDateRange = (payload = {}) => {
  const {
    cleanupMode,
    retainDays,
    cleanupStartDate,
    cleanupEndDate,
  } = payload;

  const todayStart = getChinaDayStart(getChinaDateStr(new Date()));
  let deleteStartDate = null;
  let deleteEndDate = null;

  if (cleanupMode === 'retainDays') {
    const retainDaysValue = parsePositiveInteger(retainDays);
    if (!retainDaysValue || retainDaysValue > 3650) {
      return { errorMessage: '保留天数必须是 1 到 3650 之间的整数' };
    }

    const keepStartDate = addDays(todayStart, -(retainDaysValue - 1));
    deleteEndDate = new Date(keepStartDate.getTime() - 1);
  } else if (cleanupMode === 'dateRange') {
    if (!isValidDateString(cleanupStartDate) || !isValidDateString(cleanupEndDate)) {
      return { errorMessage: '清理时间范围格式不正确' };
    }

    deleteStartDate = getChinaDayStart(cleanupStartDate);
    deleteEndDate = getChinaDayEnd(cleanupEndDate);

    if (Number.isNaN(deleteStartDate.getTime()) || Number.isNaN(deleteEndDate.getTime())) {
      return { errorMessage: '清理时间范围无效' };
    }

    if (deleteStartDate > deleteEndDate) {
      return { errorMessage: '开始日期不能晚于结束日期' };
    }
  } else {
    return { errorMessage: '清理模式不正确' };
  }

  if (!deleteEndDate || deleteEndDate >= todayStart) {
    return { errorMessage: '为了保证今日统计实时准确，只允许清理今天之前的日志' };
  }

  return {
    deleteStartDate,
    deleteEndDate,
  };
};

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

const getFormatConfig = async (req, res) => {
  try {
    const sites = await Site.findAll({
      where: { status: 1 },
      attributes: ['id', 'name', 'formatParams'],
      raw: true,
    });

    const accounts = await Account.findAll({
      where: {
        status: 1,
        siteId: null,
        extractUrlTemplate: { [Op.ne]: null },
      },
      attributes: ['id', 'name', 'formatParams'],
      raw: true,
    });

    const normalizeFormatParams = (params = []) => params
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }

        const value = item.value !== undefined && item.value !== null
          ? String(item.value).trim()
          : '';
        if (!value) {
          return null;
        }

        const label = item.label !== undefined && item.label !== null
          ? String(item.label).trim()
          : value;
        const originalForwardValue = item.oValue !== undefined
          ? item.oValue
          : item.o_value;
        const forwardValue = originalForwardValue !== undefined && originalForwardValue !== null
          ? String(originalForwardValue).trim()
          : '';

        return {
          value,
          label: label || value,
          forwardValue: forwardValue || value,
        };
      })
      .filter(Boolean);

    const siteFormatMap = {};
    sites.forEach((site) => {
      const params = normalizeFormatParams(parseJsonArray(site.formatParams));
      if (params.length > 0) {
        siteFormatMap[`site_${site.id}`] = {
          name: site.name,
          params,
        };
      }
    });

    const accountFormatMap = {};
    accounts.forEach((account) => {
      const params = normalizeFormatParams(parseJsonArray(account.formatParams));
      if (params.length > 0) {
        accountFormatMap[`account_${account.id}`] = {
          name: account.name,
          params,
        };
      }
    });

    res.json({
      success: true,
      data: {
        sites: siteFormatMap,
        accounts: accountFormatMap,
      },
    });
  } catch (error) {
    logger.error('获取格式参数配置失败:', error);
    res.status(500).json({ success: false, message: '获取格式参数配置失败' });
  }
};

const cleanupLogs = async (req, res) => {
  try {
    const { deleteStartDate, deleteEndDate, errorMessage } = parseCleanupDateRange(req.body);
    if (errorMessage) {
      return res.status(400).json({ success: false, message: errorMessage });
    }

    const deletedCount = await logStatsService.deleteLogsByDateRange(deleteStartDate, deleteEndDate);

    res.json({
      success: true,
      message: `清理成功，共删除 ${deletedCount} 条日志`,
      data: {
        deletedCount,
      },
    });
  } catch (error) {
    logger.error('清理日志失败:', error);
    res.status(500).json({ success: false, message: '清理日志失败' });
  }
};

const previewCleanupLogs = async (req, res) => {
  try {
    const { deleteStartDate, deleteEndDate, errorMessage } = parseCleanupDateRange(req.body);
    if (errorMessage) {
      return res.status(400).json({ success: false, message: errorMessage });
    }

    const previewData = await logStatsService.previewDeleteLogsByDateRange(deleteStartDate, deleteEndDate);

    res.json({
      success: true,
      data: {
        deleteStartDate: deleteStartDate ? getChinaDateStr(deleteStartDate) : null,
        deleteEndDate: getChinaDateStr(deleteEndDate),
        ...previewData,
      },
    });
  } catch (error) {
    logger.error('预览清理日志失败:', error);
    res.status(500).json({ success: false, message: '预览清理日志失败' });
  }
};

module.exports = {
  cleanupLogs,
  getChartData,
  getDetail,
  getDurationConfig,
  getFormatConfig,
  getList,
  getStats,
  previewCleanupLogs,
};
