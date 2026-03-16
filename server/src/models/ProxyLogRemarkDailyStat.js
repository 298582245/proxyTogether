const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ProxyLogRemarkDailyStat = sequelize.define('ProxyLogRemarkDailyStat', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  statDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    field: 'stat_date',
  },
  remark: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  requestCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'request_count',
  },
  successCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'success_count',
  },
  failCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'fail_count',
  },
  totalCost: {
    type: DataTypes.DECIMAL(12, 4),
    allowNull: false,
    defaultValue: 0,
    field: 'total_cost',
  },
}, {
  tableName: 'proxy_log_remark_daily_stats',
  timestamps: true,
});

module.exports = ProxyLogRemarkDailyStat;
