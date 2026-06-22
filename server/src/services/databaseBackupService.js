const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const config = require('../config');
const SystemConfig = require('../models/SystemConfig');
const logger = require('../utils/logger');

const SERVER_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_BACKUP_DIRECTORY = 'backups/database';
const ALLOWED_PREFIXES = ['auto', 'manual', 'export', 'pre_import'];
const CONFIG_DEFAULTS = [
  { key: 'database_backup_enabled', value: '0', description: '数据库自动备份开关(1启用 0禁用)' },
  { key: 'database_backup_mode', value: 'daily', description: '数据库自动备份模式(daily/interval)' },
  { key: 'database_backup_hour', value: '3', description: '数据库自动备份小时(0-23)' },
  { key: 'database_backup_minute', value: '30', description: '数据库自动备份分钟(0-59)' },
  { key: 'database_backup_interval_hours', value: '24', description: '数据库自动备份间隔小时(1-168)' },
  { key: 'database_backup_retention_count', value: '7', description: '数据库本地备份保留份数' },
  { key: 'database_backup_directory', value: DEFAULT_BACKUP_DIRECTORY, description: '数据库备份目录' },
  { key: 'database_backup_max_upload_mb', value: '100', description: '数据库导入SQL最大上传大小(MB)' },
  { key: 'database_backup_last_run_at', value: '', description: '数据库自动备份上次执行时间' },
  { key: 'database_backup_last_result', value: '', description: '数据库自动备份上次执行结果' },
];

let currentOperation = null;

const normalizeInteger = (value, defaultValue, minValue, maxValue) => {
  const parsedValue = Number.parseInt(value, 10);
  if (Number.isNaN(parsedValue)) {
    return defaultValue;
  }
  return Math.min(Math.max(parsedValue, minValue), maxValue);
};

const createKnownError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.isKnownError = true;
  error.statusCode = statusCode;
  return error;
};

