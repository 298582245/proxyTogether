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

 Date: 17/03/2026 02:21:47
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

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
  `cost` decimal(10, 4) NULL DEFAULT 0.0000 COMMENT '消费金额',
  `error_message` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '错误信息',
  `remark` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '备注',
  `response_preview` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT '响应内容预览(前500字符)',
  `created_at` datetime NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_account_id`(`account_id`) USING BTREE,
  INDEX `idx_site_id`(`site_id`) USING BTREE,
  INDEX `idx_created_at`(`created_at`) USING BTREE,
  INDEX `idx_success`(`success`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 28 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '代理提取日志表' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of proxy_logs
-- ----------------------------
INSERT INTO `proxy_logs` VALUES (21, 1, 1, '::1', 1, 'txt', 0, 0.0000, '响应包含失败关键词', 'test', '{\"code\":-1,\"data\":null,\"status\":200,\"message\":\"请先将223.167.44.150加入到白名单再进行提取\"}', '2026-03-15 17:25:05');
INSERT INTO `proxy_logs` VALUES (22, NULL, NULL, '::1', 1, 'txt', 0, 0.0000, '所有可用账号都已尝试，无法获取代理', 'test', NULL, '2026-03-15 17:25:05');
INSERT INTO `proxy_logs` VALUES (23, 2, NULL, '::1', 3, 'txt', 1, 0.0000, NULL, 'test', '180.109.12.197:40015\n', '2026-03-15 18:56:47');
INSERT INTO `proxy_logs` VALUES (24, 2, NULL, '127.0.0.1', 3, 'txt', 1, 0.0000, NULL, NULL, '175.165.144.138:40006\n', '2026-03-16 21:53:57');
INSERT INTO `proxy_logs` VALUES (25, 2, NULL, '127.0.0.1', 3, 'txt', 1, 0.0000, NULL, NULL, '121.239.212.163:40044\n', '2026-03-16 21:57:37');
INSERT INTO `proxy_logs` VALUES (26, 1, 1, '127.0.0.1', 1, 'txt', 0, 0.0000, '响应包含失败关键词', NULL, '{\"code\":-1,\"data\":null,\"status\":200,\"message\":\"请先将223.167.44.150加入到白名单再进行提取\"}', '2026-03-16 21:57:51');
INSERT INTO `proxy_logs` VALUES (27, NULL, NULL, '127.0.0.1', 1, 'txt', 0, 0.0000, '所有可用账号都已尝试，无法获取代理', NULL, NULL, '2026-03-16 21:57:51');

SET FOREIGN_KEY_CHECKS = 1;
