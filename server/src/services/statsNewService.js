/**
 * 新统计服务 - 基于 daily_stats + monthly_stats + Redis 实时缓存
 *
 * 核心设计：
 * 1. today 数据：Redis 缓存(1分钟) + 实时查询 proxy_logs
 * 2. week/month 数据：daily_stats 聚合表 + today Redis 缓存
 * 3. 历史月度数据：monthly_stats 聚合表
 */

const { QueryTypes, Op } = require('sequelize');
const { sequelize } = require('../config/database');
const ProxyLog = require('../models/ProxyLog');
const ProxyLogDailyStat = require('../models/ProxyLogDailyStat');
const ProxyLogMonthlyStat = require('../models/ProxyLogMonthlyStat');
const Account = require('../models/Account');
const Site = require('../models/Site');
const cacheService = require('./cacheService');
const logger = require('../utils/logger');
const {
  addDays,
  formatChinaDateTime,
  getChinaDateStr,
  getChinaDayEnd,
  getChinaDayStart,
  getChinaHour,
  getTimeRange,
} = require('../utils/statsTime');

// Redis 缓存键前缀
const STATS_TODAY_PREFIX = 'stats:today';
const STATS_TODAY_TTL_SECONDS = 60; // 1分钟缓存

// 辅助函数
const toInteger = (value) => Number.parseInt(value, 10) || 0;
const toFloat = (value) => Number.parseFloat(value) || 0;
const padNumber = (value) => String(value).padStart(2, '0');

const buildEmptyMetrics = () => ({
  requestCount: 0,
  successCount: 0,
  failCount: 0,
  totalCost: 0,
});

const normalizeMetrics = (row = {}) => ({
  requestCount: toInteger(row.requestCount || row.request_count),
  successCount: toInteger(row.successCount || row.success_count),
  failCount: toInteger(row.failCount || row.fail_count),
  totalCost: toFloat(row.totalCost || row.total_cost),
});

const addMetrics = (target, source = {}) => ({
  requestCount: toInteger(target.requestCount) + toInteger(source.requestCount),
  successCount: toInteger(target.successCount) + toInteger(source.successCount),
  failCount: toInteger(target.failCount) + toInteger(source.failCount),
  totalCost: Number((toFloat(target.totalCost) + toFloat(source.totalCost)).toFixed(4)),
});

const buildEmptyOverviewMetrics = () => ({
  requestCount: 0,
  successCount: 0,
  failCount: 0,
  attemptCount: 0,
  totalCost: 0,
});

const normalizeOverviewMetrics = (row = {}) => ({
  requestCount: toInteger(row.requestCount || row.request_count),
  successCount: toInteger(row.successCount || row.success_count),
  failCount: toInteger(row.failCount || row.fail_count),
  attemptCount: toInteger(row.attemptCount || row.attempt_count),
  totalCost: toFloat(row.totalCost || row.total_cost),
});

const addOverviewMetrics = (target, source = {}) => ({
  requestCount: toInteger(target.requestCount) + toInteger(source.requestCount),
  successCount: toInteger(target.successCount) + toInteger(source.successCount),
  failCount: toInteger(target.failCount) + toInteger(source.failCount),
  attemptCount: toInteger(target.attemptCount) + toInteger(source.attemptCount),
  totalCost: Number((toFloat(target.totalCost) + toFloat(source.totalCost)).toFixed(4)),
});

const REQUEST_KEY_SQL = "COALESCE(request_id, CONCAT('legacy-', CAST(id AS CHAR)))";

const getDaySqlRange = (dateStr) => ({
  createdStart: `${dateStr} 00:00:00`,
  createdEnd: `${dateStr} 23:59:59`,
});

const queryRequestSummaryFromLogs = async (dateStr) => {
  const replacements = getDaySqlRange(dateStr);
  const row = await sequelize.query(
    `
    SELECT
      COUNT(*) AS requestCount,
      SUM(request_success) AS successCount,
      SUM(CASE WHEN request_success = 1 THEN 0 ELSE 1 END) AS failCount,
      SUM(attempt_count) AS attemptCount,
      SUM(request_cost) AS totalCost
    FROM (
      SELECT
        ${REQUEST_KEY_SQL} AS request_key,
        MAX(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS request_success,
        MAX(CASE WHEN success = 1 THEN cost ELSE 0 END) AS request_cost,
        COUNT(*) AS attempt_count
      FROM proxy_logs
      WHERE created_at >= :createdStart AND created_at <= :createdEnd
      GROUP BY ${REQUEST_KEY_SQL}
    ) AS request_summary
    `,
    { replacements, type: QueryTypes.SELECT },
  );

  return normalizeOverviewMetrics(row[0]);
};

const queryDailyRequestStats = async (startDate, endDate) => {
  const replacements = {};
  const conditions = [];

  if (startDate) {
    replacements.startDate = startDate;
    conditions.push('stat_date >= :startDate');
  }

  if (endDate) {
    replacements.endDate = endDate;
    conditions.push('stat_date <= :endDate');
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const row = await sequelize.query(
    `
    SELECT
      SUM(request_count) AS requestCount,
      SUM(success_count) AS successCount,
      SUM(fail_count) AS failCount,
      SUM(attempt_count) AS attemptCount,
      SUM(total_cost) AS totalCost
    FROM proxy_log_request_daily_stats
    ${whereSql}
    `,
    { replacements, type: QueryTypes.SELECT },
  );

  return normalizeOverviewMetrics(row[0]);
};

const normalizeStatDate = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  return getChinaDateStr(new Date(value));
};

