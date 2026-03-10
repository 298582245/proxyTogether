-- =============================================
-- v2_add_cost.sql
-- 添加消费金额统计功能
-- =============================================

-- 为 proxy_logs 表添加 cost 字段
ALTER TABLE `proxy_logs` ADD COLUMN `cost` DECIMAL(10, 4) DEFAULT 0.0000 COMMENT '消费金额' AFTER `success`;
