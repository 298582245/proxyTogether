const statsSnapshotService = require('../services/statsSnapshotService');
const logger = require('../utils/logger');

const getOptions = async (req, res) => {
  try {
    const data = await statsSnapshotService.getAvailableOptions();
    res.json({ success: true, data });
  } catch (error) {
    logger.error('获取统计快照可选项失败:', error);
    res.status(500).json({ success: false, message: '获取统计快照可选项失败' });
  }
};

const getDetail = async (req, res) => {
  try {
    const { statDate, statDateTime, compareMonth } = req.query;
    if (!statDate && !statDateTime) {
      return res.status(400).json({ success: false, message: '统计日期或时间点不能为空' });
    }

    const data = await statsSnapshotService.getSnapshotDetail(statDate, compareMonth, statDateTime);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('获取统计快照详情失败:', error);
    res.status(500).json({ success: false, message: error.message || '获取统计快照详情失败' });
  }
};

const refresh = async (req, res) => {
  try {
    const { statDate, statDateTime } = req.body || {};
    if (!statDate && !statDateTime) {
      return res.status(400).json({ success: false, message: '统计日期或时间点不能为空' });
    }

    const refreshStatDate = statDateTime ? statDateTime.slice(0, 10) : statDate;
    const data = await statsSnapshotService.refreshSnapshotByDate(refreshStatDate);

    res.json({
      success: true,
      message: `刷新统计成功，共更新 ${data.refreshedRowCount} 条快照记录`,
      data,
    });
  } catch (error) {
    logger.error('刷新统计快照失败:', error);
    res.status(500).json({ success: false, message: error.message || '刷新统计快照失败' });
  }
};

module.exports = {
  getDetail,
  getOptions,
  refresh,
};
