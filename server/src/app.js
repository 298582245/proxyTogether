process.env.TZ = 'Asia/Shanghai';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const config = require('./config');
const { testConnection } = require('./models');
const cacheService = require('./services/cacheService');
const { runSchemaMigrations } = require('./services/schemaMigrationService');
const authController = require('./controllers/authController');
const routes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');
const scheduler = require('./schedulers/balanceScheduler');
const logger = require('./utils/logger');
const { formatChinaDateTime } = require('./utils/statsTime');

const app = express();

app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: formatChinaDateTime(new Date()) });
});

app.use('/api', routes);
app.use(notFoundHandler);
app.use(errorHandler);

const startServer = async () => {
  try {
    await testConnection();
    await runSchemaMigrations();
    await cacheService.initRedis();
    await authController.initJwtKeys();
    await scheduler.initSchedulers();

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
