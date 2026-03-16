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
    allowNull: true, // 包月账号可为空
    field: 'site_id',
    comment: '关联网站ID(包月账号可为空)',
  },
  name: {
    type: DataTypes.STRING(100),
    comment: '账号名称/备注',
  },
  extractUrlTemplate: {
    type: DataTypes.TEXT,
    field: 'extract_url_template',
    comment: '提取链接模板(包月账号专用)',
  },
  formatParams: {
    type: DataTypes.JSON,
    field: 'format_params',
    comment: '格式参数(包月账号专用)',
  },
  durationParams: {
    type: DataTypes.JSON,
    field: 'duration_params',
    comment: '时长参数(包月账号专用)',
  },
  failureKeywords: {
    type: DataTypes.JSON,
    field: 'failure_keywords',
    comment: '失败关键词(包月账号专用)',
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
  expireAt: {
    type: DataTypes.DATE,
    field: 'expire_at',
    comment: '到期时间(包月账号专用)',
  },
  status: {
    type: DataTypes.TINYINT,
    defaultValue: 1,
    comment: '状态: 1启用 0禁用',
  },
}, {
  tableName: 'accounts',
  timestamps: true,
});

module.exports = Account;
