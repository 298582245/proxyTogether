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
};
