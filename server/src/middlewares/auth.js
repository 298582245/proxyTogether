const jwtUtil = require('../utils/jwt');
const logger = require('../utils/logger');

// JWT认证中间件
const authMiddleware = async (req, res, next) => {
  try {
    // 从header获取token
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    // 也可以从query获取
    if (!token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: '未提供认证Token',
      });
    }

    // 验证token
    const decoded = jwtUtil.verifyToken(token);
    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Token无效或已过期',
      });
    }

    // 将用户信息附加到请求对象
    req.user = decoded;
    next();
  } catch (error) {
    logger.error('JWT认证失败:', error);
    return res.status(401).json({
      success: false,
      message: '认证失败',
    });
  }
};

module.exports = authMiddleware;
