const SystemConfig = require('../models/SystemConfig');
const cacheService = require('../services/cacheService');
const logger = require('../utils/logger');

// 获取客户端IP
const getClientIp = (req) => {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    'unknown'
  );
};

// 代理接口认证中间件
const proxyAuthMiddleware = async (req, res, next) => {
  try {
    const clientIp = getClientIp(req);
    req.clientIp = clientIp;

    // 从缓存获取配置（优先从缓存读取）
    let proxyToken = await cacheService.getConfigCache('proxy_token');
    let ipWhitelist = await cacheService.getConfigCache('ip_whitelist');

    // 缓存不存在则从数据库读取
    if (proxyToken === null) {
      proxyToken = await SystemConfig.getValue('proxy_token', '');
      await cacheService.setConfigCache('proxy_token', proxyToken || '');
    }

    if (ipWhitelist === null) {
      ipWhitelist = await SystemConfig.getValue('ip_whitelist', '[]');
      await cacheService.setConfigCache('ip_whitelist', ipWhitelist);
    }

    // 解析IP白名单
    let ipList = [];
    try {
      ipList = JSON.parse(ipWhitelist || '[]');
    } catch (e) {
      ipList = [];
    }

    // 过滤空字符串
    ipList = ipList.filter((ip) => ip && ip.trim());

    // 1. 检查Token（如果配置了）
    if (proxyToken && proxyToken.trim()) {
      const requestToken = req.query.token || req.headers['x-proxy-token'];

      if (!requestToken || requestToken !== proxyToken) {
        logger.warn(`代理接口Token验证失败，IP: ${clientIp}`);
        return res.status(403).json({
          success: false,
          message: 'Token无效',
        });
      }
    }

    // 2. 检查IP白名单（如果配置了）
    if (ipList.length > 0) {
      const isAllowed = ipList.some((ip) => {
        // 支持通配符匹配
        if (ip.includes('*')) {
          const pattern = ip.replace(/\./g, '\\.').replace(/\*/g, '.*');
          const regex = new RegExp(`^${pattern}$`);
          return regex.test(clientIp);
        }
        return ip === clientIp;
      });

      if (!isAllowed) {
        logger.warn(`代理接口IP白名单验证失败，IP: ${clientIp}`);
        return res.status(403).json({
          success: false,
          message: 'IP不在白名单中',
        });
      }
    }

    next();
  } catch (error) {
    logger.error('代理接口认证失败:', error);
    return res.status(500).json({
      success: false,
      message: '认证服务异常',
    });
  }
};

module.exports = proxyAuthMiddleware;