const queryDailyRequestChartRows = async (startDate, endDate) => {
  const replacements = {};
  const conditions = [];

  if (startDate) {
    replacements.startDate = startDate;
    conditions.push('stat_date >= :startDate');
  }

  if (endDate) {
    replacements.endDate = endDate;
    conditions.push('stat_date <= :endDate');
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await sequelize.query(
    `
    SELECT
      stat_date AS statDate,
      request_count AS requestCount,
      success_count AS successCount,
      fail_count AS failCount,
      attempt_count AS attemptCount,
      total_cost AS totalCost
    FROM proxy_log_request_daily_stats
    ${whereSql}
    ORDER BY stat_date ASC
    `,
    { replacements, type: QueryTypes.SELECT },
  );

  return rows.map((row) => ({
    statDate: normalizeStatDate(row.statDate),
    ...normalizeOverviewMetrics(row),
  }));
};

/**
 * 获取今日日期字符串（中国时区）
 */
const getTodayDateStr = () => getChinaDateStr(new Date());

/**
 * 获取本周一起始日期（中国时区）
 */
const getWeekStart = (date) => {
  const dateStr = getChinaDateStr(date);
  // 解析日期字符串，计算星期几
  const parts = dateStr.split('-').map(Number);
  const jsDate = new Date(parts[0], parts[1] - 1, parts[2]); // 本地时间构造
  const dayOfWeek = jsDate.getDay(); // 0=周日, 1=周一, ..., 6=周六
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  jsDate.setDate(jsDate.getDate() - diffToMonday);
  return `${jsDate.getFullYear()}-${String(jsDate.getMonth() + 1).padStart(2, '0')}-${String(jsDate.getDate()).padStart(2, '0')}`;
};

/**
 * 获取本月起始日期
 */
const getMonthStart = (date) => {
  const dateStr = getChinaDateStr(date);
  return dateStr.slice(0, 7) + '-01';
};

/**
 * 获取上月末日期
 */
const getLastMonthEnd = (date) => {
  const dateStr = getChinaDateStr(date);
  const year = Number.parseInt(dateStr.slice(0, 4), 10);
  const month = Number.parseInt(dateStr.slice(5, 7), 10);
  // 本地时间构造上月最后一天
  const lastDay = new Date(year, month - 1, 0); // month-1 是上个月的索引，日期 0 表示上个月最后一天
  return `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
};

/**
 * 从 proxy_logs 实时查询今日统计数据
 * 注意：数据库 timezone='+08:00'，created_at 存储的是本地时间（中国时区）
 * 所以不需要额外的时区转换
 */
const queryTodayStatsFromLogs = async (dateStr) => {
  // 直接使用日期字符串查询，不需要时区转换
  const dayStart = `${dateStr} 00:00:00`;
  const dayEnd = `${dateStr} 23:59:59`;

  const replacements = {
    createdStart: dayStart,
    createdEnd: dayEnd,
  };

  // 查询总体统计
  const summaryRow = await sequelize.query(
    `
    SELECT
      COUNT(*) AS requestCount,
      SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successCount,
      SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failCount,
      SUM(CASE WHEN success = 1 THEN cost ELSE 0 END) AS totalCost
    FROM proxy_logs
    WHERE created_at >= :createdStart AND created_at <= :createdEnd
    `,
    { replacements, type: QueryTypes.SELECT },
  );

  // 查询按小时统计 - 直接用 HOUR() 函数，因为 created_at 已经是本地时间
  const hourlyRows = await sequelize.query(
    `
    SELECT
      HOUR(created_at) AS statHour,
      COUNT(*) AS requestCount,
      SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successCount,
      SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failCount,
      SUM(CASE WHEN success = 1 THEN cost ELSE 0 END) AS totalCost
    FROM proxy_logs
    WHERE created_at >= :createdStart AND created_at <= :createdEnd
    GROUP BY HOUR(created_at)
    `,
    { replacements, type: QueryTypes.SELECT },
  );

  // 查询按账号统计
  const accountRows = await sequelize.query(
    `
    SELECT
      COALESCE(account_id, 0) AS accountId,
      COUNT(*) AS requestCount,
      SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successCount,
      SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failCount,
      SUM(CASE WHEN success = 1 THEN cost ELSE 0 END) AS totalCost
    FROM proxy_logs
    WHERE created_at >= :createdStart AND created_at <= :createdEnd
    GROUP BY account_id
    `,
    { replacements, type: QueryTypes.SELECT },
  );

  // 查询按网站统计
  const siteRows = await sequelize.query(
    `
    SELECT
      COALESCE(site_id, 0) AS siteId,
      COUNT(*) AS requestCount,
      SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successCount,
      SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failCount,
      SUM(CASE WHEN success = 1 THEN cost ELSE 0 END) AS totalCost
    FROM proxy_logs
    WHERE created_at >= :createdStart AND created_at <= :createdEnd
    GROUP BY site_id
    `,
    { replacements, type: QueryTypes.SELECT },
  );

  // 查询按备注统计
  const remarkRows = await sequelize.query(
    `
    SELECT
      remark,
      COUNT(*) AS requestCount,
      SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successCount,
      SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failCount,
      SUM(CASE WHEN success = 1 THEN cost ELSE 0 END) AS totalCost
    FROM proxy_logs
    WHERE created_at >= :createdStart AND created_at <= :createdEnd
      AND remark IS NOT NULL AND TRIM(remark) <> ''
    GROUP BY remark
    `,
    { replacements, type: QueryTypes.SELECT },
  );

  // 构建结果
  const hours = {};
  hourlyRows.forEach((row) => {
    hours[String(row.statHour)] = normalizeMetrics(row);
  });

  const accounts = {};
  accountRows.forEach((row) => {
    accounts[String(row.accountId)] = normalizeMetrics(row);
  });

  const sites = {};
  siteRows.forEach((row) => {
    sites[String(row.siteId)] = normalizeMetrics(row);
  });

  const remarks = {};
  remarkRows.forEach((row) => {
    if (row.remark) {
      remarks[row.remark] = normalizeMetrics(row);
    }
  });

  return {
    summary: normalizeMetrics(summaryRow[0]),
    hours,
    accounts,
    sites,
    remarks,
    dateStr,
    updatedAt: formatChinaDateTime(new Date()),
  };
};

/**
 * 获取今日统计（带缓存）
 */
const getTodayStats = async (dateStr) => {
  const today = dateStr || getTodayDateStr();

  // 尝试从 Redis 获取缓存
  try {
    const cached = await cacheService.getStatsTodayCache(today);
    if (cached) {
      return cached;
    }
  } catch (error) {
    logger.warn('get today stats from cache failed:', error.message);
  }

  // 从数据库查询
  const stats = await queryTodayStatsFromLogs(today);

  // 写入缓存
  try {
    await cacheService.setStatsTodayCache(today, stats, STATS_TODAY_TTL_SECONDS);
  } catch (error) {
    logger.warn('set today stats cache failed:', error.message);
  }

  return stats;
};

/**
 * 清除今日统计缓存
 */
const clearTodayStatsCache = async (dateStr) => {
  const today = dateStr || getTodayDateStr();
  try {
    await cacheService.deleteStatsTodayCache(today);
  } catch (error) {
    logger.warn('clear today stats cache failed:', error.message);
  }
};

/**
 * 从 daily_stats 查询日期范围内的统计数据
 */
const queryDailyStats = async (startDate, endDate, groupBy = 'day') => {
  const replacements = {};
  const conditions = [];

  if (startDate) {
    replacements.startDate = startDate;
    conditions.push('stat_date >= :startDate');
  }
  if (endDate) {
    replacements.endDate = endDate;
    conditions.push('stat_date <= :endDate');
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  if (groupBy === 'summary') {
    // 只返回汇总
    const row = await sequelize.query(
      `
      SELECT
        SUM(request_count) AS requestCount,
        SUM(success_count) AS successCount,
        SUM(fail_count) AS failCount,
        SUM(total_cost) AS totalCost
      FROM proxy_log_daily_stats
      ${whereSql}
      `,
      { replacements, type: QueryTypes.SELECT },
    );
    return normalizeMetrics(row[0]);
  }

  if (groupBy === 'account') {
    // 按账号汇总
    const rows = await sequelize.query(
      `
      SELECT
        account_id AS accountId,
        SUM(request_count) AS requestCount,
        SUM(success_count) AS successCount,
        SUM(fail_count) AS failCount,
        SUM(total_cost) AS totalCost
      FROM proxy_log_daily_stats
      ${whereSql}
      GROUP BY account_id
      `,
      { replacements, type: QueryTypes.SELECT },
    );
    const result = {};
    rows.forEach((row) => {
      result[String(row.accountId)] = normalizeMetrics(row);
    });
    return result;
  }

  if (groupBy === 'site') {
    // 按网站汇总
    const rows = await sequelize.query(
      `
      SELECT
        site_id AS siteId,
        SUM(request_count) AS requestCount,
        SUM(success_count) AS successCount,
        SUM(fail_count) AS failCount,
        SUM(total_cost) AS totalCost
      FROM proxy_log_daily_stats
      ${whereSql}
      GROUP BY site_id
      `,
      { replacements, type: QueryTypes.SELECT },
    );
    const result = {};
    rows.forEach((row) => {
      result[String(row.siteId)] = normalizeMetrics(row);
    });
    return result;
  }

  // 按天返回
  if (groupBy === 'hour') {
    const rows = await sequelize.query(
      `
      SELECT
        stat_hour AS statHour,
        SUM(request_count) AS requestCount,
        SUM(success_count) AS successCount,
        SUM(fail_count) AS failCount,
        SUM(total_cost) AS totalCost
      FROM proxy_log_hourly_stats
      ${whereSql}
      GROUP BY stat_hour
      ORDER BY stat_hour ASC
      `,
      { replacements, type: QueryTypes.SELECT },
    );
    const result = {};
    rows.forEach((row) => {
      result[String(row.statHour)] = normalizeMetrics(row);
    });
    return result;
  }

  if (groupBy === 'remark') {
    const remarkWhereSql = `${whereSql} ${whereSql ? 'AND' : 'WHERE'} remark IS NOT NULL AND TRIM(remark) <> ''`;
    const rows = await sequelize.query(
      `
      SELECT
        TRIM(remark) AS remark,
        SUM(request_count) AS requestCount,
        SUM(success_count) AS successCount,
        SUM(fail_count) AS failCount,
        SUM(total_cost) AS totalCost
      FROM proxy_log_remark_daily_stats
      ${remarkWhereSql}
      GROUP BY TRIM(remark)
      `,
      { replacements, type: QueryTypes.SELECT },
    );
    const result = {};
    rows.forEach((row) => {
      if (row.remark) {
        result[row.remark] = normalizeMetrics(row);
      }
    });
    return result;
  }

  const rows = await sequelize.query(
    `
    SELECT
      stat_date AS statDate,
      SUM(request_count) AS requestCount,
      SUM(success_count) AS successCount,
      SUM(fail_count) AS failCount,
      SUM(total_cost) AS totalCost
    FROM proxy_log_daily_stats
    ${whereSql}
    GROUP BY stat_date
    ORDER BY stat_date ASC
    `,
    { replacements, type: QueryTypes.SELECT },
  );
  return rows.map((row) => ({
    date: row.statDate,
    ...normalizeMetrics(row),
  }));
};

/**
 * 获取本周统计（不含今天）- 从 daily_stats 查询
 */
const getWeekStatsFromDaily = async (excludeToday = true) => {
  const today = getTodayDateStr();
  const weekStart = getWeekStart(new Date());

  // 本周开始到昨天
  const endDate = excludeToday ? addDays(new Date(), -1) : new Date();
  const endDateStr = getChinaDateStr(endDate);

  // 如果本周开始就是今天，则没有历史数据
  if (weekStart > endDateStr) {
    return buildEmptyMetrics();
  }

  return queryDailyStats(weekStart, endDateStr, 'summary');
};

/**
 * 获取本月统计（不含今天）- 从 daily_stats 查询
 */
const getMonthStatsFromDaily = async (excludeToday = true) => {
  const today = getTodayDateStr();
  const monthStart = getMonthStart(new Date());

  // 本月开始到昨天
  const endDate = excludeToday ? addDays(new Date(), -1) : new Date();
  const endDateStr = getChinaDateStr(endDate);

  // 如果本月开始就是今天，则没有历史数据
  if (monthStart > endDateStr) {
    return buildEmptyMetrics();
  }

  return queryDailyStats(monthStart, endDateStr, 'summary');
};

/**
 * 合并统计（daily_stats + today）
 */
const mergeStats = (dailyStats, todayStats) => {
  if (!dailyStats && !todayStats) {
    return buildEmptyMetrics();
  }
  if (!dailyStats) {
    return todayStats;
  }
  if (!todayStats) {
    return dailyStats;
  }
  return addMetrics(dailyStats, todayStats);
};

/**
 * 获取实时汇总数据（新方案）
 * today: 从 proxy_logs 实时查询 + Redis 缓存
 * week: daily_stats（本周已过天数）+ today
 * month: daily_stats（本月已过天数）+ today
 */
const getRealtimeAggregateNew = async (type) => {
  const today = getTodayDateStr();
  const todayStats = await getTodayStats(today);
  const todaySummary = todayStats.summary;

  if (type === 'today') {
    return {
      summary: todaySummary,
      hours: todayStats.hours,
      accounts: todayStats.accounts,
      sites: todayStats.sites,
      remarks: todayStats.remarks,
    };
  }

  if (type === 'week') {
    const weekDailyStats = await getWeekStatsFromDaily(true);
    return {
      summary: mergeStats(weekDailyStats, todaySummary),
      hours: todayStats.hours,
      accounts: {}, // 需要额外查询
      sites: {},
      remarks: {},
    };
  }

  if (type === 'month') {
    const monthDailyStats = await getMonthStatsFromDaily(true);
    return {
      summary: mergeStats(monthDailyStats, todaySummary),
      hours: todayStats.hours,
      accounts: {},
      sites: {},
      remarks: {},
    };
  }

  return {
    summary: buildEmptyMetrics(),
    hours: {},
    accounts: {},
    sites: {},
    remarks: {},
  };
};

/**
 * 获取日期范围的聚合统计（兼容旧接口）
 */
const getAggregateByDateRange = async (startDate, endDate) => {
  const today = getTodayDateStr();

  // 判断日期范围是否包含今天（startDate 和 endDate 可能是 Date 对象或字符串）
  const todayStart = `${today} 00:00:00`;
  const todayEnd = `${today} 23:59:59`;
  const startStr = startDate instanceof Date ? getChinaDateStr(startDate) : startDate;
  const endStr = endDate instanceof Date ? getChinaDateStr(endDate) : endDate;
  const includesToday = (!startStr || startStr <= today) && (!endStr || endStr >= today);

  // 获取 daily_stats 数据（不含今天）
  let dailyStats = buildEmptyMetrics();
  if (startStr && endStr) {
    const dailyStart = startStr;
    const dailyEnd = includesToday ? getChinaDateStr(addDays(new Date(endStr + 'T00:00:00'), -1)) : endStr;

    if (dailyStart <= dailyEnd) {
      dailyStats = await queryDailyStats(dailyStart, dailyEnd, 'summary');
    }
  }

  // 如果包含今天，获取今天的实时数据
  let todayStats = buildEmptyMetrics();
  if (includesToday) {
    const todayData = await getTodayStats(today);
    todayStats = todayData.summary;
  }

  return {
    summary: mergeStats(dailyStats, todayStats),
    hours: {},
    accounts: {},
    sites: {},
    remarks: {},
  };
};

/**
 * 聚合指定月份的数据到 monthly_stats
 */
const aggregateMonthToStats = async (year, month) => {
  const monthStr = `${year}-${padNumber(month)}`;
  const monthStart = `${monthStr}-01`;

  // 计算月末
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonthStart = `${nextYear}-${padNumber(nextMonth)}-01`;

  logger.info(`聚合月度统计: ${monthStr}`);

  // 从 daily_stats 聚合
  // 注意：使用 COALESCE 将 NULL 转换为 0，确保唯一键正常工作
  // MySQL 中 NULL 值不参与唯一键比较，会导致重复插入
  await sequelize.query(
    `
    INSERT INTO proxy_log_monthly_stats
      (stat_year, stat_month, site_id, account_id, request_count, success_count, fail_count, total_cost, created_at, updated_at)
    SELECT
      :year AS stat_year,
      :month AS stat_month,
      COALESCE(site_id, 0) AS site_id,
      COALESCE(account_id, 0) AS account_id,
      SUM(request_count) AS request_count,
      SUM(success_count) AS success_count,
      SUM(fail_count) AS fail_count,
      SUM(total_cost) AS total_cost,
      NOW(),
      NOW()
    FROM proxy_log_daily_stats
    WHERE stat_date >= :monthStart AND stat_date < :nextMonthStart
    GROUP BY COALESCE(site_id, 0), COALESCE(account_id, 0)
    ON DUPLICATE KEY UPDATE
      request_count = VALUES(request_count),
      success_count = VALUES(success_count),
      fail_count = VALUES(fail_count),
      total_cost = VALUES(total_cost),
      updated_at = NOW()
    `,
    {
      replacements: {
        year,
        month,
        monthStart,
        nextMonthStart,
      },
      type: QueryTypes.INSERT,
    },
  );

  logger.info(`月度统计聚合完成: ${monthStr}`);
};

/**
 * 每日结算任务 - 将指定日期的数据刷新到 daily_stats
 * @param {string} dateStr - 可选，指定日期 YYYY-MM-DD，默认昨天
 * @returns {Promise<string>} 返回结算的日期
 */
const dailySettlement = async (dateStr) => {
  const targetDate = dateStr || getChinaDateStr(addDays(new Date(), -1));
  const lockKey = `daily_settlement:${targetDate}`;

  // 尝试获取分布式锁（60秒过期）
  const lockIdentifier = await cacheService.acquireLock(lockKey, 60000);

  if (!lockIdentifier) {
    throw new Error(`日期 ${targetDate} 的结算任务正在执行中，请勿重复提交`);
  }

  try {
    logger.info(`开始每日结算: ${targetDate}`);

    // 直接使用日期字符串，因为数据库存储的是本地时间
    const dayStart = `${targetDate} 00:00:00`;
    const dayEnd = `${targetDate} 23:59:59`;

    // 将指定日期的数据从 proxy_logs 刷新到 daily_stats
    // 注意：created_at 已经是本地时间，不需要 CONVERT_TZ
    // 注意：使用 COALESCE 将 NULL 转换为 0，确保唯一键正常工作
    // MySQL 中 NULL 值不参与唯一键比较，会导致重复插入
    await sequelize.query(
      `
      DELETE FROM proxy_log_daily_stats
      WHERE stat_date = :targetDate
      `,
      {
        replacements: { targetDate },
        type: QueryTypes.DELETE,
      },
    );

    await sequelize.query(
      `
      DELETE FROM proxy_log_request_daily_stats
      WHERE stat_date = :targetDate
      `,
      {
        replacements: { targetDate },
        type: QueryTypes.DELETE,
      },
    );

    await sequelize.query(
      `
      DELETE FROM proxy_log_hourly_stats
      WHERE stat_date = :targetDate
      `,
      {
        replacements: { targetDate },
        type: QueryTypes.DELETE,
      },
    );

    await sequelize.query(
      `
      DELETE FROM proxy_log_remark_daily_stats
      WHERE stat_date = :targetDate
      `,
      {
        replacements: { targetDate },
        type: QueryTypes.DELETE,
      },
    );

    await sequelize.query(
      `
      INSERT INTO proxy_log_daily_stats (stat_date, site_id, account_id, request_count, success_count, fail_count, total_cost, created_at, updated_at)
      SELECT
        DATE(created_at) AS stat_date,
        COALESCE(site_id, 0) AS site_id,
        COALESCE(account_id, 0) AS account_id,
        COUNT(*) AS request_count,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS success_count,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS fail_count,
        SUM(CASE WHEN success = 1 THEN cost ELSE 0 END) AS total_cost,
        NOW(),
        NOW()
      FROM proxy_logs
      WHERE created_at >= :dayStart AND created_at <= :dayEnd
      GROUP BY DATE(created_at), COALESCE(site_id, 0), COALESCE(account_id, 0)
      ON DUPLICATE KEY UPDATE
        request_count = VALUES(request_count),
        success_count = VALUES(success_count),
        fail_count = VALUES(fail_count),
        total_cost = VALUES(total_cost),
        updated_at = NOW()
      `,
      {
        replacements: {
          dayStart,
          dayEnd,
        },
        type: QueryTypes.INSERT,
      },
    );

    await sequelize.query(
      `
      INSERT INTO proxy_log_request_daily_stats (stat_date, request_count, success_count, fail_count, attempt_count, total_cost, created_at, updated_at)
      SELECT
        request_day.stat_date,
        COUNT(*) AS request_count,
        SUM(request_day.request_success) AS success_count,
        SUM(CASE WHEN request_day.request_success = 1 THEN 0 ELSE 1 END) AS fail_count,
        SUM(request_day.attempt_count) AS attempt_count,
        SUM(request_day.request_cost) AS total_cost,
        NOW(),
        NOW()
      FROM (
        SELECT
          DATE(created_at) AS stat_date,
          ${REQUEST_KEY_SQL} AS request_key,
          MAX(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS request_success,
          MAX(CASE WHEN success = 1 THEN cost ELSE 0 END) AS request_cost,
          COUNT(*) AS attempt_count
        FROM proxy_logs
        WHERE created_at >= :dayStart AND created_at <= :dayEnd
        GROUP BY DATE(created_at), ${REQUEST_KEY_SQL}
      ) AS request_day
      GROUP BY request_day.stat_date
      ON DUPLICATE KEY UPDATE
        request_count = VALUES(request_count),
        success_count = VALUES(success_count),
        fail_count = VALUES(fail_count),
        attempt_count = VALUES(attempt_count),
        total_cost = VALUES(total_cost),
        updated_at = NOW()
      `,
      {
        replacements: {
          dayStart,
          dayEnd,
        },
        type: QueryTypes.INSERT,
      },
    );

    await sequelize.query(
      `
      INSERT INTO proxy_log_hourly_stats (stat_date, stat_hour, request_count, success_count, fail_count, total_cost, created_at, updated_at)
      SELECT
        DATE(created_at) AS stat_date,
        HOUR(created_at) AS stat_hour,
        COUNT(*) AS request_count,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS success_count,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS fail_count,
        SUM(CASE WHEN success = 1 THEN cost ELSE 0 END) AS total_cost,
        NOW(),
        NOW()
      FROM proxy_logs
      WHERE created_at >= :dayStart AND created_at <= :dayEnd
      GROUP BY DATE(created_at), HOUR(created_at)
      ON DUPLICATE KEY UPDATE
        request_count = VALUES(request_count),
        success_count = VALUES(success_count),
        fail_count = VALUES(fail_count),
        total_cost = VALUES(total_cost),
        updated_at = NOW()
      `,
      {
        replacements: {
          dayStart,
          dayEnd,
        },
        type: QueryTypes.INSERT,
      },
    );

    await sequelize.query(
      `
      INSERT INTO proxy_log_remark_daily_stats (stat_date, remark, request_count, success_count, fail_count, total_cost, created_at, updated_at)
      SELECT
        DATE(created_at) AS stat_date,
        TRIM(remark) AS remark,
        COUNT(*) AS request_count,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS success_count,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS fail_count,
        SUM(CASE WHEN success = 1 THEN cost ELSE 0 END) AS total_cost,
        NOW(),
        NOW()
      FROM proxy_logs
      WHERE created_at >= :dayStart AND created_at <= :dayEnd
        AND remark IS NOT NULL AND TRIM(remark) <> ''
      GROUP BY DATE(created_at), TRIM(remark)
      ON DUPLICATE KEY UPDATE
        request_count = VALUES(request_count),
        success_count = VALUES(success_count),
        fail_count = VALUES(fail_count),
        total_cost = VALUES(total_cost),
        updated_at = NOW()
      `,
      {
        replacements: {
          dayStart,
          dayEnd,
        },
        type: QueryTypes.INSERT,
      },
    );

    // 清除该日期的 Redis 缓存
    try {
      await cacheService.deleteStatsTodayCache(targetDate);
    } catch (error) {
      logger.warn('清除统计缓存失败:', error.message);
    }

    logger.info(`每日结算完成: ${targetDate}`);
    return targetDate;
  } finally {
    // 释放锁
    await cacheService.releaseLock(lockKey, lockIdentifier);
  }
};

/**
 * 每月结算任务 - 在每月1号执行，聚合上月数据
 * @param {number} year - 年份
 * @param {number} month - 月份
 * @returns {Promise<string>} 返回结算的月份
 */
const monthlySettlement = async (year, month) => {
  // 如果没有传入参数，计算上个月
  if (!year || !month) {
    const now = new Date();
    // 使用本地时间获取月份
    const currentMonth = now.getMonth() + 1; // getMonth() 返回 0-11
    const currentYear = now.getFullYear();

    // 上个月
    month = currentMonth === 1 ? 12 : currentMonth - 1;
    year = currentMonth === 1 ? currentYear - 1 : currentYear;
  }

  const monthStr = `${year}-${padNumber(month)}`;
  const lockKey = `monthly_settlement:${monthStr}`;

  // 尝试获取分布式锁（120秒过期，月度结算耗时更长）
  const lockIdentifier = await cacheService.acquireLock(lockKey, 120000);

  if (!lockIdentifier) {
    throw new Error(`月份 ${monthStr} 的结算任务正在执行中，请勿重复提交`);
  }

  try {
    logger.info(`开始每月结算: ${monthStr}`);
    await aggregateMonthToStats(year, month);
    logger.info(`每月结算完成: ${monthStr}`);
    return monthStr;
  } finally {
    // 释放锁
    await cacheService.releaseLock(lockKey, lockIdentifier);
  }
};

/**
 * 从 monthly_stats 查询历史月度数据
 */
const queryMonthlyStats = async (year, month) => {
  const rows = await sequelize.query(
    `
    SELECT
      stat_year AS statYear,
      stat_month AS statMonth,
      site_id AS siteId,
      account_id AS accountId,
      request_count AS requestCount,
      success_count AS successCount,
      fail_count AS failCount,
      total_cost AS totalCost
    FROM proxy_log_monthly_stats
    WHERE stat_year = :year AND stat_month = :month
    `,
    {
      replacements: { year, month },
      type: QueryTypes.SELECT,
    },
  );

  return rows.map((row) => normalizeMetrics(row));
};

/**
 * 获取月度统计汇总
 */
const getMonthlyStatsSummary = async (year, month) => {
  const row = await sequelize.query(
    `
    SELECT
      SUM(request_count) AS requestCount,
      SUM(success_count) AS successCount,
      SUM(fail_count) AS failCount,
      SUM(total_cost) AS totalCost
    FROM proxy_log_monthly_stats
    WHERE stat_year = :year AND stat_month = :month
    `,
    {
      replacements: { year, month },
      type: QueryTypes.SELECT,
    },
  );

  return normalizeMetrics(row[0]);
};

/**
 * 获取历史月份列表
 */
const getAvailableMonths = async () => {
  const rows = await sequelize.query(
    `
    SELECT DISTINCT stat_year, stat_month
    FROM proxy_log_monthly_stats
    ORDER BY stat_year DESC, stat_month DESC
    `,
    { type: QueryTypes.SELECT },
  );

  return rows.map((row) => `${row.stat_year}-${padNumber(row.stat_month)}`);
};

/**
 * 获取账号成功排行（新方案）
 */
const getAccountSuccessRankingNew = async (type, limit = 10) => {
  const today = getTodayDateStr();
  const yesterday = getChinaDateStr(addDays(new Date(), -1));
  const todayStats = await getTodayStats(today);

  let accountStats = {};

  if (type === 'today') {
    accountStats = todayStats.accounts || {};
  } else if (type === 'week') {
    const weekStart = getWeekStart(new Date());
    const dailyAccountStats = await queryDailyStats(weekStart, yesterday, 'account');
    accountStats = mergeAccountStats(dailyAccountStats, todayStats.accounts || {});
  } else if (type === 'month') {
    const monthStart = getMonthStart(new Date());
    const dailyAccountStats = await queryDailyStats(monthStart, yesterday, 'account');
    accountStats = mergeAccountStats(dailyAccountStats, todayStats.accounts || {});
  } else if (type === 'total') {
    // total 需要从 daily_stats 获取全部历史数据 + today
    const dailyAccountStats = await queryDailyStats(null, yesterday, 'account');
    accountStats = mergeAccountStats(dailyAccountStats, todayStats.accounts || {});
  }

  // 获取账号信息
  const accountIds = Object.keys(accountStats).filter((id) => id !== '0' && id !== 'null');
  if (accountIds.length === 0) {
    return { list: [], total: { successCount: 0, totalRequests: 0 } };
  }

  const accounts = await Account.findAll({
    where: { id: accountIds },
    attributes: ['id', 'name', 'siteId'],
    raw: true,
  });

  const siteIds = [...new Set(accounts.map((a) => a.siteId).filter(Boolean))];
  const sites = await Site.findAll({
    where: { id: siteIds },
    attributes: ['id', 'name'],
    raw: true,
  });

  const siteMap = {};
  sites.forEach((s) => {
    siteMap[s.id] = s;
  });

  const accountMap = {};
  accounts.forEach((a) => {
    accountMap[a.id] = a;
  });

  // 构建排行数据
  const list = Object.entries(accountStats)
    .filter(([id]) => id !== '0' && id !== 'null' && accountMap[id])
    .map(([id, stats]) => ({
      accountId: Number(id),
      accountName: accountMap[id]?.name || '未知',
      siteName: accountMap[id]?.siteId ? (siteMap[accountMap[id].siteId]?.name || '未知站点') : '独立包月',
      totalRequests: stats.requestCount || 0,
      successCount: stats.successCount || 0,
      successRate: stats.requestCount > 0 ? ((stats.successCount / stats.requestCount) * 100).toFixed(2) : '0.00',
      totalCost: stats.totalCost || 0,
    }))
    .sort((a, b) => b.successCount - a.successCount)
    .slice(0, limit);

  const totalSuccess = Object.values(accountStats).reduce((sum, s) => sum + (s.successCount || 0), 0);
  const totalRequests = Object.values(accountStats).reduce((sum, s) => sum + (s.requestCount || 0), 0);

  return {
    list,
    total: { successCount: totalSuccess, totalRequests },
  };
};

/**
 * 获取账号失败排行（新方案）
 */
const getAccountFailRankingNew = async (type, limit = 10) => {
  const today = getTodayDateStr();
  const yesterday = getChinaDateStr(addDays(new Date(), -1));
  const todayStats = await getTodayStats(today);

  let accountStats = {};

  if (type === 'today') {
    accountStats = todayStats.accounts || {};
  } else if (type === 'week') {
    const weekStart = getWeekStart(new Date());
    const dailyAccountStats = await queryDailyStats(weekStart, yesterday, 'account');
    accountStats = mergeAccountStats(dailyAccountStats, todayStats.accounts || {});
  } else if (type === 'month') {
    const monthStart = getMonthStart(new Date());
    const dailyAccountStats = await queryDailyStats(monthStart, yesterday, 'account');
    accountStats = mergeAccountStats(dailyAccountStats, todayStats.accounts || {});
  } else if (type === 'total') {
    const dailyAccountStats = await queryDailyStats(null, yesterday, 'account');
    accountStats = mergeAccountStats(dailyAccountStats, todayStats.accounts || {});
  }

  // 获取账号信息
  const accountIds = Object.keys(accountStats).filter((id) => id !== '0' && id !== 'null');
  if (accountIds.length === 0) {
    return { list: [], total: { failCount: 0, totalRequests: 0 } };
  }

  const accounts = await Account.findAll({
    where: { id: accountIds },
    attributes: ['id', 'name', 'siteId', 'failCount'],
    raw: true,
  });

  const siteIds = [...new Set(accounts.map((a) => a.siteId).filter(Boolean))];
  const sites = await Site.findAll({
    where: { id: siteIds },
    attributes: ['id', 'name'],
    raw: true,
  });

  const siteMap = {};
  sites.forEach((s) => {
    siteMap[s.id] = s;
  });

  const accountMap = {};
  accounts.forEach((a) => {
    accountMap[a.id] = a;
  });

  // 构建排行数据
  const list = Object.entries(accountStats)
    .filter(([id]) => id !== '0' && id !== 'null' && accountMap[id])
    .map(([id, stats]) => ({
      accountId: Number(id),
      accountName: accountMap[id]?.name || '未知',
      siteName: accountMap[id]?.siteId ? (siteMap[accountMap[id].siteId]?.name || '未知站点') : '独立包月',
      totalRequests: stats.requestCount || 0,
      failCount: stats.failCount || 0,
      currentFailCount: accountMap[id]?.failCount || 0,
    }))
    .filter((item) => item.failCount > 0)
    .sort((a, b) => b.failCount - a.failCount)
    .slice(0, limit);

  const totalFail = Object.values(accountStats).reduce((sum, s) => sum + (s.failCount || 0), 0);
  const totalRequests = Object.values(accountStats).reduce((sum, s) => sum + (s.requestCount || 0), 0);

  return {
    list,
    total: { failCount: totalFail, totalRequests },
  };
};

/**
 * 获取网站分布（新方案）
 */
const getSiteDistributionNew = async (type) => {
  const today = getTodayDateStr();
  const yesterday = getChinaDateStr(addDays(new Date(), -1));
  const todayStats = await getTodayStats(today);

  let siteStats = {};

  if (type === 'today') {
    siteStats = todayStats.sites || {};
  } else if (type === 'week') {
    const weekStart = getWeekStart(new Date());
    const dailySiteStats = await queryDailyStats(weekStart, yesterday, 'site');
    siteStats = mergeAccountStats(dailySiteStats, todayStats.sites || {});
  } else if (type === 'month') {
    const monthStart = getMonthStart(new Date());
    const dailySiteStats = await queryDailyStats(monthStart, yesterday, 'site');
    siteStats = mergeAccountStats(dailySiteStats, todayStats.sites || {});
  } else if (type === 'total') {
    const dailySiteStats = await queryDailyStats(null, yesterday, 'site');
    siteStats = mergeAccountStats(dailySiteStats, todayStats.sites || {});
  }

  // 获取网站信息
  const siteIds = Object.keys(siteStats).filter((id) => id !== '0' && id !== 'null');
  if (siteIds.length === 0) {
    return { list: [], total: { totalRequests: 0, successCount: 0 } };
  }

  const sites = await Site.findAll({
    where: { id: siteIds },
    attributes: ['id', 'name'],
    raw: true,
  });

  const siteMap = {};
  sites.forEach((s) => {
    siteMap[s.id] = s;
  });

  // 构建分布数据
  const list = Object.entries(siteStats)
    .filter(([id]) => id !== '0' && id !== 'null' && siteMap[id])
    .map(([id, stats]) => ({
      siteId: Number(id),
      siteName: siteMap[id]?.name || '未知',
      totalRequests: stats.requestCount || 0,
      successCount: stats.successCount || 0,
      successRate: stats.requestCount > 0 ? ((stats.successCount / stats.requestCount) * 100).toFixed(2) : '0.00',
      totalCost: stats.totalCost || 0,
    }))
    .sort((a, b) => b.totalRequests - a.totalRequests);

  const totalRequests = Object.values(siteStats).reduce((sum, s) => sum + (s.requestCount || 0), 0);
  const totalSuccess = Object.values(siteStats).reduce((sum, s) => sum + (s.successCount || 0), 0);

  return {
    list,
    total: { totalRequests, successCount: totalSuccess },
  };
};

/**
 * 获取每小时分布（新方案）
 */
const getHourlyDistributionNew = async (type) => {
  const today = getTodayDateStr();
  const yesterday = getChinaDateStr(addDays(new Date(), -1));
  const todayStats = await getTodayStats(today);

  // 小时分布只从今日实时数据获取
  let hours = {};

  if (type === 'today') {
    hours = todayStats.hours || {};
  } else if (type === 'week') {
    const weekStart = getWeekStart(new Date());
    const dailyHourlyStats = await queryDailyStats(weekStart, yesterday, 'hour');
    hours = mergeAccountStats(dailyHourlyStats, todayStats.hours || {});
  } else if (type === 'month') {
    const monthStart = getMonthStart(new Date());
    const dailyHourlyStats = await queryDailyStats(monthStart, yesterday, 'hour');
    hours = mergeAccountStats(dailyHourlyStats, todayStats.hours || {});
  } else if (type === 'total') {
    const dailyHourlyStats = await queryDailyStats(null, yesterday, 'hour');
    hours = mergeAccountStats(dailyHourlyStats, todayStats.hours || {});
  }

  // 构建 0-23 小时数据
  const list = [];
  for (let h = 0; h < 24; h += 1) {
    const hourStr = String(h);
    const stats = hours[hourStr] || { requestCount: 0, successCount: 0, failCount: 0 };
    list.push({
      hour: h,
      label: `${String(h).padStart(2, '0')}:00`,
      requests: stats.requestCount || 0,
      successCount: stats.successCount || 0,
      failCount: stats.failCount || 0,
    });
  }

  return list;
};

/**
 * 获取备注请求排行（新方案）
 */
const getRemarkRequestRankingNew = async (type, limit = 10) => {
  const today = getTodayDateStr();
  const yesterday = getChinaDateStr(addDays(new Date(), -1));
  const todayStats = await getTodayStats(today);

  // 备注统计目前只支持今日
  let remarkStats = {};

  if (type === 'today') {
    remarkStats = todayStats.remarks || {};
  } else if (type === 'week') {
    const weekStart = getWeekStart(new Date());
    const dailyRemarkStats = await queryDailyStats(weekStart, yesterday, 'remark');
    remarkStats = mergeAccountStats(dailyRemarkStats, todayStats.remarks || {});
  } else if (type === 'month') {
    const monthStart = getMonthStart(new Date());
    const dailyRemarkStats = await queryDailyStats(monthStart, yesterday, 'remark');
    remarkStats = mergeAccountStats(dailyRemarkStats, todayStats.remarks || {});
  } else if (type === 'total') {
    const dailyRemarkStats = await queryDailyStats(null, yesterday, 'remark');
    remarkStats = mergeAccountStats(dailyRemarkStats, todayStats.remarks || {});
  }

  // 构建排行数据
  const list = Object.entries(remarkStats)
    .filter(([remark]) => remark && remark.trim())
    .map(([remark, stats]) => ({
      remark,
      totalRequests: stats.requestCount || 0,
      successCount: stats.successCount || 0,
      failCount: stats.failCount || 0,
    }))
    .sort((a, b) => b.totalRequests - a.totalRequests)
    .slice(0, limit);

  const totalRequests = Object.values(remarkStats).reduce((sum, s) => sum + (s.requestCount || 0), 0);

  return {
    list,
    total: { totalRequests },
  };
};

/**
 * 获取备注消费排行（新方案）
 */
const getRemarkCostRankingNew = async (type, limit = 10) => {
  const today = getTodayDateStr();
  const yesterday = getChinaDateStr(addDays(new Date(), -1));
  const todayStats = await getTodayStats(today);

  // 备注统计目前只支持今日
  let remarkStats = {};

  if (type === 'today') {
    remarkStats = todayStats.remarks || {};
  } else if (type === 'week') {
    const weekStart = getWeekStart(new Date());
    const dailyRemarkStats = await queryDailyStats(weekStart, yesterday, 'remark');
    remarkStats = mergeAccountStats(dailyRemarkStats, todayStats.remarks || {});
  } else if (type === 'month') {
    const monthStart = getMonthStart(new Date());
    const dailyRemarkStats = await queryDailyStats(monthStart, yesterday, 'remark');
    remarkStats = mergeAccountStats(dailyRemarkStats, todayStats.remarks || {});
  } else if (type === 'total') {
    const dailyRemarkStats = await queryDailyStats(null, yesterday, 'remark');
    remarkStats = mergeAccountStats(dailyRemarkStats, todayStats.remarks || {});
  }

  // 构建排行数据
  const list = Object.entries(remarkStats)
    .filter(([remark]) => remark && remark.trim())
    .map(([remark, stats]) => ({
      remark,
      totalRequests: stats.requestCount || 0,
      totalCost: stats.totalCost || 0,
    }))
    .sort((a, b) => b.totalCost - a.totalCost)
    .slice(0, limit);

  const totalCost = Object.values(remarkStats).reduce((sum, s) => sum + (s.totalCost || 0), 0);

  return {
    list,
    total: { totalCost },
  };
};

/**
 * 获取概览数据（新方案）
 */
const getOverviewNew = async () => {
  const today = getTodayDateStr();
  const yesterday = getChinaDateStr(addDays(new Date(), -1));

  // 今日数据
  const todayStats = await getTodayStats(today);
  const todaySummary = todayStats.summary;

  // 昨日数据
  const yesterdayDailyStats = await queryDailyStats(yesterday, yesterday, 'summary');

  // 本周数据（daily_stats + today）
  const weekStart = getWeekStart(new Date());
  const weekDailyStats = await queryDailyStats(weekStart, yesterday, 'summary');
  const weekSummary = mergeStats(weekDailyStats, todaySummary);

  // 本月数据（daily_stats + today）
  const monthStart = getMonthStart(new Date());
  const monthDailyStats = await queryDailyStats(monthStart, yesterday, 'summary');
  const monthSummary = mergeStats(monthDailyStats, todaySummary);

  // 总计数据（从 daily_stats 获取全部 + today）
  const totalDailyStats = await queryDailyStats(null, yesterday, 'summary');
  const totalSummary = mergeStats(totalDailyStats, todaySummary);

  return {
    today: {
      requests: todaySummary.requestCount,
      successCount: todaySummary.successCount,
      cost: todaySummary.totalCost,
    },
    yesterday: {
      requests: yesterdayDailyStats.requestCount,
      successCount: yesterdayDailyStats.successCount,
      cost: yesterdayDailyStats.totalCost,
    },
    week: {
      requests: weekSummary.requestCount,
      successCount: weekSummary.successCount,
      cost: weekSummary.totalCost,
    },
    month: {
      requests: monthSummary.requestCount,
      successCount: monthSummary.successCount,
      cost: monthSummary.totalCost,
    },
    total: {
      requests: totalSummary.requestCount,
      successCount: totalSummary.successCount,
      cost: totalSummary.totalCost,
    },
  };
};

const getOverviewByRequestScope = async () => {
  const today = getTodayDateStr();
  const yesterday = getChinaDateStr(addDays(new Date(), -1));

  const todaySummary = await queryRequestSummaryFromLogs(today);
  const yesterdaySummary = await queryDailyRequestStats(yesterday, yesterday);

  const weekStart = getWeekStart(new Date());
  const weekDailySummary = await queryDailyRequestStats(weekStart, yesterday);
  const weekSummary = addOverviewMetrics(weekDailySummary, todaySummary);

  const monthStart = getMonthStart(new Date());
  const monthDailySummary = await queryDailyRequestStats(monthStart, yesterday);
  const monthSummary = addOverviewMetrics(monthDailySummary, todaySummary);

  const totalDailySummary = await queryDailyRequestStats(null, yesterday);
  const totalSummary = addOverviewMetrics(totalDailySummary, todaySummary);

  return {
    today: {
      requests: todaySummary.requestCount,
      successCount: todaySummary.successCount,
      attempts: todaySummary.attemptCount,
      cost: todaySummary.totalCost,
    },
    yesterday: {
      requests: yesterdaySummary.requestCount,
      successCount: yesterdaySummary.successCount,
      attempts: yesterdaySummary.attemptCount,
      cost: yesterdaySummary.totalCost,
    },
    week: {
      requests: weekSummary.requestCount,
      successCount: weekSummary.successCount,
      attempts: weekSummary.attemptCount,
      cost: weekSummary.totalCost,
    },
    month: {
      requests: monthSummary.requestCount,
      successCount: monthSummary.successCount,
      attempts: monthSummary.attemptCount,
      cost: monthSummary.totalCost,
    },
    total: {
      requests: totalSummary.requestCount,
      successCount: totalSummary.successCount,
      attempts: totalSummary.attemptCount,
      cost: totalSummary.totalCost,
    },
  };
};

const buildDashboardChartPoint = (date, metrics = {}) => ({
  date,
  requests: toInteger(metrics.requestCount),
  successCount: toInteger(metrics.successCount),
  cost: toFloat(metrics.totalCost),
});

const buildDashboardChartNew = async (type = 'week') => {
  const now = new Date();
  const today = getTodayDateStr();
  const yesterday = getChinaDateStr(addDays(now, -1));

  if (type === 'today') {
    const todaySummary = await queryRequestSummaryFromLogs(today);
    return [buildDashboardChartPoint(today, todaySummary)];
  }

  if (type === 'yesterday') {
    const yesterdaySummary = await queryDailyRequestStats(yesterday, yesterday);
    return [buildDashboardChartPoint(yesterday, yesterdaySummary)];
  }

  const startDate = type === 'month' ? getMonthStart(now) : getWeekStart(now);
  const dailyRows = await queryDailyRequestChartRows(startDate, yesterday);
  const todaySummary = await queryRequestSummaryFromLogs(today);
  const chartMap = {};

  dailyRows.forEach((row) => {
    chartMap[row.statDate] = row;
  });

  chartMap[today] = todaySummary;

  const result = [];
  let currentDate = new Date(`${startDate}T00:00:00`);
  const endDate = new Date(`${today}T00:00:00`);

  while (currentDate <= endDate) {
    const dateKey = getChinaDateStr(currentDate);
    result.push(buildDashboardChartPoint(dateKey, chartMap[dateKey] || buildEmptyOverviewMetrics()));
    currentDate = addDays(currentDate, 1);
  }

  return result;
};

/**
 * 合并账号/网站统计
 */
const mergeAccountStats = (dailyStats, todayStats) => {
  const result = { ...todayStats };
  Object.entries(dailyStats).forEach(([id, stats]) => {
    if (result[id]) {
      result[id] = addMetrics(result[id], stats);
    } else {
      result[id] = { ...stats };
    }
  });
  return result;
};

/**
 * 清空新方案所有数据
 * 包括：daily_stats 表、monthly_stats 表、所有今日缓存
 */
const clearAllNewStatsData = async () => {
  const results = {
    dailyStatsDeleted: 0,
    requestDailyStatsDeleted: 0,
    monthlyStatsDeleted: 0,
    cacheCleared: false,
  };

  // 清空 daily_stats 表
  try {
    const dailyResult = await sequelize.query(
      'DELETE FROM proxy_log_daily_stats',
      { type: QueryTypes.DELETE },
    );
    results.dailyStatsDeleted = dailyResult;
    logger.info('已清空 proxy_log_daily_stats 表');
  } catch (error) {
    logger.error('清空 daily_stats 表失败:', error.message);
    throw error;
  }

  // 清空 monthly_stats 表
  try {
    const requestDailyResult = await sequelize.query(
      'DELETE FROM proxy_log_request_daily_stats',
      { type: QueryTypes.DELETE },
    );
    results.requestDailyStatsDeleted = requestDailyResult;
  } catch (error) {
    logger.error('clear proxy_log_request_daily_stats failed:', error.message);
    throw error;
  }

  try {
    const monthlyResult = await sequelize.query(
      'DELETE FROM proxy_log_monthly_stats',
      { type: QueryTypes.DELETE },
    );
    results.monthlyStatsDeleted = monthlyResult;
    logger.info('已清空 proxy_log_monthly_stats 表');
  } catch (error) {
    logger.error('清空 monthly_stats 表失败:', error.message);
    throw error;
  }

  // 清空所有今日统计相关的 Redis 缓存
  try {
    await cacheService.clearAllStatsTodayCache();
    results.cacheCleared = true;
    logger.info('已清空所有今日统计缓存');
  } catch (error) {
    logger.warn('清空 Redis 缓存失败:', error.message);
    // 缓存清理失败不阻止操作
    results.cacheCleared = false;
    results.cacheError = error.message;
  }

  return results;
};

module.exports = {
  // 今日统计
  getTodayStats,
  queryTodayStatsFromLogs,
  clearTodayStatsCache,

  // daily_stats 查询
  queryDailyStats,
  getWeekStatsFromDaily,
  getMonthStatsFromDaily,

  // 合并统计
  mergeStats,
  mergeAccountStats,

  // 聚合统计
  getRealtimeAggregateNew,
  getAggregateByDateRange,

  // 结算任务
  dailySettlement,
  monthlySettlement,
  aggregateMonthToStats,

  // monthly_stats 查询
  queryMonthlyStats,
  getMonthlyStatsSummary,
  getAvailableMonths,

  // 新增的排行和分布接口
  getOverviewNew: getOverviewByRequestScope,
  getDashboardChartNew: buildDashboardChartNew,
  getAccountSuccessRankingNew,
  getAccountFailRankingNew,
  getSiteDistributionNew,
  getHourlyDistributionNew,
  getRemarkRequestRankingNew,
  getRemarkCostRankingNew,

  // 清空数据
  clearAllNewStatsData,

  // 工具函数
  getTodayDateStr,
  getWeekStart,
  getMonthStart,
  buildEmptyMetrics,
  normalizeMetrics,
  addMetrics,
};
