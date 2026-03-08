const Site = require('../models/Site');
const Account = require('../models/Account');
const SystemConfig = require('../models/SystemConfig');
const cacheService = require('../services/cacheService');
const { get, post } = require('../utils/http');
const logger = require('../utils/logger');

/**
 * 根据JSONPath获取对象中的值
 * @param {object} obj - 目标对象
 * @param {string} path - 路径，如 'data.balance'
 */
const getValueByPath = (obj, path) => {
  if (!path) return obj;
  const keys = path.split('.');
  let result = obj;
  for (const key of keys) {
    if (result === null || result === undefined) return undefined;
    result = result[key];
  }
  return result;
};

/**
 * 合并参数模板和账号参数
 * @param {object} template - 模板参数
 * @param {object} accountParams - 账号特有参数
 */
const mergeParams = (template, accountParams) => {
  if (!template && !accountParams) return {};
  return { ...template, ...accountParams };
};

/**
 * 查询单个账号余额
 * @param {object} account - 账号对象
 * @param {object} site - 网站对象
 */
const queryAccountBalance = async (account, site) => {
  try {
    if (!site.balanceUrl) {
      logger.warn(`网站 ${site.name} 未配置余额查询接口`);
      return { success: false, balance: null, error: '未配置余额查询接口' };
    }

    // 合并参数
    const params = mergeParams(site.balanceParamsTemplate, account.balanceParams);

    // 发起请求
    let response;
    const method = (site.balanceMethod || 'GET').toUpperCase();

    if (method === 'POST') {
      response = await post(site.balanceUrl, params);
    } else {
      response = await get(site.balanceUrl, params);
    }

    // 解析余额字段
    const balance = getValueByPath(response, site.balanceField || 'data.balance');

    if (balance === undefined || balance === null) {
      logger.warn(`账号 ${account.name} 余额解析失败，响应:`, response);
      return { success: false, balance: null, error: '余额字段解析失败' };
    }

    const balanceNum = parseFloat(balance);
    logger.info(`账号 ${account.name}(${site.name}) 余额: ${balanceNum}`);

    return { success: true, balance: balanceNum, error: null };
  } catch (error) {
    logger.error(`查询账号 ${account.name} 余额失败:`, error.message);
    return { success: false, balance: null, error: error.message };
  }
};

/**
 * 更新账号余额
 * @param {number} accountId - 账号ID
 * @param {number} balance - 余额
 * @param {boolean} enableIfHasBalance - 如果有余额是否自动启用
 */
const updateAccountBalance = async (accountId, balance, enableIfHasBalance = true) => {
  const updateData = {
    balance,
    balanceUpdatedAt: new Date(),
  };

  // 如果余额大于0，且账号被禁用（非手动禁用），可以自动启用
  if (enableIfHasBalance && balance > 0) {
    const account = await Account.findByPk(accountId);
    if (account && account.status === 0 && account.failCount >= 3) {
      // 仅因失败次数过多被禁用的情况才自动启用
      updateData.status = 1;
      updateData.failCount = 0;
      logger.info(`账号 ${account.name} 有余额 ${balance}，自动启用`);
    }
  }

  await Account.update(updateData, { where: { id: accountId } });

  // 更新缓存
  await cacheService.setAccountBalance(accountId, balance);
};

/**
 * 查询所有账号余额
 */
const queryAllBalances = async () => {
  logger.info('开始查询所有账号余额...');

  try {
    // 获取所有启用的网站
    const sites = await Site.findAll({
      where: { status: 1 },
      include: [
        {
          model: Account,
          as: 'accounts',
          where: { status: 1 },
          required: false,
        },
      ],
    });

    let successCount = 0;
    let failCount = 0;

    for (const site of sites) {
      const accounts = site.accounts || [];
      logger.info(`网站 ${site.name} 有 ${accounts.length} 个账号`);

      for (const account of accounts) {
        const result = await queryAccountBalance(account, site);

        if (result.success) {
          await updateAccountBalance(account.id, result.balance);
          successCount++;
        } else {
          // 查询失败也更新时间，但不更新余额
          await Account.update(
            { balanceUpdatedAt: new Date() },
            { where: { id: account.id } }
          );
          failCount++;
        }

        // 避免请求过快
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    logger.info(`余额查询完成，成功: ${successCount}，失败: ${failCount}`);
    return { successCount, failCount };
  } catch (error) {
    logger.error('查询所有余额失败:', error);
    throw error;
  }
};

/**
 * 获取账号统计信息
 */
const getAccountStats = async () => {
  const result = await Account.findOne({
    attributes: [
      [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'totalCount'],
      [require('sequelize').fn('SUM', require('sequelize').col('balance')), 'totalBalance'],
      [require('sequelize').fn('SUM', require('sequelize').literal('CASE WHEN status = 1 THEN 1 ELSE 0 END')), 'activeCount'],
      [require('sequelize').fn('SUM', require('sequelize').literal('CASE WHEN status = 0 THEN 1 ELSE 0 END')), 'inactiveCount'],
    ],
    raw: true,
  });

  return {
    totalCount: parseInt(result.totalCount) || 0,
    totalBalance: parseFloat(result.totalBalance) || 0,
    activeCount: parseInt(result.activeCount) || 0,
    inactiveCount: parseInt(result.inactiveCount) || 0,
  };
};

module.exports = {
  queryAccountBalance,
  queryAllBalances,
  updateAccountBalance,
  getAccountStats,
};
