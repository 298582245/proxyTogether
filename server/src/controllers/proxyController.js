const crypto = require('crypto');
const proxyService = require('../services/proxyService');
const logStatsService = require('../services/logStatsService');
const logger = require('../utils/logger');

const createRequestId = () => {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2, 12)}`;
};

const logProxyRequest = async (data) => {
  try {
    await logStatsService.createProxyLog(data);
  } catch (error) {
    logger.error('proxy log write failed:', error);
  }
};

const getProxy = async (req, res) => {
  try {
    const { duration, times, format, remark } = req.query;
    const clientIp = req.clientIp;
    const durationValue = times || duration;
    const requestId = createRequestId();

    if (!durationValue) {
      await logProxyRequest({
        requestId,
        clientIp,
        duration: null,
        format: format || null,
        success: false,
        errorMessage: 'missing times parameter',
        remark: remark || null,
      });
      return res.status(400).json({ success: false, message: '缺少时长参数(times)' });
    }

    const durationNum = parseInt(durationValue, 10);
    if (Number.isNaN(durationNum)) {
      await logProxyRequest({
        requestId,
        clientIp,
        duration: null,
        format: format || null,
        success: false,
        errorMessage: 'invalid times parameter',
        remark: remark || null,
      });
      return res.status(400).json({ success: false, message: '时长参数格式错误' });
    }

    const formatValue = format || 'txt';
    logger.info(`proxy request: ip=${clientIp}, times=${durationNum}, format=${formatValue}, remark=${remark || ''}`);

    const result = await proxyService.getProxy(durationNum, formatValue, clientIp, [], remark, requestId);

    if (result.success) {
      return res.send(result.data.response);
    }

    return res.status(400).json({
      success: false,
      message: result.message,
    });
  } catch (error) {
    logger.error('get proxy failed:', error);
    return res.status(500).json({ success: false, message: '获取代理失败' });
  }
};

const getProxyDetail = async (req, res) => {
  try {
    const { duration, times, format, remark } = req.query;
    const clientIp = req.clientIp;
    const durationValue = times || duration;
    const requestId = createRequestId();

    if (!durationValue) {
      return res.status(400).json({ success: false, message: '缺少时长参数(times)' });
    }

    const durationNum = parseInt(durationValue, 10);
    if (Number.isNaN(durationNum)) {
      return res.status(400).json({ success: false, message: '时长参数格式错误' });
    }

    const formatValue = format || 'txt';
    const result = await proxyService.getProxy(durationNum, formatValue, clientIp, [], remark, requestId);
    return res.json(result);
  } catch (error) {
    logger.error('get proxy detail failed:', error);
    return res.status(500).json({ success: false, message: '获取代理详情失败' });
  }
};

module.exports = {
  getProxy,
  getProxyDetail,
};
