const proxyService = require('../services/proxyService');
const logger = require('../utils/logger');

/**
 * 获取代理IP
 * GET /proxy/get
 * 参数: duration, format, token
 */
const getProxy = async (req, res) => {
  try {
    const { duration, format } = req.query;
    const clientIp = req.clientIp;

    // 验证参数
    if (!duration) {
      return res.status(400).json({
        success: false,
        message: '缺少时长参数',
      });
    }

    const durationType = parseInt(duration, 10);
    if (isNaN(durationType)) {
      return res.status(400).json({
        success: false,
        message: '时长参数格式错误',
      });
    }

    const formatValue = format || 'txt';

    logger.info(`代理请求 - IP: ${clientIp}, 时长: ${durationType}, 格式: ${formatValue}`);

    // 获取代理
    const result = await proxyService.getProxy(durationType, formatValue, clientIp);

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
    const { duration, format } = req.query;
    const clientIp = req.clientIp;

    if (!duration) {
      return res.status(400).json({
        success: false,
        message: '缺少时长参数',
      });
    }

    const durationType = parseInt(duration, 10);
    const formatValue = format || 'txt';

    const result = await proxyService.getProxy(durationType, formatValue, clientIp);

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
