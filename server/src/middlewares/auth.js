const jwtUtil = require('../utils/jwt');
const logger = require('../utils/logger');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: '未提供认证 Token',
      });
    }

    const decoded = jwtUtil.verifyToken(token);
    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Token 无效或已过期',
      });
    }

    req.user = decoded;
    next();
  } catch (error) {
    logger.error('JWT 认证失败:', error);
    return res.status(401).json({
      success: false,
      message: '认证失败',
    });
  }
};

module.exports = authMiddleware;
