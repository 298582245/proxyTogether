const logger = require('../utils/logger');

// 错误处理中间件
const errorHandler = (err, req, res, next) => {
  logger.error('请求错误:', {
    url: req.originalUrl,
    method: req.method,
    error: err.message,
    stack: err.stack,
  });

  // 判断是否是已知的业务错误
  if (err.isKnownError) {
    return res.status(err.statusCode || 400).json({
      success: false,
      message: err.message,
    });
  }

  // Sequelize验证错误
  if (err.name === 'SequelizeValidationError') {
    const messages = err.errors.map((e) => e.message);
    return res.status(400).json({
      success: false,
      message: messages.join(', '),
    });
  }

  // Sequelize唯一约束错误
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(400).json({
      success: false,
      message: '数据已存在',
    });
  }

  // 默认服务器错误
  res.status(500).json({
    success: false,
    message: '服务器内部错误',
  });
};

// 404处理
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: '接口不存在',
  });
};

module.exports = {
  errorHandler,
  notFoundHandler,
};
