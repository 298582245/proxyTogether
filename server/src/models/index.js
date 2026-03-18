const { sequelize, testConnection } = require('../config/database');
const Site = require('./Site');
const Account = require('./Account');
const SystemConfig = require('./SystemConfig');
const ProxyLog = require('./ProxyLog');
const AccountUsageLimit = require('./AccountUsageLimit');
const ProxyLogDailyStat = require('./ProxyLogDailyStat');
const ProxyLogHourlyStat = require('./ProxyLogHourlyStat');
const ProxyLogRemarkDailyStat = require('./ProxyLogRemarkDailyStat');
const ProxyLogMonthlyStat = require('./ProxyLogMonthlyStat');
const ProxyStatsSnapshot = require('./ProxyStatsSnapshot');

// 定义关联关系
Site.hasMany(Account, { foreignKey: 'siteId', as: 'accounts', allowNull: true });
Account.belongsTo(Site, { foreignKey: 'siteId', as: 'site', allowNull: true, constraints: false });

// ProxyLog关联
Site.hasMany(ProxyLog, { foreignKey: 'siteId', as: 'logs' });
ProxyLog.belongsTo(Site, { foreignKey: 'siteId', as: 'site' });
Account.hasMany(ProxyLog, { foreignKey: 'accountId', as: 'logs' });
ProxyLog.belongsTo(Account, { foreignKey: 'accountId', as: 'account' });

// AccountUsageLimit关联
Account.hasOne(AccountUsageLimit, { foreignKey: 'accountId', as: 'usageLimit' });
AccountUsageLimit.belongsTo(Account, { foreignKey: 'accountId', as: 'account' });

// 同步数据库
const syncDatabase = async (force = false) => {
  try {
    await sequelize.sync({ force });
    console.log('数据库同步成功');
  } catch (error) {
    console.error('数据库同步失败:', error);
    process.exit(1);
  }
};

module.exports = {
  sequelize,
  testConnection,
  syncDatabase,
  Site,
  Account,
  SystemConfig,
  ProxyLog,
  ProxyLogDailyStat,
  ProxyLogHourlyStat,
  ProxyLogRemarkDailyStat,
  ProxyLogMonthlyStat,
  ProxyStatsSnapshot,
  AccountUsageLimit,
};
