const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ProxyStatsSnapshot = sequelize.define('ProxyStatsSnapshot', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  accountId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'account_id',
  },
  siteId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'site_id',
  },
  todayRequest: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: 0,
    field: 'today_request',
  },
  todaySuccess: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: 0,
    field: 'today_success',
  },
  todayCost: {
    type: DataTypes.DECIMAL(16, 4),
    allowNull: false,
    defaultValue: 0,
    field: 'today_cost',
  },
  weekRequest: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: 0,
    field: 'week_request',
  },
  weekSuccess: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: 0,
    field: 'week_success',
  },
  weekCost: {
    type: DataTypes.DECIMAL(16, 4),
    allowNull: false,
    defaultValue: 0,
    field: 'week_cost',
  },
  monthRequest: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: 0,
    field: 'month_request',
  },
  monthSuccess: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: 0,
    field: 'month_success',
  },
  monthCost: {
    type: DataTypes.DECIMAL(16, 4),
    allowNull: false,
    defaultValue: 0,
    field: 'month_cost',
  },
  monthsRequest: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
    field: 'months_request',
  },
  monthsSuccess: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
    field: 'months_success',
  },
  monthsCost: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
    field: 'months_cost',
  },
}, {
  tableName: 'proxy_stats_snapshots',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['account_id', 'site_id'],
    },
    {
      fields: ['site_id'],
    },
    {
      fields: ['account_id'],
    },
  ],
});

module.exports = ProxyStatsSnapshot;
