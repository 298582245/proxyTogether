const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const logger = require('../utils/logger');

const hasColumn = async (tableName, columnName) => {
  try {
    const columns = await sequelize.getQueryInterface().describeTable(tableName);
    return Boolean(columns[columnName]);
  } catch (error) {
    logger.error(`describe table failed: ${tableName}`, error);
    throw error;
  }
};

const hasIndex = async (tableName, indexName) => {
  const rows = await sequelize.query(
    `SHOW INDEX FROM \`${tableName}\` WHERE Key_name = :indexName`,
    {
      replacements: { indexName },
      type: QueryTypes.SELECT,
    },
  );

  return rows.length > 0;
};

const ensureProxyLogsRequestId = async () => {
  if (!(await hasColumn('proxy_logs', 'request_id'))) {
    await sequelize.query(
      'ALTER TABLE `proxy_logs` ADD COLUMN `request_id` VARCHAR(64) NULL DEFAULT NULL AFTER `site_id`',
      { type: QueryTypes.RAW },
    );
  }

  if (!(await hasIndex('proxy_logs', 'idx_request_id'))) {
    await sequelize.query(
      'ALTER TABLE `proxy_logs` ADD INDEX `idx_request_id` (`request_id`)',
      { type: QueryTypes.RAW },
    );
  }
};

const ensureProxyLogRequestDailyStatsTable = async () => {
  await sequelize.query(
    `
      CREATE TABLE IF NOT EXISTS \`proxy_log_request_daily_stats\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`stat_date\` DATE NOT NULL,
        \`request_count\` INT NOT NULL DEFAULT 0,
        \`success_count\` INT NOT NULL DEFAULT 0,
        \`fail_count\` INT NOT NULL DEFAULT 0,
        \`attempt_count\` INT NOT NULL DEFAULT 0,
        \`total_cost\` DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uniq_proxy_log_request_daily_stats\` (\`stat_date\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `,
    { type: QueryTypes.RAW },
  );
};

const ensureProxyLogHourlyStatsTable = async () => {
  await sequelize.query(
    `
      CREATE TABLE IF NOT EXISTS \`proxy_log_hourly_stats\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`stat_date\` DATE NOT NULL,
        \`stat_hour\` TINYINT NOT NULL,
        \`request_count\` INT NOT NULL DEFAULT 0,
        \`success_count\` INT NOT NULL DEFAULT 0,
        \`fail_count\` INT NOT NULL DEFAULT 0,
        \`total_cost\` DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uniq_proxy_log_hourly_stats\` (\`stat_date\`, \`stat_hour\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `,
    { type: QueryTypes.RAW },
  );
};

const ensureProxyLogRemarkDailyStatsTable = async () => {
  await sequelize.query(
    `
      CREATE TABLE IF NOT EXISTS \`proxy_log_remark_daily_stats\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`stat_date\` DATE NOT NULL,
        \`remark\` VARCHAR(255) NOT NULL,
        \`request_count\` INT NOT NULL DEFAULT 0,
        \`success_count\` INT NOT NULL DEFAULT 0,
        \`fail_count\` INT NOT NULL DEFAULT 0,
        \`total_cost\` DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uniq_proxy_log_remark_daily_stats\` (\`stat_date\`, \`remark\`),
        KEY \`idx_proxy_log_remark_daily_stats_total_cost\` (\`total_cost\`),
        KEY \`idx_proxy_log_remark_daily_stats_request_count\` (\`request_count\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `,
    { type: QueryTypes.RAW },
  );
};

const runSchemaMigrations = async () => {
  await ensureProxyLogsRequestId();
  await ensureProxyLogRequestDailyStatsTable();
  await ensureProxyLogHourlyStatsTable();
  await ensureProxyLogRemarkDailyStatsTable();
};

module.exports = {
  runSchemaMigrations,
};
