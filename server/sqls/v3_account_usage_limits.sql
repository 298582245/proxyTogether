-- 账号使用次数限制表（只有包月账号需要配置）
CREATE TABLE account_usage_limits (
  id INT PRIMARY KEY AUTO_INCREMENT,
  account_id INT NOT NULL COMMENT '账号ID',
  limit_type VARCHAR(20) NOT NULL COMMENT '限制类型: daily每天/weekly每周/monthly每月/custom自定义',
  limit_count INT NOT NULL COMMENT '每周期最大使用次数',
  limit_days INT DEFAULT NULL COMMENT '自定义天数(当limit_type=custom时使用，如7表示每7天)',
  current_count INT DEFAULT 0 COMMENT '当前周期已使用次数',
  period_start DATETIME DEFAULT NULL COMMENT '当前周期开始时间',
  reset_time TIME DEFAULT '00:00:00' COMMENT '重置时间点，默认00:00:00',
  is_limited TINYINT(1) DEFAULT 0 COMMENT '是否因次数限制被禁用(0否/1是)',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_account_id (account_id),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='账号使用次数限制表';