const validateBackupDirectory = (value) => {
  const directory = String(value || '').trim();
  if (!directory) {
    throw createKnownError('备份目录不能为空');
  }
  if (path.isAbsolute(directory) || directory.includes('..') || /[\x00-\x1f*?"<>|:]/.test(directory)) {
    throw createKnownError('备份目录不能包含绝对路径、路径穿越、控制字符或通配符');
  }

  const resolvedPath = path.resolve(SERVER_ROOT, directory);
  const relativePath = path.relative(SERVER_ROOT, resolvedPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw createKnownError('备份目录必须位于 server 目录内');
  }
  return directory.replace(/\\/g, '/');
};

const validateAndNormalizeConfigValue = (key, value) => {
  if (key === 'database_backup_enabled') {
    return String(value) === '1' || value === true ? '1' : '0';
  }
  if (key === 'database_backup_mode') {
    const mode = String(value || '').trim();
    if (!['daily', 'interval'].includes(mode)) {
      throw createKnownError('自动备份模式只能是 daily 或 interval');
    }
    return mode;
  }
  if (key === 'database_backup_hour') {
    return String(normalizeInteger(value, 3, 0, 23));
  }
  if (key === 'database_backup_minute') {
    return String(normalizeInteger(value, 30, 0, 59));
  }
  if (key === 'database_backup_interval_hours') {
    return String(normalizeInteger(value, 24, 1, 168));
  }
  if (key === 'database_backup_retention_count') {
    return String(normalizeInteger(value, 7, 1, 365));
  }
  if (key === 'database_backup_directory') {
    return validateBackupDirectory(value);
  }
  if (key === 'database_backup_max_upload_mb') {
    return String(normalizeInteger(value, 100, 1, 2048));
  }
  if (key === 'database_backup_last_run_at' || key === 'database_backup_last_result') {
    return value === undefined || value === null ? '' : String(value);
  }
  return value;
};

const ensureDatabaseBackupConfigDefaults = async () => {
  for (const item of CONFIG_DEFAULTS) {
    const [record, created] = await SystemConfig.findOrCreate({
      where: { configKey: item.key },
      defaults: {
        configKey: item.key,
        configValue: item.value,
        description: item.description,
      },
    });

    if (!created && record.description !== item.description) {
      record.description = item.description;
      await record.save();
    }
  }
};

const getBackupConfig = async () => {
  await ensureDatabaseBackupConfigDefaults();
  const values = {};
  await Promise.all(CONFIG_DEFAULTS.map(async (item) => {
    values[item.key] = await SystemConfig.getValue(item.key, item.value);
  }));

  return {
    enabled: String(values.database_backup_enabled) === '1',
    mode: ['daily', 'interval'].includes(values.database_backup_mode) ? values.database_backup_mode : 'daily',
    hour: normalizeInteger(values.database_backup_hour, 3, 0, 23),
    minute: normalizeInteger(values.database_backup_minute, 30, 0, 59),
    intervalHours: normalizeInteger(values.database_backup_interval_hours, 24, 1, 168),
    retentionCount: normalizeInteger(values.database_backup_retention_count, 7, 1, 365),
    directory: validateBackupDirectory(values.database_backup_directory || DEFAULT_BACKUP_DIRECTORY),
    maxUploadMb: normalizeInteger(values.database_backup_max_upload_mb, 100, 1, 2048),
    lastRunAt: values.database_backup_last_run_at || '',
    lastResult: values.database_backup_last_result || '',
  };
};

const getBackupDirectory = async () => {
  const backupConfig = await getBackupConfig();
  const backupDirectory = path.resolve(SERVER_ROOT, backupConfig.directory);
  await fsp.mkdir(backupDirectory, { recursive: true });
  return backupDirectory;
};

const getUploadDirectory = () => {
  const uploadDirectory = path.resolve(SERVER_ROOT, 'backups/uploads');
  fs.mkdirSync(uploadDirectory, { recursive: true });
  return uploadDirectory;
};

const getMaxUploadBytes = async () => {
  const maxUploadMb = await SystemConfig.getValue('database_backup_max_upload_mb', '100');
  return normalizeInteger(maxUploadMb, 100, 1, 2048) * 1024 * 1024;
};

const formatTimestamp = (date = new Date()) => date.toISOString().replace(/[-:]/g, '').replace(/\.(\d{3})Z$/, '$1Z');
const safeDatabaseName = () => config.database.name.replace(/[^a-zA-Z0-9_-]/g, '_');
const createBackupFileName = (prefix) => `${prefix}_${safeDatabaseName()}_${formatTimestamp()}.sql`;

const isManagedFileName = (fileName) => {
  const escapedDbName = safeDatabaseName().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^(${ALLOWED_PREFIXES.join('|')})_${escapedDbName}_\\d{8}T\\d{9}Z\\.sql$`);
  return pattern.test(fileName);
};

const resolveManagedFile = async (fileName) => {
  if (!isManagedFileName(fileName)) {
    throw createKnownError('备份文件名不合法');
  }

  const backupDirectory = await getBackupDirectory();
  const targetPath = path.resolve(backupDirectory, fileName);
  const relativePath = path.relative(backupDirectory, targetPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw createKnownError('备份文件路径不合法');
  }
  return targetPath;
};

const getFileType = (fileName) => {
  if (fileName.startsWith('pre_import_')) {
    return 'pre_import';
  }
  return fileName.split('_', 1)[0];
};

const runMysqlCli = (command, args, options = {}) => new Promise((resolve, reject) => {
  const env = { ...process.env };
  if (config.database.password) {
    env.MYSQL_PWD = config.database.password;
  }

  const stdio = [options.stdinFile ? 'pipe' : 'ignore', options.stdoutFile ? 'pipe' : 'ignore', 'pipe'];
  const child = spawn(command, args, {
    shell: false,
    env,
    stdio,
  });

  let stderr = '';
  let settled = false;
  let childClosed = false;
  let childCode = null;
  let outputFinished = !options.stdoutFile;

  const settleError = (error) => {
    if (settled) {
      return;
    }
    settled = true;
    reject(error);
  };

  const settleSuccess = () => {
    if (settled || !childClosed || !outputFinished) {
      return;
    }

    settled = true;
    if (childCode === 0) {
      resolve();
      return;
    }
    reject(createKnownError(`${command} 执行失败: ${stderr || `退出码 ${childCode}`}`, 500));
  };

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  if (options.stdoutFile) {
    const outputStream = fs.createWriteStream(options.stdoutFile);
    child.stdout.pipe(outputStream);
    outputStream.on('finish', () => {
      outputFinished = true;
      settleSuccess();
    });
    outputStream.on('error', settleError);
  }

  if (options.stdinFile) {
    const inputStream = fs.createReadStream(options.stdinFile);
    inputStream.on('error', settleError);
    child.stdin.on('error', (error) => {
      if (error.code !== 'EPIPE') {
        settleError(error);
      }
    });
    inputStream.pipe(child.stdin);
  }

  child.on('error', (error) => {
    settleError(createKnownError(`${command} 执行失败，请确认 MySQL CLI 可用: ${error.message}`, 500));
  });

  child.on('close', (code) => {
    childClosed = true;
    childCode = code;
    settleSuccess();
  });
});

const getDumpArgs = () => [
  '--host', config.database.host,
  '--port', String(config.database.port),
  '--user', config.database.user,
  '--single-transaction',
  '--routines',
  '--triggers',
  '--events',
  '--default-character-set=utf8mb4',
  '--databases', config.database.name,
];

const getImportArgs = () => [
  '--host', config.database.host,
  '--port', String(config.database.port),
  '--user', config.database.user,
  '--default-character-set=utf8mb4',
  config.database.name,
];

const createDumpFile = async (prefix) => {
  const backupDirectory = await getBackupDirectory();
  const fileName = createBackupFileName(prefix);
  const filePath = path.join(backupDirectory, fileName);
  const command = process.env.MYSQLDUMP_PATH || 'mysqldump';
  await runMysqlCli(command, getDumpArgs(), { stdoutFile: filePath });
  const stats = await fsp.stat(filePath);
  return {
    fileName,
    filePath,
    size: stats.size,
    createdAt: stats.birthtime,
    type: getFileType(fileName),
  };
};

const listBackups = async () => {
  const backupDirectory = await getBackupDirectory();
  const names = await fsp.readdir(backupDirectory);
  const rows = [];

  for (const fileName of names) {
    if (!isManagedFileName(fileName)) {
      continue;
    }
    const filePath = path.join(backupDirectory, fileName);
    const stats = await fsp.stat(filePath);
    if (!stats.isFile()) {
      continue;
    }
    rows.push({
      fileName,
      size: stats.size,
      createdAt: stats.birthtime,
      type: getFileType(fileName),
    });
  }

  return rows.sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
};

const cleanupOldBackups = async () => {
  const backupConfig = await getBackupConfig();
  const backups = (await listBackups()).filter((backup) => backup.type !== 'export');
  const expiredBackups = backups.slice(backupConfig.retentionCount);
  for (const backup of expiredBackups) {
    const filePath = await resolveManagedFile(backup.fileName);
    await fsp.unlink(filePath);
  }
  return expiredBackups.length;
};

const withOperation = async (type, fn) => {
  if (currentOperation) {
    throw createKnownError(`当前已有数据库维护任务执行中: ${currentOperation.type}`, 409);
  }

  currentOperation = {
    type,
    startedAt: new Date().toISOString(),
  };

  try {
    return await fn();
  } finally {
    currentOperation = null;
  }
};

const runBackup = () => withOperation('manual_backup', async () => {
  const result = await createDumpFile('manual');
  const deletedCount = await cleanupOldBackups();
  return { ...result, deletedCount };
});

const exportDatabase = () => withOperation('export', async () => {
  const result = await createDumpFile('export');
  const deletedCount = await cleanupOldBackups();
  return { ...result, deletedCount };
});

const shouldRunAutoBackup = async () => {
  const backupConfig = await getBackupConfig();
  if (backupConfig.mode !== 'interval') {
    return true;
  }

  if (!backupConfig.lastRunAt) {
    return true;
  }

  const lastRunAt = new Date(backupConfig.lastRunAt);
  if (Number.isNaN(lastRunAt.getTime())) {
    return true;
  }

  return Date.now() - lastRunAt.getTime() >= backupConfig.intervalHours * 60 * 60 * 1000;
};

const runAutoBackup = () => withOperation('auto_backup', async () => {
  try {
    const result = await createDumpFile('auto');
    const deletedCount = await cleanupOldBackups();
    await SystemConfig.setValue('database_backup_last_run_at', new Date().toISOString());
    await SystemConfig.setValue('database_backup_last_result', `成功: ${result.fileName}`);
    currentOperation = {
      ...currentOperation,
      fileName: result.fileName,
    };
    return { ...result, deletedCount };
  } catch (error) {
    await SystemConfig.setValue('database_backup_last_run_at', new Date().toISOString());
    await SystemConfig.setValue('database_backup_last_result', `失败: ${error.message}`.slice(0, 500));
    throw error;
  }
});

const downloadBackup = async (fileName) => {
  const filePath = await resolveManagedFile(fileName);
  await fsp.access(filePath, fs.constants.R_OK);
  return filePath;
};

const deleteBackup = async (fileName) => {
  const filePath = await resolveManagedFile(fileName);
  await fsp.unlink(filePath);
  return true;
};

const importDatabase = (uploadedFilePath, originalName = '') => withOperation('import', async () => {
  if (!originalName.toLowerCase().endsWith('.sql')) {
    throw createKnownError('只支持上传 .sql 文件');
  }

  const backupConfig = await getBackupConfig();
  const stats = await fsp.stat(uploadedFilePath);
  if (stats.size <= 0) {
    throw createKnownError('上传文件为空');
  }
  if (stats.size > backupConfig.maxUploadMb * 1024 * 1024) {
    throw createKnownError(`上传文件不能超过 ${backupConfig.maxUploadMb} MB`, 413);
  }

  const preImportBackup = await createDumpFile('pre_import');
  const command = process.env.MYSQL_PATH || 'mysql';
  await runMysqlCli(command, getImportArgs(), { stdinFile: uploadedFilePath });
  const deletedCount = await cleanupOldBackups();
  return {
    preImportBackup,
    deletedCount,
  };
});

const getOperationStatus = () => ({
  running: Boolean(currentOperation),
  operation: currentOperation,
});

const cleanupUploadFile = async (filePath) => {
  if (!filePath) {
    return;
  }
  try {
    await fsp.unlink(filePath);
  } catch (error) {
    logger.warn(`清理上传临时文件失败: ${filePath}`, error.message);
  }
};

module.exports = {
  CONFIG_DEFAULTS,
  cleanupUploadFile,
  deleteBackup,
  downloadBackup,
  ensureDatabaseBackupConfigDefaults,
  exportDatabase,
  getBackupConfig,
  getMaxUploadBytes,
  getOperationStatus,
  getUploadDirectory,
  importDatabase,
  listBackups,
  runAutoBackup,
  runBackup,
  shouldRunAutoBackup,
  validateAndNormalizeConfigValue,
};
