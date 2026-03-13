-- 添加余额类型字段到sites表
-- 执行时间: 2026-03-13

ALTER TABLE `sites` ADD COLUMN `balance_type` VARCHAR(20) DEFAULT 'balance' COMMENT '余额类型: balance余额查询 monthly包月' AFTER `duration_params`;

-- 更新已有数据：如果balance_url为空则设置为包月类型
UPDATE `sites` SET `balance_type` = 'monthly' WHERE `balance_url` IS NULL OR `balance_url` = '';
