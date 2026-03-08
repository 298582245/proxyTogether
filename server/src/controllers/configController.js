const SystemConfig = require('../models/SystemConfig');
const cacheService = require('../services/cacheService');
const scheduler = require('../schedulers/balanceScheduler');
const logger = require('../utils/logger');

/**
 * 获取系统配置
 */
const getConfig = async (req, res) => {
  try {
    const configs = await SystemConfig.findAll({
      order: [['id', 'ASC']],
    });

    // 过滤敏感信息
    const result = configs.map((config) => {
      const data = {
        key: config.configKey,
        description: config.description,
      };

      // 不返回JWT私钥和密码明文
      if (['jwt_private_key', 'admin_password'].includes(config.configKey)) {
        data.value = '******';
      } else {
        data.value = config.configValue;
      }

      return data;
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('获取系统配置失败:', error);
    res.status(500).json({
      success: false,
      message: '获取系统配置失败',
    });
  }
};

/**
 * 更新系统配置
 */
const updateConfig = async (req, res) => {
  try {
    const { configs } = req.body;

    if (!configs || !Array.isArray(configs)) {
      return res.status(400).json({
        success: false,
        message: '参数格式错误',
      });
    }

    // 不允许直接修改的配置项
    const readOnlyKeys = ['jwt_private_key', 'jwt_public_key'];

    for (const item of configs) {
      const { key, value } = item;

      if (!key) continue;

      // 跳过只读配置
      if (readOnlyKeys.includes(key)) {
        continue;
      }

      // 特殊处理密码
      if (key === 'admin_password') {
        if (!value || value === '******') continue;
        if (value.length < 6) {
          return res.status(400).json({
            success: false,
            message: '密码长度不能少于6位',
          });
        }
      }

      // 特殊处理IP白名单
      if (key === 'ip_whitelist') {
        try {
          const ipList = JSON.parse(value);
          if (!Array.isArray(ipList)) {
            throw new Error();
          }
        } catch {
          return res.status(400).json({
            success: false,
            message: 'IP白名单格式错误，应为JSON数组',
          });
        }
      }

      // 特殊处理失败关键词
      if (key === 'proxy_failure_keywords') {
        try {
          JSON.parse(value);
        } catch {
          return res.status(400).json({
            success: false,
            message: '失败关键词格式错误，应为JSON数组',
          });
        }
      }

      // 更新配置
      await SystemConfig.setValue(key, value);

      // 清除缓存
      await cacheService.deleteConfigCache(key);
    }

    // 如果修改了余额查询间隔，重启定时任务
    const intervalConfig = configs.find((c) => c.key === 'balance_check_interval');
    if (intervalConfig) {
      await scheduler.restartBalanceCheckJob();
    }

    res.json({
      success: true,
      message: '配置更新成功',
    });
  } catch (error) {
    logger.error('更新系统配置失败:', error);
    res.status(500).json({
      success: false,
      message: '更新系统配置失败',
    });
  }
};

/**
 * 获取单个配置值
 */
const getConfigValue = async (req, res) => {
  try {
    const { key } = req.params;

    const value = await SystemConfig.getValue(key);

    // 敏感信息不返回
    if (['jwt_private_key', 'jwt_public_key', 'admin_password'].includes(key)) {
      return res.json({
        success: true,
        data: { key, value: '******' },
      });
    }

    res.json({
      success: true,
      data: { key, value },
    });
  } catch (error) {
    logger.error('获取配置失败:', error);
    res.status(500).json({
      success: false,
      message: '获取配置失败',
    });
  }
};

module.exports = {
  getConfig,
  updateConfig,
  getConfigValue,
};
