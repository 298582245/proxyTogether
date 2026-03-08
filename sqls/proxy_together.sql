/*
 Navicat Premium Dump SQL

 Source Server         : localhost_3306
 Source Server Type    : MySQL
 Source Server Version : 50744 (5.7.44)
 Source Host           : localhost:3306
 Source Schema         : proxy_together

 Target Server Type    : MySQL
 Target Server Version : 50744 (5.7.44)
 File Encoding         : 65001

 Date: 08/03/2026 21:07:38
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for accounts
-- ----------------------------
DROP TABLE IF EXISTS `accounts`;
CREATE TABLE `accounts`  (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `site_id` int(11) NOT NULL COMMENT '关联网站ID',
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '账号名称/备注',
  `extract_params` json NULL COMMENT '提取链接特有参数',
  `balance_params` json NULL COMMENT '余额查询特有参数',
  `balance` decimal(12, 2) NULL DEFAULT 0.00 COMMENT '当前余额(缓存)',
  `balance_updated_at` datetime NULL DEFAULT NULL COMMENT '余额更新时间',
  `fail_count` int(11) NULL DEFAULT 0 COMMENT '连续失败次数',
  `status` tinyint(4) NULL DEFAULT 1 COMMENT '状态: 1启用 0禁用',
  `created_at` datetime NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_site_id`(`site_id`) USING BTREE,
  INDEX `idx_status`(`status`) USING BTREE,
  INDEX `idx_balance`(`balance`) USING BTREE,
  CONSTRAINT `fk_accounts_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE = InnoDB AUTO_INCREMENT = 2 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '账号表' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of accounts
-- ----------------------------
INSERT INTO `accounts` VALUES (1, 1, '自己', '{\"no\": \"20250423473129683265\", \"secret\": \"ju8ojbuvq6i8vvo\"}', '{\"no\": \"20250423473129683265\", \"userId\": \"K0CBFJ3U7LG\"}', 6.56, '2026-03-08 21:00:00', 0, 1, '2026-03-08 19:56:00', '2026-03-08 21:00:00');

-- ----------------------------
-- Table structure for proxy_logs
-- ----------------------------
DROP TABLE IF EXISTS `proxy_logs`;
CREATE TABLE `proxy_logs`  (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `account_id` int(11) NULL DEFAULT NULL COMMENT '关联账号ID',
  `site_id` int(11) NULL DEFAULT NULL COMMENT '关联网站ID',
  `client_ip` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '客户端IP',
  `duration` int(11) NULL DEFAULT NULL COMMENT '时长参数',
  `format` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '格式参数',
  `success` tinyint(4) NULL DEFAULT 0 COMMENT '是否成功: 1成功 0失败',
  `error_message` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '错误信息',
  `response_preview` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT '响应内容预览(前500字符)',
  `created_at` datetime NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_account_id`(`account_id`) USING BTREE,
  INDEX `idx_site_id`(`site_id`) USING BTREE,
  INDEX `idx_created_at`(`created_at`) USING BTREE,
  INDEX `idx_success`(`success`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 9 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '代理提取日志表' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of proxy_logs
-- ----------------------------
INSERT INTO `proxy_logs` VALUES (1, 1, 1, '::1', 1, 'txt', 1, NULL, '{\"code\":-1,\"data\":null,\"status\":200,\"message\":\"请先将223.166.20.68加入到白名单再进行提取\"}', '2026-03-08 19:59:15');
INSERT INTO `proxy_logs` VALUES (2, 1, 1, '::1', 1, 'txt', 1, NULL, '{\"code\":-1,\"data\":null,\"status\":200,\"message\":\"请先将223.166.20.68加入到白名单再进行提取\"}', '2026-03-08 20:06:30');
INSERT INTO `proxy_logs` VALUES (3, 1, 1, '::1', 1, 'txt', 1, NULL, '{\"code\":-1,\"data\":null,\"status\":200,\"message\":\"请先将223.166.20.68加入到白名单再进行提取\"}', '2026-03-08 20:49:06');
INSERT INTO `proxy_logs` VALUES (4, 1, 1, '::1', 1, 'txt', 0, '响应包含失败关键词', '{\"code\":-1,\"data\":null,\"status\":200,\"message\":\"请先将223.166.20.68加入到白名单再进行提取\"}', '2026-03-08 20:50:00');
INSERT INTO `proxy_logs` VALUES (5, 1, 1, '::1', 1, 'txt', 0, '响应包含失败关键词', '{\"code\":-1,\"data\":null,\"status\":200,\"message\":\"请先将223.166.20.68加入到白名单再进行提取\"}', '2026-03-08 20:50:12');
INSERT INTO `proxy_logs` VALUES (6, 1, 1, '::1', 1, 'txt', 0, '响应包含失败关键词', '{\"code\":-1,\"data\":null,\"status\":200,\"message\":\"请先将223.166.20.68加入到白名单再进行提取\"}', '2026-03-08 20:50:13');
INSERT INTO `proxy_logs` VALUES (7, 1, 1, '::1', 1, 'txt', 0, '响应包含失败关键词', '{\"code\":-1,\"data\":null,\"status\":200,\"message\":\"请先将223.166.20.68加入到白名单再进行提取\"}', '2026-03-08 20:56:07');
INSERT INTO `proxy_logs` VALUES (8, 1, 1, '::1', 1, 'txt', 1, NULL, '180.97.220.60:11971', '2026-03-08 20:56:19');

-- ----------------------------
-- Table structure for sites
-- ----------------------------
DROP TABLE IF EXISTS `sites`;
CREATE TABLE `sites`  (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '网站名称',
  `extract_url_template` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '提取IP链接模板，支持变量替换 如: {duration}, {format}, {params.xxx}',
  `format_params` json NULL COMMENT '格式参数配置 [{\"label\":\"TXT\",\"value\":\"txt\"},{\"label\":\"JSON\",\"value\":\"json\"}]',
  `duration_params` json NULL COMMENT '时长参数配置 [{\"times\":1,\"type\":1,\"label\":\"1分钟\"}]',
  `balance_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '余额查询接口URL',
  `balance_method` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'GET' COMMENT '余额查询请求方法 GET/POST',
  `balance_params_template` json NULL COMMENT '余额查询参数模板',
  `balance_field` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'data.balance' COMMENT '余额字段路径(支持JSONPath)',
  `failure_keywords` json NULL COMMENT '失败关键词 [\"余额不足\",\"已过期\"]',
  `status` tinyint(4) NULL DEFAULT 1 COMMENT '状态: 1启用 0禁用',
  `created_at` datetime NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_status`(`status`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 2 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '网站配置表' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of sites
-- ----------------------------
INSERT INTO `sites` VALUES (1, '品赞', 'https://service.ipzan.com/core-extract?num=1&no={params.no}&minute={duration}&format={format}&pool=quality&secret={params.secret}', '[{\"label\": \"纯ip\", \"value\": \"txt\"}, {\"label\": \"JSON\", \"value\": \"json\"}]', '[{\"type\": 1, \"label\": \"一分钟\", \"times\": 1}, {\"type\": 3, \"label\": \"三分钟\", \"times\": 3}, {\"label\": \"五分钟\", \"times\": 5}, {\"label\": \"十分钟\", \"times\": 10}, {\"label\": \"十五分钟\", \"times\": 15}, {\"label\": \"三十分钟\", \"times\": 30}]', 'https://service.ipzan.com/userProduct-get?no={params.no}&userId={params.userId}', 'GET', '{\"code\": 0, \"data\": {\"balance\": 6.624, \"totalSurplus\": null, \"limitDaySurplus\": null}, \"status\": 200, \"message\": \"\"}', 'data.balance', '[\"加入到白名单\"]', 1, '2026-03-08 15:10:01', '2026-03-08 20:49:59');

-- ----------------------------
-- Table structure for system_configs
-- ----------------------------
DROP TABLE IF EXISTS `system_configs`;
CREATE TABLE `system_configs`  (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `config_key` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '配置键',
  `config_value` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT '配置值',
  `description` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '配置说明',
  `created_at` datetime NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uk_config_key`(`config_key`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 8 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '系统配置表' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of system_configs
-- ----------------------------
INSERT INTO `system_configs` VALUES (1, 'admin_password', 'admin123', '后台管理密码(首次登录后请修改)', '2026-03-08 14:51:07', '2026-03-08 14:51:07');
INSERT INTO `system_configs` VALUES (2, 'jwt_private_key', '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC9gFgb7kI+JvMk\nfuEDRpQYehhwOSqtcX2PHiX4e/5hK514hRvGfddYbmqVKaFZ2kTHZ4YtKLb4uq/w\nhk08GRL7wNQkSGJmcM6VSI3/rvmaYz/oxBRmzcgBweOK0zO9UgbDUwsZJBVcjVxY\n1+gbA/tHRWeQv3xZFbWZQxhhoA/i12FUravSKkYQzos2JS4vLf1QvJuqulqvQQq0\nSrAyMH//Etx/1tPxFjH+L2c/f1EAdCeIJO2Al/ny9XK7100nwaFcr6FuQyp/LiVu\nTlFnbyrhjVTyIHGpgCeEKFjjqEWBY0VIqTi8zY16DWdPyOatt1kAbW7k3nv/Hgy6\nP8qLxJCTAgMBAAECggEANAYwKjrW5Mk8pyBOFeAieDXMz8Jh/QvTNJ9KPVWNGJAo\nwxWH8o5JuHVXvWuYaFqL11KMe4lZ8h8OfjHgskcP9x2RIATfPtBpZoJsuW0ICWKG\nARkToMWNyy23kj05Txhd0vHRci19z9LfL2TWy9PkAEUFka+AK9TR7imFYAfZVKTj\nCUmpzsr1M3bCRoOs6DJvkU3j8LhwA2FWZN3lFIvXjMcAh+p46nyxzlxJ1s/VynYD\nujrHooKtH8/lEE9VhDB4a2shgmUUBHwAzTE/DBFrmheCO2jpVR5ZAgFDTNniuG+O\npCRl1Ms1D8mDGXihwmu/DfvcyUQMxkTFyvAwSYu0wQKBgQDyxMrwNWHgz8xbrBNi\nYkbFvXGglsTeHi+7g9XMxlOWbQWoXYfTZPHGl/bM9Xmdw+beeXOfEcvUDmn8DcuN\nDgpZcF5shpldUPaq5wif/NUiAsmrlsBhv9/HyVwzZNSh9LXUIjExw8XLGN+B4WBU\nc/pXR5Vx1Aos018pn+Q7Lz7phQKBgQDH1Ffumd6JBLyrMhv98ZC1/EdgofRWfmFr\nVJfOVA9HsqCJLeBZYHdW3eG/sc9WqVFS19k7zbKKtZN53Tjbe6MRWA/psxg80u0S\n0FInYX0gfxqtwTT3sfgMZvzKHjn6BqtK2e7WAnaaCrCk2SBbqIdfYNAYT8O33ChZ\nJafHdEFhNwKBgQCPquZuQSkrYc4OckcGciJv4yzbXF4lFLgqwFpGVRgibWJrwO4g\nrBxo6oWjxaGzO7vk7Pr/qAh39g/CmmdbknONenJmx0D7eG6BtTfldjqrZfrzEMPJ\nFUPZd9CYmZM8RRVV9OYoDTOAfbfHpRjc4cXE4RgPxOxAmtY2S+lFHTCeAQKBgCqT\n6BiC2JPBWqHvj19QdVERa/P/DhzP2NoRsDbaWlcgjGwuRjtE/qiXpl49+LuyYA2S\nyEqhzYUYo0+3/0Fk2p37cYiODIAJQVJc6ORTNWITMxAKtsqANSYPW5WFUz0e5qiQ\nPv+CjtrLpE+7o9Vj11RPQIetlzo5wq8cAt/QuY2JAoGBANatG0PhgDrXmIV81Xh+\n9nWvaYR/ie1g0DtuQ/wInMFwNnaTk2AKVTH5m+UQ7L1YAljt334nOrYjrTDCb2MS\nkwUYrKdTL+DeWAxpikaNFoxuvfesyuiH9HW+3AUdvoGpAZFtd84CBwvY7IDv2wqo\nfgZVyC5f9iacghZzDyk/RiHZ\n-----END PRIVATE KEY-----\n', 'JWT私钥', '2026-03-08 14:51:07', '2026-03-08 14:51:45');
INSERT INTO `system_configs` VALUES (3, 'jwt_public_key', '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvYBYG+5CPibzJH7hA0aU\nGHoYcDkqrXF9jx4l+Hv+YSudeIUbxn3XWG5qlSmhWdpEx2eGLSi2+Lqv8IZNPBkS\n+8DUJEhiZnDOlUiN/675mmM/6MQUZs3IAcHjitMzvVIGw1MLGSQVXI1cWNfoGwP7\nR0VnkL98WRW1mUMYYaAP4tdhVK2r0ipGEM6LNiUuLy39ULybqrpar0EKtEqwMjB/\n/xLcf9bT8RYx/i9nP39RAHQniCTtgJf58vVyu9dNJ8GhXK+hbkMqfy4lbk5RZ28q\n4Y1U8iBxqYAnhChY46hFgWNFSKk4vM2Neg1nT8jmrbdZAG1u5N57/x4Muj/Ki8SQ\nkwIDAQAB\n-----END PUBLIC KEY-----\n', 'JWT公钥', '2026-03-08 14:51:07', '2026-03-08 14:51:45');
INSERT INTO `system_configs` VALUES (4, 'proxy_token', '', '代理接口Token(留空则不验证)', '2026-03-08 14:51:07', '2026-03-08 14:51:07');
INSERT INTO `system_configs` VALUES (5, 'ip_whitelist', '[]', 'IP白名单(JSON数组格式)', '2026-03-08 14:51:07', '2026-03-08 14:51:07');
INSERT INTO `system_configs` VALUES (6, 'max_fail_count', '3', '最大连续失败次数，超过后自动禁用账号', '2026-03-08 14:51:07', '2026-03-08 14:51:07');
INSERT INTO `system_configs` VALUES (7, 'balance_check_interval', '30', '余额查询间隔(分钟)', '2026-03-08 14:51:07', '2026-03-08 14:51:07');

SET FOREIGN_KEY_CHECKS = 1;
