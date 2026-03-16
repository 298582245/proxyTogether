INSERT INTO `system_configs` (`config_key`, `config_value`, `description`, `created_at`, `updated_at`)
VALUES
  ('log_stats_realtime_ttl_seconds', '259200', 'log stats realtime ttl seconds', NOW(), NOW()),
  ('log_stats_flush_interval_minutes', '10', 'log stats flush schedule interval minutes', NOW(), NOW()),
  ('log_cleanup_hour', '3', 'proxy log cleanup hour', NOW(), NOW()),
  ('log_cleanup_minute', '30', 'proxy log cleanup minute', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  `description` = VALUES(`description`),
  `updated_at` = NOW();
