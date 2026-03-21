const SystemConfig = require('../models/SystemConfig');
const ProxyLog = require('../models/ProxyLog');
const cacheService = require('../services/cacheService');
const logger = require('../utils/logger');

const normalizeClientIp = (ip) => {
  if (!ip) {
    return 'unknown';
  }

  if (ip === '::1') {
    return '127.0.0.1';
  }

  if (ip.startsWith('::ffff:')) {
    return ip.substring(7);
  }

  return ip;
};

const getClientIp = (req) => normalizeClientIp(
  req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress,
);

const getHeaderToken = (req) => {
  const headerToken = req.headers['x-proxy-token'];
  if (headerToken) {
    return headerToken;
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return null;
};

const getRequestToken = (req) => {
  const headerToken = getHeaderToken(req);
  if (headerToken) {
    return headerToken;
  }

  if (req.method === 'GET' && typeof req.query?.token === 'string') {
    return req.query.token;
  }

  return null;
};

const logAuthFailure = async (clientIp, errorMessage) => {
  try {
    await ProxyLog.create({
      accountId: null,
      siteId: null,
      clientIp,
      duration: null,
      format: null,
      success: 0,
      cost: 0,
      errorMessage,
      responsePreview: null,
    });
  } catch (error) {
    logger.error('记录代理认证失败日志失败:', error);
  }
};

const proxyAuthMiddleware = async (req, res, next) => {
  try {
    const clientIp = getClientIp(req);
    req.clientIp = clientIp;

    let proxyToken = await cacheService.getConfigCache('proxy_token');
    let ipWhitelist = await cacheService.getConfigCache('ip_whitelist');

    if (proxyToken === null) {
      proxyToken = await SystemConfig.getValue('proxy_token', '');
      await cacheService.setConfigCache('proxy_token', proxyToken || '');
    }

    if (ipWhitelist === null) {
      ipWhitelist = await SystemConfig.getValue('ip_whitelist', '[]');
      await cacheService.setConfigCache('ip_whitelist', ipWhitelist);
    }

    let ipList = [];
    try {
      ipList = JSON.parse(ipWhitelist || '[]');
    } catch (error) {
      ipList = [];
    }

    ipList = ipList.filter((ip) => ip && ip.trim());

    if (proxyToken && proxyToken.trim()) {
      const requestToken = getRequestToken(req);
      if (!requestToken || requestToken !== proxyToken) {
        logger.warn(`代理接口 Token 验证失败，IP: ${clientIp}`);
        await logAuthFailure(clientIp, 'Token 无效');
        return res.status(403).json({
          success: false,
          message: 'Token 无效',
        });
      }
    }

    if (ipList.length > 0) {
      const isAllowed = ipList.some((ip) => {
        if (ip.includes('*')) {
          const pattern = ip.replace(/\./g, '\\.').replace(/\*/g, '.*');
          return new RegExp(`^${pattern}$`).test(clientIp);
        }
        return ip === clientIp;
      });

      if (!isAllowed) {
        logger.warn(`代理接口 IP 白名单验证失败，IP: ${clientIp}`);
        await logAuthFailure(clientIp, 'IP 不在白名单中');
        return res.status(403).json({
          success: false,
          message: 'IP 不在白名单中',
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
