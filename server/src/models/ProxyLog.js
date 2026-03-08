const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ProxyLog = sequelize.define('ProxyLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  accountId: {
    type: DataTypes.INTEGER,
    field: 'account_id',
    comment: '关联账号ID',
  },
  siteId: {
    type: DataTypes.INTEGER,
    field: 'site_id',
    comment: '关联网站ID',
  },
  clientIp: {
    type: DataTypes.STRING(50),
    field: 'client_ip',
    comment: '客户端IP',
  },
  duration: {
    type: DataTypes.INTEGER,
    comment: '时长参数',
  },
  format: {
    type: DataTypes.STRING(50),
    comment: '格式参数',
  },
  success: {
    type: DataTypes.TINYINT,
    defaultValue: 0,
    comment: '是否成功: 1成功 0失败',
  },
  errorMessage: {
    type: DataTypes.STRING(500),
    field: 'error_message',
    comment: '错误信息',
  },
  responsePreview: {
    type: DataTypes.TEXT,
    field: 'response_preview',
    comment: '响应内容预览',
  },
}, {
  tableName: 'proxy_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
});

module.exports = ProxyLog;
