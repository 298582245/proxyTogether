CREATE TABLE IF NOT EXISTS `proxy_log_daily_stats` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `stat_date` DATE NOT NULL,
  `site_id` INT NULL,
  `account_id` INT NULL,
  `request_count` INT NOT NULL DEFAULT 0,
  `success_count` INT NOT NULL DEFAULT 0,
  `fail_count` INT NOT NULL DEFAULT 0,
  `total_cost` DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_proxy_log_daily_stats` (`stat_date`, `site_id`, `account_id`),
  KEY `idx_proxy_log_daily_stats_site_id` (`site_id`),
  KEY `idx_proxy_log_daily_stats_account_id` (`account_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `proxy_log_hourly_stats` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `stat_date` DATE NOT NULL,
  `stat_hour` TINYINT NOT NULL,
  `request_count` INT NOT NULL DEFAULT 0,
  `success_count` INT NOT NULL DEFAULT 0,
  `fail_count` INT NOT NULL DEFAULT 0,
  `total_cost` DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_proxy_log_hourly_stats` (`stat_date`, `stat_hour`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `proxy_log_remark_daily_stats` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `stat_date` DATE NOT NULL,
  `remark` VARCHAR(255) NOT NULL,
  `request_count` INT NOT NULL DEFAULT 0,
  `success_count` INT NOT NULL DEFAULT 0,
  `fail_count` INT NOT NULL DEFAULT 0,
  `total_cost` DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_proxy_log_remark_daily_stats` (`stat_date`, `remark`),
  KEY `idx_proxy_log_remark_daily_stats_total_cost` (`total_cost`),
  KEY `idx_proxy_log_remark_daily_stats_request_count` (`request_count`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `system_configs` (`config_key`, `config_value`, `description`, `created_at`, `updated_at`)
VALUES
  ('log_stats_initialized', '0', 'log stats aggregate initialized flag', NOW(), NOW()),
  ('log_stats_last_flushed_bucket', '', 'last flushed log stats bucket', NOW(), NOW()),
  ('log_retention_days', '30', 'proxy log retention days', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  `config_value` = VALUES(`config_value`),
  `description` = VALUES(`description`),
  `updated_at` = NOW();
