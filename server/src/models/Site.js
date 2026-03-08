const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Site = sequelize.define('Site', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: '网站名称',
  },
  extractUrlTemplate: {
    type: DataTypes.TEXT,
    allowNull: false,
    field: 'extract_url_template',
    comment: '提取IP链接模板',
  },
  formatParams: {
    type: DataTypes.JSON,
    field: 'format_params',
    comment: '格式参数配置',
  },
  durationParams: {
    type: DataTypes.JSON,
    field: 'duration_params',
    comment: '时长参数配置',
  },
  balanceUrl: {
    type: DataTypes.STRING(500),
    field: 'balance_url',
    comment: '余额查询接口URL',
  },
  balanceMethod: {
    type: DataTypes.STRING(10),
    field: 'balance_method',
    defaultValue: 'GET',
    comment: '余额查询请求方法',
  },
  balanceParamsTemplate: {
    type: DataTypes.JSON,
    field: 'balance_params_template',
    comment: '余额查询参数模板',
  },
  balanceField: {
    type: DataTypes.STRING(100),
    field: 'balance_field',
    defaultValue: 'data.balance',
    comment: '余额字段路径',
  },
  failureKeywords: {
    type: DataTypes.JSON,
    field: 'failure_keywords',
    comment: '失败关键词',
  },
  status: {
    type: DataTypes.TINYINT,
    defaultValue: 1,
    comment: '状态: 1启用 0禁用',
  },
}, {
  tableName: 'sites',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = Site;
