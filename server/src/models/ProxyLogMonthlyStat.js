const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ProxyLogMonthlyStat = sequelize.define('ProxyLogMonthlyStat', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  statYear: {
    type: DataTypes.SMALLINT,
    allowNull: false,
    field: 'stat_year',
    comment: '年份',
  },
  statMonth: {
    type: DataTypes.TINYINT,
    allowNull: false,
    field: 'stat_month',
    comment: '月份(1-12)',
  },
  siteId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'site_id',
    comment: '网站ID，NULL表示全局统计',
  },
  accountId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'account_id',
    comment: '账号ID，NULL表示全局统计',
  },
  requestCount: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: 0,
    field: 'request_count',
  },
  successCount: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: 0,
    field: 'success_count',
  },
  failCount: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: 0,
    field: 'fail_count',
  },
  totalCost: {
    type: DataTypes.DECIMAL(16, 4),
    allowNull: false,
    defaultValue: 0,
    field: 'total_cost',
  },
}, {
  tableName: 'proxy_log_monthly_stats',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['stat_year', 'stat_month', 'site_id', 'account_id'],
    },
    {
      fields: ['site_id'],
    },
    {
      fields: ['account_id'],
    },
    {
      fields: ['stat_year', 'stat_month'],
    },
  ],
});

module.exports = ProxyLogMonthlyStat;
