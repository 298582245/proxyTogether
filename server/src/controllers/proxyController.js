const proxyService = require('../services/proxyService');
const ProxyLog = require('../models/ProxyLog');
const logger = require('../utils/logger');

/**
 * 记录代理请求日志
 */
const logProxyRequest = async (data) => {
  try {
    await ProxyLog.create({
      accountId: data.accountId,
      siteId: data.siteId,
      clientIp: data.clientIp,
      duration: data.duration,
      format: data.format,
      success: data.success ? 1 : 0,
      cost: data.cost || 0,
      errorMessage: data.errorMessage,
      remark: data.remark,
      responsePreview: data.responsePreview,
    });
  } catch (error) {
    logger.error('记录代理日志失败:', error);
  }
};

/**
 * 获取代理IP
 * GET /proxy/get
 * 参数: times(时长值), format, token, remark(可选)
 * 兼容旧参数: duration
 */
const getProxy = async (req, res) => {
  try {
    const { duration, times, format, remark } = req.query;
    const clientIp = req.clientIp;

    // 兼容 duration 和 times 参数
    const durationValue = times || duration;

    // 验证参数
    if (!durationValue) {
      await logProxyRequest({
        clientIp,
        duration: null,
        format: format || null,
        success: false,
        errorMessage: '缺少时长参数(times)',
        remark: remark || null,
      });
      return res.status(400).json({
        success: false,
        message: '缺少时长参数(times)',
      });
    }

    const durationNum = parseInt(durationValue, 10);
    if (isNaN(durationNum)) {
      await logProxyRequest({
        clientIp,
        duration: null,
        format: format || null,
        success: false,
        errorMessage: '时长参数格式错误',
        remark: remark || null,
      });
      return res.status(400).json({
        success: false,
        message: '时长参数格式错误',
      });
    }

    const formatValue = format || 'txt';

    logger.info(`代理请求 - IP: ${clientIp}, 时长: ${durationNum}, 格式: ${formatValue}, 备注: ${remark || '无'}`);

    // 获取代理
    const result = await proxyService.getProxy(durationNum, formatValue, clientIp, [], remark);

    if (result.success) {
      // 直接返回原始响应
      res.send(result.data.response);
    } else {
      res.status(400).json({
        success: false,
        message: result.message,
      });
    }
  } catch (error) {
    logger.error('获取代理失败:', error);
    res.status(500).json({
      success: false,
      message: '获取代理失败',
    });
  }
};

/**
 * 获取代理（JSON格式返回，包含详细信息）
 * GET /proxy/detail
 */
const getProxyDetail = async (req, res) => {
  try {
    const { duration, times, format, remark } = req.query;
    const clientIp = req.clientIp;

    // 兼容 duration 和 times 参数
    const durationValue = times || duration;

    if (!durationValue) {
      return res.status(400).json({
        success: false,
        message: '缺少时长参数(times)',
      });
    }

    const durationNum = parseInt(durationValue, 10);
    const formatValue = format || 'txt';

    const result = await proxyService.getProxy(durationNum, formatValue, clientIp, [], remark);

    res.json(result);
  } catch (error) {
    logger.error('获取代理详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取代理详情失败',
    });
  }
};

module.exports = {
  getProxy,
  getProxyDetail,
};
