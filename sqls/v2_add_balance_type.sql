-- 添加余额类型字段到sites表
-- 执行时间: 2026-03-13

ALTER TABLE `sites` ADD COLUMN `balance_type` VARCHAR(20) DEFAULT 'balance' COMMENT '余额类型: balance余额查询 monthly包月' AFTER `duration_params`;

-- 更新已有数据：如果balance_url为空则设置为包月类型
UPDATE `sites` SET `balance_type` = 'monthly' WHERE `balance_url` IS NULL OR `balance_url` = '';

-- 添加到期时间字段到accounts表
ALTER TABLE `accounts` ADD COLUMN `expire_at` DATETIME NULL DEFAULT NULL COMMENT '到期时间(包月账号专用)' AFTER `fail_count`;

-- 修改site_id允许为空（包月账号不需要关联网站）
ALTER TABLE `accounts` MODIFY COLUMN `site_id` INT(11) NULL COMMENT '关联网站ID(包月账号可为空)';

-- 删除外键约束（如果存在）
ALTER TABLE `accounts` DROP FOREIGN KEY IF EXISTS `fk_accounts_site`;

-- 添加格式参数和时长参数字段到accounts表（包月账号专用）
ALTER TABLE `accounts` ADD COLUMN `format_params` JSON NULL COMMENT '格式参数(包月账号专用)' AFTER `extract_params`;
ALTER TABLE `accounts` ADD COLUMN `duration_params` JSON NULL COMMENT '时长参数(包月账号专用)' AFTER `format_params`;

-- 添加提取链接模板字段到accounts表（包月账号专用）
ALTER TABLE `accounts` ADD COLUMN `extract_url_template` TEXT NULL COMMENT '提取链接模板(包月账号专用)' AFTER `duration_params`;

-- 添加失败关键词字段到accounts表（包月账号专用）
ALTER TABLE `accounts` ADD COLUMN `failure_keywords` JSON NULL COMMENT '失败关键词(包月账号专用)' AFTER `extract_url_template`;
