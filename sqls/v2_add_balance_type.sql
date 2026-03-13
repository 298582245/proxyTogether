-- 添加余额类型字段到sites表
-- 执行时间: 2026-03-13
-- 兼容MySQL 5.7

-- 检查并添加 balance_type 字段
SET @dbname = DATABASE();
SET @tablename = 'sites';
SET @columnname = 'balance_type';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE `', @tablename, '` ADD COLUMN `', @columnname, '` VARCHAR(20) DEFAULT ''balance'' COMMENT ''余额类型: balance余额查询 monthly包月'' AFTER `duration_params`')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 更新已有数据：如果balance_url为空则设置为包月类型
UPDATE `sites` SET `balance_type` = 'monthly' WHERE `balance_url` IS NULL OR `balance_url` = '';

-- 检查并添加 expire_at 字段到 accounts 表
SET @tablename = 'accounts';
SET @columnname = 'expire_at';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE `', @tablename, '` ADD COLUMN `', @columnname, '` DATETIME NULL DEFAULT NULL COMMENT ''到期时间(包月账号专用)'' AFTER `fail_count`')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 修改 site_id 允许为空（包月账号不需要关联网站）
ALTER TABLE `accounts` MODIFY COLUMN `site_id` INT(11) NULL COMMENT '关联网站ID(包月账号可为空)';

-- 删除外键约束（如果存在）- MySQL 5.7兼容写法
-- 先查询外键名称，然后删除
SET @fk_name = (SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'accounts' AND COLUMN_NAME = 'site_id' AND REFERENCED_TABLE_NAME = 'sites' LIMIT 1);
SET @drop_fk = IF(@fk_name IS NULL, 'SELECT 1', CONCAT('ALTER TABLE `accounts` DROP FOREIGN KEY `', @fk_name, '`'));
PREPARE dropFk FROM @drop_fk;
EXECUTE dropFk;
DEALLOCATE PREPARE dropFk;

-- 检查并添加 format_params 字段
SET @columnname = 'format_params';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE `', @tablename, '` ADD COLUMN `', @columnname, '` JSON NULL COMMENT ''格式参数(包月账号专用)'' AFTER `extract_params`')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 检查并添加 duration_params 字段
SET @columnname = 'duration_params';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE `', @tablename, '` ADD COLUMN `', @columnname, '` JSON NULL COMMENT ''时长参数(包月账号专用)'' AFTER `format_params`')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 检查并添加 extract_url_template 字段
SET @columnname = 'extract_url_template';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE `', @tablename, '` ADD COLUMN `', @columnname, '` TEXT NULL COMMENT ''提取链接模板(包月账号专用)'' AFTER `duration_params`')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 检查并添加 failure_keywords 字段
SET @columnname = 'failure_keywords';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE `', @tablename, '` ADD COLUMN `', @columnname, '` JSON NULL COMMENT ''失败关键词(包月账号专用)'' AFTER `extract_url_template`')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
