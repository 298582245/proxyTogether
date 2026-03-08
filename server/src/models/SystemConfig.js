const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const SystemConfig = sequelize.define('SystemConfig', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  configKey: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'config_key',
    comment: '配置键',
  },
  configValue: {
    type: DataTypes.TEXT,
    field: 'config_value',
    comment: '配置值',
  },
  description: {
    type: DataTypes.STRING(255),
    comment: '配置说明',
  },
}, {
  tableName: 'system_configs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

// 获取配置值
SystemConfig.getValue = async (key, defaultValue = null) => {
  const config = await SystemConfig.findOne({
    where: { configKey: key },
  });
  return config ? config.configValue : defaultValue;
};

// 设置配置值
SystemConfig.setValue = async (key, value, description = null) => {
  const [config, created] = await SystemConfig.findOrCreate({
    where: { configKey: key },
    defaults: {
      configKey: key,
      configValue: value,
      description,
    },
  });
  if (!created) {
    config.configValue = value;
    if (description !== null) {
      config.description = description;
    }
    await config.save();
  }
  return config;
};

module.exports = SystemConfig;
