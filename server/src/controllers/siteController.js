const Site = require('../models/Site');
const Account = require('../models/Account');
const { sequelize } = require('../config/database');
const logger = require('../utils/logger');

/**
 * 获取网站列表
 */
const getList = async (req, res) => {
  try {
    const { page = 1, pageSize = 10, status } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);
    const limit = parseInt(pageSize, 10);

    const whereClause = {};
    if (status !== undefined && status !== '') {
      whereClause.status = parseInt(status, 10);
    }

    const { count, rows } = await Site.findAndCountAll({
      where: whereClause,
      offset,
      limit,
      order: [['created_at', 'DESC']],
      include: [
        {
          model: Account,
          as: 'accounts',
          attributes: ['id'],
          required: false,
        },
      ],
    });

    // 统计每个网站的账号数量
    const sites = rows.map((site) => {
      const siteJson = site.toJSON();
      siteJson.accountCount = siteJson.accounts ? siteJson.accounts.length : 0;
      delete siteJson.accounts;
      return siteJson;
    });

    res.json({
      success: true,
      data: {
        list: sites,
        total: count,
        page: parseInt(page, 10),
        pageSize: limit,
      },
    });
  } catch (error) {
    logger.error('获取网站列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取网站列表失败',
    });
  }
};

/**
 * 获取网站详情
 */
const getDetail = async (req, res) => {
  try {
    const { id } = req.params;

    const site = await Site.findByPk(id);

    if (!site) {
      return res.status(404).json({
        success: false,
        message: '网站不存在',
      });
    }

    res.json({
      success: true,
      data: site,
    });
  } catch (error) {
    logger.error('获取网站详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取网站详情失败',
    });
  }
};

/**
 * 获取所有启用的网站（下拉选择用）
 */
const getAllActive = async (req, res) => {
  try {
    const sites = await Site.findAll({
      where: { status: 1 },
      attributes: ['id', 'name', 'formatParams', 'durationParams'],
      order: [['name', 'ASC']],
    });

    res.json({
      success: true,
      data: sites,
    });
  } catch (error) {
    logger.error('获取网站列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取网站列表失败',
    });
  }
};

/**
 * 创建网站
 */
const create = async (req, res) => {
  try {
    const {
      name,
      extractUrlTemplate,
      formatParams,
      durationParams,
      balanceUrl,
      balanceMethod,
      balanceParamsTemplate,
      balanceField,
      failureKeywords,
    } = req.body;

    // 验证必填字段
    if (!name || !extractUrlTemplate) {
      return res.status(400).json({
        success: false,
        message: '网站名称和提取链接模板为必填项',
      });
    }

    const site = await Site.create({
      name,
      extractUrlTemplate,
      formatParams: formatParams || null,
      durationParams: durationParams || null,
      balanceUrl: balanceUrl || null,
      balanceMethod: balanceMethod || 'GET',
      balanceParamsTemplate: balanceParamsTemplate || null,
      balanceField: balanceField || 'data.balance',
      failureKeywords: failureKeywords || null,
      status: 1,
    });

    res.json({
      success: true,
      message: '创建成功',
      data: site,
    });
  } catch (error) {
    logger.error('创建网站失败:', error);
    res.status(500).json({
      success: false,
      message: '创建网站失败',
    });
  }
};

/**
 * 更新网站
 */
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      extractUrlTemplate,
      formatParams,
      durationParams,
      balanceUrl,
      balanceMethod,
      balanceParamsTemplate,
      balanceField,
      failureKeywords,
      status,
    } = req.body;

    const site = await Site.findByPk(id);
    if (!site) {
      return res.status(404).json({
        success: false,
        message: '网站不存在',
      });
    }

    await site.update({
      name: name || site.name,
      extractUrlTemplate: extractUrlTemplate || site.extractUrlTemplate,
      formatParams: formatParams !== undefined ? formatParams : site.formatParams,
      durationParams: durationParams !== undefined ? durationParams : site.durationParams,
      balanceUrl: balanceUrl !== undefined ? balanceUrl : site.balanceUrl,
      balanceMethod: balanceMethod || site.balanceMethod,
      balanceParamsTemplate: balanceParamsTemplate !== undefined ? balanceParamsTemplate : site.balanceParamsTemplate,
      balanceField: balanceField || site.balanceField,
      failureKeywords: failureKeywords !== undefined ? failureKeywords : site.failureKeywords,
      status: status !== undefined ? status : site.status,
    });

    res.json({
      success: true,
      message: '更新成功',
      data: site,
    });
  } catch (error) {
    logger.error('更新网站失败:', error);
    res.status(500).json({
      success: false,
      message: '更新网站失败',
    });
  }
};

/**
 * 删除网站
 */
const remove = async (req, res) => {
  try {
    const { id } = req.params;

    const site = await Site.findByPk(id);
    if (!site) {
      return res.status(404).json({
        success: false,
        message: '网站不存在',
      });
    }

    // 检查是否有关联的账号
    const accountCount = await Account.count({
      where: { siteId: id },
    });

    if (accountCount > 0) {
      return res.status(400).json({
        success: false,
        message: `该网站下有 ${accountCount} 个账号，请先删除账号`,
      });
    }

    await site.destroy();

    res.json({
      success: true,
      message: '删除成功',
    });
  } catch (error) {
    logger.error('删除网站失败:', error);
    res.status(500).json({
      success: false,
      message: '删除网站失败',
    });
  }
};

/**
 * 切换网站状态
 */
const toggleStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const site = await Site.findByPk(id);
    if (!site) {
      return res.status(404).json({
        success: false,
        message: '网站不存在',
      });
    }

    await site.update({
      status: site.status === 1 ? 0 : 1,
    });

    res.json({
      success: true,
      message: site.status === 1 ? '已启用' : '已禁用',
      data: { status: site.status },
    });
  } catch (error) {
    logger.error('切换网站状态失败:', error);
    res.status(500).json({
      success: false,
      message: '切换网站状态失败',
    });
  }
};

module.exports = {
  getList,
  getDetail,
  getAllActive,
  create,
  update,
  remove,
  toggleStatus,
};
