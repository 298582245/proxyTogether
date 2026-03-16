-- 添加remark字段到proxy_logs表
ALTER TABLE proxy_logs ADD COLUMN remark VARCHAR(255) DEFAULT NULL COMMENT '备注' AFTER error_message;
