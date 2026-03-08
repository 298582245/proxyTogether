const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Account = sequelize.define('Account', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  siteId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'site_id',
    comment: '关联网站ID',
  },
  name: {
    type: DataTypes.STRING(100),
    comment: '账号名称/备注',
  },
  extractParams: {
    type: DataTypes.JSON,
    field: 'extract_params',
    comment: '提取链接特有参数',
  },
  balanceParams: {
    type: DataTypes.JSON,
    field: 'balance_params',
    comment: '余额查询特有参数',
  },
  balance: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0.00,
    comment: '当前余额',
  },
  balanceUpdatedAt: {
    type: DataTypes.DATE,
    field: 'balance_updated_at',
    comment: '余额更新时间',
  },
  failCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'fail_count',
    comment: '连续失败次数',
  },
  status: {
    type: DataTypes.TINYINT,
    defaultValue: 1,
    comment: '状态: 1启用 0禁用',
  },
}, {
  tableName: 'accounts',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = Account;
