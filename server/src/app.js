// 设置时区为中国标准时间，确保统计等功能的时间计算正确
process.env.TZ = 'Asia/Shanghai';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const config = require('./config');
const { testConnection, syncDatabase, Site, Account } = require('./models');
const cacheService = require('./services/cacheService');
const authController = require('./controllers/authController');
const routes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');
const scheduler = require('./schedulers/balanceScheduler');
const logger = require('./utils/logger');

const app = express();

app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 请求日志
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API路由
app.use('/api', routes);

// 404处理
app.use(notFoundHandler);

// 错误处理
app.use(errorHandler);

// 启动服务
const startServer = async () => {
  try {
    // 测试数据库连接
    await testConnection();

    // 同步数据库模型（不强制重建）
    await syncDatabase(false);

    // 初始化Redis
    await cacheService.initRedis();

    // 初始化JWT密钥
    await authController.initJwtKeys();

    // 启动定时任务
    await scheduler.initSchedulers();

    // 启动HTTP服务
    app.listen(config.port, '0.0.0.0', () => {
      logger.info(`服务器已启动，端口: ${config.port}`);
      logger.info(`代理接口地址: http://localhost:${config.port}/api/proxy/get`);
      logger.info(`后台管理地址: http://localhost:${config.port}/api/admin`);
    });
  } catch (error) {
    logger.error('服务器启动失败:', error);
    process.exit(1);
  }
};

// 优雅关闭
process.on('SIGINT', async () => {
  logger.info('正在关闭服务器...');
  await scheduler.stopAllSchedulers();
  await cacheService.closeRedis();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('正在关闭服务器...');
  await scheduler.stopAllSchedulers();
  await cacheService.closeRedis();
  process.exit(0);
});

startServer();
