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

 Date: 17/03/2026 10:56:01
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for proxy_stats_snapshots
-- ----------------------------
DROP TABLE IF EXISTS `proxy_stats_snapshots`;
CREATE TABLE `proxy_stats_snapshots`  (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `account_id` int(11) NOT NULL DEFAULT 0,
  `site_id` int(11) NOT NULL DEFAULT 0,
  `today_request` bigint(20) NOT NULL DEFAULT 0,
  `today_success` bigint(20) NOT NULL DEFAULT 0,
  `today_cost` decimal(16, 4) NOT NULL DEFAULT 0.0000,
  `week_request` bigint(20) NOT NULL DEFAULT 0,
  `week_success` bigint(20) NOT NULL DEFAULT 0,
  `week_cost` decimal(16, 4) NOT NULL DEFAULT 0.0000,
  `month_request` bigint(20) NOT NULL DEFAULT 0,
  `month_success` bigint(20) NOT NULL DEFAULT 0,
  `month_cost` decimal(16, 4) NOT NULL DEFAULT 0.0000,
  `months_request` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `months_success` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `months_cost` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uniq_proxy_stats_snapshots_account_site`(`account_id`, `site_id`) USING BTREE,
  UNIQUE INDEX `proxy_stats_snapshots_account_id_site_id`(`account_id`, `site_id`) USING BTREE,
  INDEX `idx_proxy_stats_snapshots_site_id`(`site_id`) USING BTREE,
  INDEX `idx_proxy_stats_snapshots_account_id`(`account_id`) USING BTREE,
  INDEX `proxy_stats_snapshots_site_id`(`site_id`) USING BTREE,
  INDEX `proxy_stats_snapshots_account_id`(`account_id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 19 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of proxy_stats_snapshots
-- ----------------------------
INSERT INTO `proxy_stats_snapshots` VALUES (16, 1, 1, 1, 0, 0.0000, 1, 0, 0.0000, 2, 0, 0.0000, '{\"2026-03\":2}', '{\"2026-03\":0}', '{\"2026-03\":0}', '2026-03-17 10:55:38', '2026-03-17 10:55:38');
INSERT INTO `proxy_stats_snapshots` VALUES (17, 0, 0, 0, 0, 0.0000, 0, 0, 0.0000, 0, 0, 0.0000, '{\"2026-03\":0}', '{\"2026-03\":0}', '{\"2026-03\":0}', '2026-03-17 10:55:38', '2026-03-17 10:55:38');
INSERT INTO `proxy_stats_snapshots` VALUES (18, 2, 0, 2, 2, 0.0000, 2, 2, 0.0000, 3, 3, 0.0000, '{\"2026-03\":3}', '{\"2026-03\":3}', '{\"2026-03\":0}', '2026-03-17 10:55:38', '2026-03-17 10:55:38');

SET FOREIGN_KEY_CHECKS = 1;
