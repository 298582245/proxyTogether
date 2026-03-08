-- =============================================
-- 代理统一接口系统 - 初始化SQL
-- 版本: v1_init.sql
-- 创建时间: 2025-03-08
-- =============================================

-- 设置字符集
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =============================================
-- 1. 网站配置表
-- =============================================
DROP TABLE IF EXISTS `sites`;
CREATE TABLE `sites` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `name` VARCHAR(50) NOT NULL COMMENT '网站名称',
  `extract_url_template` TEXT NOT NULL COMMENT '提取IP链接模板，支持变量替换 如: {duration}, {format}, {params.xxx}',
  `format_params` JSON DEFAULT NULL COMMENT '格式参数配置 [{"label":"TXT","value":"txt"},{"label":"JSON","value":"json"}]',
  `duration_params` JSON DEFAULT NULL COMMENT '时长参数配置 [{"times":1,"type":1,"label":"1分钟"}]',
  `balance_url` VARCHAR(500) DEFAULT NULL COMMENT '余额查询接口URL',
  `balance_method` VARCHAR(10) DEFAULT 'GET' COMMENT '余额查询请求方法 GET/POST',
  `balance_params_template` JSON DEFAULT NULL COMMENT '余额查询参数模板',
  `balance_field` VARCHAR(100) DEFAULT 'data.balance' COMMENT '余额字段路径(支持JSONPath)',
  `failure_keywords` JSON DEFAULT NULL COMMENT '失败关键词 ["余额不足","已过期"]',
  `status` TINYINT DEFAULT 1 COMMENT '状态: 1启用 0禁用',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='网站配置表';

-- =============================================
-- 2. 账号表
-- =============================================
DROP TABLE IF EXISTS `accounts`;
CREATE TABLE `accounts` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `site_id` INT NOT NULL COMMENT '关联网站ID',
  `name` VARCHAR(100) DEFAULT NULL COMMENT '账号名称/备注',
  `extract_params` JSON DEFAULT NULL COMMENT '提取链接特有参数',
  `balance_params` JSON DEFAULT NULL COMMENT '余额查询特有参数',
  `balance` DECIMAL(12,2) DEFAULT 0.00 COMMENT '当前余额(缓存)',
  `balance_updated_at` DATETIME DEFAULT NULL COMMENT '余额更新时间',
  `fail_count` INT DEFAULT 0 COMMENT '连续失败次数',
  `status` TINYINT DEFAULT 1 COMMENT '状态: 1启用 0禁用',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  INDEX `idx_site_id` (`site_id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_balance` (`balance` DESC),
  CONSTRAINT `fk_accounts_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='账号表';

-- =============================================
-- 3. 系统配置表
-- =============================================
DROP TABLE IF EXISTS `system_configs`;
CREATE TABLE `system_configs` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `config_key` VARCHAR(50) NOT NULL COMMENT '配置键',
  `config_value` TEXT COMMENT '配置值',
  `description` VARCHAR(255) DEFAULT NULL COMMENT '配置说明',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_config_key` (`config_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统配置表';

-- =============================================
-- 4. 代理提取日志表
-- =============================================
DROP TABLE IF EXISTS `proxy_logs`;
CREATE TABLE `proxy_logs` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `account_id` INT DEFAULT NULL COMMENT '关联账号ID',
  `site_id` INT DEFAULT NULL COMMENT '关联网站ID',
  `client_ip` VARCHAR(50) DEFAULT NULL COMMENT '客户端IP',
  `duration` INT DEFAULT NULL COMMENT '时长参数',
  `format` VARCHAR(50) DEFAULT NULL COMMENT '格式参数',
  `success` TINYINT DEFAULT 0 COMMENT '是否成功: 1成功 0失败',
  `error_message` VARCHAR(500) DEFAULT NULL COMMENT '错误信息',
  `response_preview` TEXT DEFAULT NULL COMMENT '响应内容预览(前500字符)',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  INDEX `idx_account_id` (`account_id`),
  INDEX `idx_site_id` (`site_id`),
  INDEX `idx_created_at` (`created_at`),
  INDEX `idx_success` (`success`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='代理提取日志表';

-- =============================================
-- 5. 初始化系统配置数据
-- =============================================
INSERT INTO `system_configs` (`config_key`, `config_value`, `description`) VALUES
('admin_password', 'admin123', '后台管理密码(首次登录后请修改)'),
('jwt_private_key', '', 'JWT私钥(RS256格式) - 系统自动生成'),
('jwt_public_key', '', 'JWT公钥(RS256格式) - 系统自动生成'),
('proxy_token', '', '代理接口Token(留空则不验证)'),
('ip_whitelist', '[]', 'IP白名单(JSON数组格式)'),
('max_fail_count', '3', '最大连续失败次数，超过后自动禁用账号'),
('balance_check_interval', '30', '余额查询间隔(分钟)');

SET FOREIGN_KEY_CHECKS = 1;
