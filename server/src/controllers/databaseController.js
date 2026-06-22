const databaseBackupService = require('../services/databaseBackupService');
const SystemConfig = require('../models/SystemConfig');
const cacheService = require('../services/cacheService');
const scheduler = require('../schedulers/balanceScheduler');
const logger = require('../utils/logger');

const CONFIG_KEYS = [
  'database_backup_enabled',
  'database_backup_mode',
  'database_backup_hour',
  'database_backup_minute',
  'database_backup_interval_hours',
  'database_backup_retention_count',
  'database_backup_directory',
  'database_backup_max_upload_mb',
];

const sendError = (res, error, fallbackMessage) => {
  const statusCode = error.statusCode || (error.isKnownError ? 400 : 500);
  res.status(statusCode).json({
    success: false,
    message: error.isKnownError ? error.message : fallbackMessage,
  });
};

const normalizeConfigPayload = (body = {}) => {
  if (Array.isArray(body.configs)) {
    return body.configs;
  }

  return CONFIG_KEYS
    .filter((key) => body[key] !== undefined)
    .map((key) => ({ key, value: body[key] }));
};

const getBackupConfig = async (req, res) => {
  try {
    const config = await databaseBackupService.getBackupConfig();
    res.json({ success: true, data: config });
  } catch (error) {
    logger.error('获取数据库备份配置失败:', error);
    sendError(res, error, '获取数据库备份配置失败');
  }
};

const updateBackupConfig = async (req, res) => {
  try {
    const configs = normalizeConfigPayload(req.body);
    if (!configs.length) {
      return res.status(400).json({ success: false, message: '参数格式错误' });
    }

    const normalizedConfigs = configs
      .filter((item) => item && CONFIG_KEYS.includes(item.key))
      .map((item) => ({
        key: item.key,
        value: databaseBackupService.validateAndNormalizeConfigValue(item.key, item.value),
      }));

    for (const item of normalizedConfigs) {
      await SystemConfig.setValue(item.key, item.value);
      await cacheService.deleteConfigCache(item.key);
    }

    await scheduler.restartDatabaseBackupJob();
    const config = await databaseBackupService.getBackupConfig();
    res.json({ success: true, message: '数据库备份配置更新成功', data: config });
  } catch (error) {
    logger.error('更新数据库备份配置失败:', error);
    sendError(res, error, '更新数据库备份配置失败');
  }
};

const runBackup = async (req, res) => {
  try {
    const result = await databaseBackupService.runBackup();
    res.json({ success: true, message: '数据库备份完成', data: result });
  } catch (error) {
    logger.error('数据库备份失败:', error);
    sendError(res, error, '数据库备份失败');
  }
};

const exportDatabase = async (req, res) => {
  try {
    const result = await databaseBackupService.exportDatabase();
    res.json({ success: true, message: '数据库导出完成', data: result });
  } catch (error) {
    logger.error('数据库导出失败:', error);
    sendError(res, error, '数据库导出失败');
  }
};

const listBackups = async (req, res) => {
  try {
    const backups = await databaseBackupService.listBackups();
    res.json({ success: true, data: backups });
  } catch (error) {
    logger.error('获取数据库备份列表失败:', error);
    sendError(res, error, '获取数据库备份列表失败');
  }
};

const downloadBackup = async (req, res) => {
  try {
    const { fileName } = req.params;
    const filePath = await databaseBackupService.downloadBackup(fileName);
    res.download(filePath, fileName);
  } catch (error) {
    logger.error('下载数据库备份失败:', error);
    sendError(res, error, '下载数据库备份失败');
  }
};

const deleteBackup = async (req, res) => {
  try {
    const { fileName } = req.params;
    await databaseBackupService.deleteBackup(fileName);
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    logger.error('删除数据库备份失败:', error);
    sendError(res, error, '删除数据库备份失败');
  }
};

const importDatabase = async (req, res) => {
  const uploadedFilePath = req.file && req.file.path;
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '请上传 .sql 文件' });
    }
    if (String(req.body.confirmOverwrite) !== 'true') {
      return res.status(400).json({ success: false, message: '导入数据库前必须确认覆盖风险' });
    }

    const result = await databaseBackupService.importDatabase(uploadedFilePath, req.file.originalname);
    await cacheService.clearAllConfigCache();
    await scheduler.restartBalanceCheckJob();
    await scheduler.restartLogStatsJobs();
    await scheduler.restartProxyKeepaliveJob();
    await scheduler.restartDatabaseBackupJob();
    res.json({ success: true, message: '数据库导入完成', data: result });
  } catch (error) {
    logger.error('数据库导入失败:', error);
    sendError(res, error, '数据库导入失败');
  } finally {
    await databaseBackupService.cleanupUploadFile(uploadedFilePath);
  }
};

const getOperationStatus = async (req, res) => {
  try {
    res.json({ success: true, data: databaseBackupService.getOperationStatus() });
  } catch (error) {
    logger.error('获取数据库维护任务状态失败:', error);
    sendError(res, error, '获取数据库维护任务状态失败');
  }
};

module.exports = {
  deleteBackup,
  downloadBackup,
  exportDatabase,
  getBackupConfig,
  getOperationStatus,
  importDatabase,
  listBackups,
  runBackup,
  updateBackupConfig,
};
