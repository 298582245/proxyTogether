-- 创建月度统计表，替代 proxy_stats_snapshots 中的 months JSON 字段
CREATE TABLE IF NOT EXISTS `proxy_log_monthly_stats` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `stat_year` SMALLINT NOT NULL COMMENT '年份',
  `stat_month` TINYINT NOT NULL COMMENT '月份(1-12)',
  `site_id` INT NULL COMMENT '网站ID，NULL表示全局统计',
  `account_id` INT NULL COMMENT '账号ID，NULL表示全局统计',
  `request_count` BIGINT NOT NULL DEFAULT 0,
  `success_count` BIGINT NOT NULL DEFAULT 0,
  `fail_count` BIGINT NOT NULL DEFAULT 0,
  `total_cost` DECIMAL(16, 4) NOT NULL DEFAULT 0.0000,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_monthly_stats` (`stat_year`, `stat_month`, `site_id`, `account_id`),
  KEY `idx_monthly_stats_site_id` (`site_id`),
  KEY `idx_monthly_stats_account_id` (`account_id`),
  KEY `idx_monthly_stats_year_month` (`stat_year`, `stat_month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='月度统计聚合表';

-- 创建全局月度统计视图（方便查询）
-- 注意：MySQL 不支持 NULL 在唯一索引中互相区分，所以用特殊值 0 表示全局
-- 或者我们可以不创建全局统计，而是在查询时聚合
