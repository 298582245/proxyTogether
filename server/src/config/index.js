require('dotenv').config();

module.exports = {
  // 服务器配置
  port: parseInt(process.env.PORT, 10) || 3000,

  // 数据库配置
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    name: process.env.DB_NAME || 'proxy_together',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  },

  // Redis配置
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },

  // JWT配置
  jwt: {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  // 同端口正向代理配置
  forwardProxy: {
    enabled: process.env.FORWARD_PROXY_ENABLED === 'true',
    username: process.env.FORWARD_PROXY_USERNAME || '',
    password: process.env.FORWARD_PROXY_PASSWORD || '',
    duration: parseInt(process.env.FORWARD_PROXY_DURATION, 10) || 5,
    format: process.env.FORWARD_PROXY_FORMAT || 'txt',
    remark: process.env.FORWARD_PROXY_REMARK || '正向代理',
    timeout: parseInt(process.env.FORWARD_PROXY_TIMEOUT, 10) || 30000,
    maxAttempts: parseInt(process.env.FORWARD_PROXY_MAX_ATTEMPTS, 10) || 3,
  },
};
