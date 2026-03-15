const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * 账号使用次数限制模型
 * 用于包月账号的使用次数限制管理
 */
const AccountUsageLimit = sequelize.define('AccountUsageLimit', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  accountId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'account_id',
    comment: '账号ID',
  },
  limitType: {
    type: DataTypes.ENUM('daily', 'weekly', 'monthly', 'custom'),
    allowNull: false,
    field: 'limit_type',
    comment: '限制类型: daily每天/weekly每周/monthly每月/custom自定义',
  },
  limitCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'limit_count',
    comment: '每周期最大使用次数',
  },
  limitDays: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'limit_days',
    comment: '自定义天数(当limit_type=custom时使用)',
  },
  currentCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'current_count',
    comment: '当前周期已使用次数',
  },
  periodStart: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'period_start',
    comment: '当前周期开始时间',
  },
  resetTime: {
    type: DataTypes.TIME,
    allowNull: false,
    defaultValue: '00:00:00',
    field: 'reset_time',
    comment: '重置时间点',
  },
  isLimited: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_limited',
    comment: '是否因次数限制被禁用',
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'created_at',
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'updated_at',
  },
}, {
  tableName: 'account_usage_limits',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['account_id'],
    },
  ],
});

module.exports = AccountUsageLimit;
