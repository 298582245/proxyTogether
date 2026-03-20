const { QueryTypes, Op } = require('sequelize');
const { sequelize } = require('../config/database');
const Account = require('../models/Account');
const Site = require('../models/Site');
const ProxyStatsSnapshot = require('../models/ProxyStatsSnapshot');
const logStatsService = require('./logStatsService');
const cacheService = require('./cacheService');
const statsNewService = require('./statsNewService');
const {
  addDays,
  getChinaDateStr,
  getChinaDayEnd,
  getChinaDayStart,
} = require('../utils/statsTime');

const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000;

const buildEmptyMetrics = () => ({
  requestCount: 0,
  successCount: 0,
  failCount: 0,
  totalCost: 0,
});

const toInteger = (value) => Number.parseInt(value, 10) || 0;
const toFloat = (value) => Number.parseFloat(value) || 0;
const padNumber = (value) => String(value).padStart(2, '0');
const isValidDateString = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isValidMonthString = (value) => typeof value === 'string' && /^\d{4}-\d{2}$/.test(value);

const shiftToChinaTime = (date) => new Date(date.getTime() + CHINA_OFFSET_MS);

const formatChinaDateTime = (date) => {
  if (!date) {
    return null;
  }

  const chinaDate = shiftToChinaTime(new Date(date));
  return `${chinaDate.getUTCFullYear()}-${padNumber(chinaDate.getUTCMonth() + 1)}-${padNumber(chinaDate.getUTCDate())} ${padNumber(chinaDate.getUTCHours())}:${padNumber(chinaDate.getUTCMinutes())}:${padNumber(chinaDate.getUTCSeconds())}`;
};

const parseSnapshotDateTime = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    const parsedDate = new Date(value.replace(' ', 'T') + '+08:00');
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const getMonthKey = (date) => {
  const chinaDate = shiftToChinaTime(date);
  return `${chinaDate.getUTCFullYear()}-${padNumber(chinaDate.getUTCMonth() + 1)}`;
};

const getMonthRangeByMonthKey = (monthKey) => {
  const monthStart = getChinaDayStart(`${monthKey}-01`);
  const chinaMonthStart = shiftToChinaTime(monthStart);
  const nextMonthStart = new Date(Date.UTC(
    chinaMonthStart.getUTCFullYear(),
    chinaMonthStart.getUTCMonth() + 1,
    1,
    0,
    0,
    0,
    0,
  ) - CHINA_OFFSET_MS);

  return {
    startDate: monthStart,
    endDate: new Date(nextMonthStart.getTime() - 1),
  };
};

const getWeekRangeByDate = (statDate) => {
  const dayStart = getChinaDayStart(statDate);
  const chinaDate = shiftToChinaTime(dayStart);
  const dayOfWeek = chinaDate.getUTCDay();
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStartDate = addDays(dayStart, -diffToMonday);
  const weekEndDate = getChinaDayEnd(getChinaDateStr(addDays(weekStartDate, 6)));

  return {
    startDate: weekStartDate,
    endDate: weekEndDate,
    weekKey: getChinaDateStr(weekStartDate),
  };
};

const getMonthRangeByDate = (statDate) => {
  const dayStart = getChinaDayStart(statDate);
  const monthKey = getMonthKey(dayStart);
  const { startDate, endDate } = getMonthRangeByMonthKey(monthKey);
  return {
    startDate,
    endDate,
    monthKey,
  };
};

const normalizeMetrics = (metrics = {}) => ({
  requestCount: toInteger(metrics.requestCount),
  successCount: toInteger(metrics.successCount),
  failCount: toInteger(metrics.failCount),
  totalCost: toFloat(metrics.totalCost),
});

const addMetrics = (target, source = {}) => ({
  requestCount: toInteger(target.requestCount) + toInteger(source.requestCount),
  successCount: toInteger(target.successCount) + toInteger(source.successCount),
  failCount: toInteger(target.failCount) + toInteger(source.failCount),
  totalCost: Number((toFloat(target.totalCost) + toFloat(source.totalCost)).toFixed(4)),
});

const subtractMetrics = (target, source = {}) => {
  const requestCount = Math.max(toInteger(target.requestCount) - toInteger(source.requestCount), 0);
  const successCount = Math.max(toInteger(target.successCount) - toInteger(source.successCount), 0);
  const totalCost = Math.max(Number((toFloat(target.totalCost) - toFloat(source.totalCost)).toFixed(4)), 0);
  return {
    requestCount,
    successCount,
    failCount: Math.max(requestCount - successCount, 0),
    totalCost,
  };
};

const sumMetricsFromMap = (metricMap = {}) => Object.values(metricMap).reduce(
  (result, item) => addMetrics(result, item),
  buildEmptyMetrics(),
);

const sumPositiveAccountMetrics = (metricMap = {}) => Object.entries(metricMap).reduce(
  (result, [accountId, item]) => (toInteger(accountId) > 0 ? addMetrics(result, item) : result),
  buildEmptyMetrics(),
);

const getJsonMap = (value) => {
  if (!value) {
    return {};
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value) || {};
    } catch (error) {
      return {};
    }
  }

  if (typeof value === 'object') {
    return value;
  }

  return {};
};

const buildRowKey = (accountId, siteId) => `${accountId}:${siteId}`;

const getMetricValueFromMap = (metricMap, key) => {
  if (!metricMap || metricMap[key] === undefined || metricMap[key] === null) {
    return 0;
  }

  return Number(metricMap[key]) || 0;
};

const setMetricValueToMap = (metricMap, key, value) => ({
  ...getJsonMap(metricMap),
  [key]: value,
});

const stringifyMetricMap = (metricMap) => JSON.stringify(getJsonMap(metricMap));

const buildSummaryMetrics = (summary = {}) => ({
  requestCount: toInteger(summary.requestCount),
  successCount: toInteger(summary.successCount),
  failCount: toInteger(summary.failCount),
  totalCost: toFloat(summary.totalCost),
});

const buildDiffMetrics = (storedMetrics, rawMetrics) => ({
  requestCountDiff: toInteger(storedMetrics.requestCount) - toInteger(rawMetrics.requestCount),
  successCountDiff: toInteger(storedMetrics.successCount) - toInteger(rawMetrics.successCount),
  failCountDiff: toInteger(storedMetrics.failCount) - toInteger(rawMetrics.failCount),
  totalCostDiff: Number((toFloat(storedMetrics.totalCost) - toFloat(rawMetrics.totalCost)).toFixed(4)),
});

const buildCompareItem = (label, storedMetrics, rawMetrics, key) => {
  const normalizedStored = buildSummaryMetrics(storedMetrics);
  const normalizedRaw = buildSummaryMetrics(rawMetrics);
  const diffMetrics = buildDiffMetrics(normalizedStored, normalizedRaw);
  const matched = diffMetrics.requestCountDiff === 0
    && diffMetrics.successCountDiff === 0
    && diffMetrics.failCountDiff === 0
    && Math.abs(diffMetrics.totalCostDiff) < 0.0001;

  return {
    key,
    label,
    matched,
    stored: normalizedStored,
    raw: normalizedRaw,
    diff: diffMetrics,
  };
};

const buildMetricsFromMonthsMap = (row, requestField, successField, costField, key) => {
  const requestMap = getJsonMap(row?.[requestField]);
  const successMap = getJsonMap(row?.[successField]);
  const costMap = getJsonMap(row?.[costField]);
  const requestCount = getMetricValueFromMap(requestMap, key);
  const successCount = getMetricValueFromMap(successMap, key);
  const totalCost = getMetricValueFromMap(costMap, key);

  return {
    requestCount,
    successCount,
    failCount: Math.max(requestCount - successCount, 0),
    totalCost,
  };
};

const getAvailableStatDates = async () => sequelize.query(
  `
    SELECT DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+08:00'), '%Y-%m-%d') AS statDate
    FROM proxy_logs
    GROUP BY DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+08:00'), '%Y-%m-%d')
    ORDER BY statDate DESC
  `,
  { type: QueryTypes.SELECT },
);

const getAvailableMonths = async () => sequelize.query(
  `
    SELECT DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+08:00'), '%Y-%m') AS monthKey
    FROM proxy_logs
    GROUP BY DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+08:00'), '%Y-%m')
    ORDER BY monthKey DESC
  `,
  { type: QueryTypes.SELECT },
);

const getLatestLogDateTime = async () => {
  const rows = await sequelize.query(
    'SELECT MAX(created_at) AS latestCreatedAt FROM proxy_logs',
    { type: QueryTypes.SELECT },
  );

  return parseSnapshotDateTime(rows[0]?.latestCreatedAt);
};

const getAvailableOptions = async () => {
  const [dateRows, monthRows, latestDateTime] = await Promise.all([
    getAvailableStatDates(),
    getAvailableMonths(),
    getLatestLogDateTime(),
  ]);

  const currentDate = getChinaDateStr(new Date());
  const currentMonth = currentDate.slice(0, 7);

  return {
    availableDates: [...new Set([currentDate, ...dateRows.map((item) => item.statDate).filter(Boolean)])]
      .sort((left, right) => right.localeCompare(left)),
    availableMonths: [...new Set([currentMonth, ...monthRows.map((item) => item.monthKey).filter(Boolean)])]
      .sort((left, right) => right.localeCompare(left)),
    currentDateTime: formatChinaDateTime(new Date()),
    latestDateTime: formatChinaDateTime(latestDateTime),
  };
};

const resolveSnapshotTarget = (statDate, statDateTime, compareMonth) => {
  const parsedStatDateTime = parseSnapshotDateTime(statDateTime);
  const resolvedStatDate = isValidDateString(statDate)
    ? statDate
    : (parsedStatDateTime ? getChinaDateStr(parsedStatDateTime) : null);

  if (!resolvedStatDate) {
    throw new Error('统计日期或时间点格式不正确');
  }

  const resolvedCompareMonth = isValidMonthString(compareMonth)
    ? compareMonth
    : resolvedStatDate.slice(0, 7);

  return {
    resolvedStatDate,
    resolvedCompareMonth,
  };
};

const snapshotCompareWhere = {
  [Op.or]: [
    { accountId: { [Op.gt]: 0 } },
    { accountId: 0, siteId: 0 },
  ],
};

const getAggregateMetrics = (aggregateMap, key) => normalizeMetrics(aggregateMap[String(key)] || aggregateMap[key] || buildEmptyMetrics());

const getAccountSiteMap = async (accountIds) => {
  if (!accountIds.length) {
    return {};
  }

  const accounts = await Account.findAll({
    where: { id: accountIds },
    attributes: ['id', 'name', 'siteId'],
    raw: true,
  });

  const accountMap = {};
  accounts.forEach((account) => {
    accountMap[account.id] = account;
  });

  return accountMap;
};

const buildSnapshotRowEntries = async (dayAggregate, weekAggregate, monthAggregate) => {
  const failedDayMetrics = subtractMetrics(dayAggregate.summary, sumPositiveAccountMetrics(dayAggregate.accounts));
  const failedWeekMetrics = subtractMetrics(weekAggregate.summary, sumPositiveAccountMetrics(weekAggregate.accounts));
  const failedMonthMetrics = subtractMetrics(monthAggregate.summary, sumPositiveAccountMetrics(monthAggregate.accounts));

  const rowMap = {
    [buildRowKey(0, 0)]: {
      accountId: 0,
      siteId: 0,
      today: normalizeMetrics(failedDayMetrics),
      week: normalizeMetrics(failedWeekMetrics),
      month: normalizeMetrics(failedMonthMetrics),
      months: normalizeMetrics(failedMonthMetrics),
    },
  };

  const accountIds = [...new Set([
    ...Object.keys(dayAggregate.accounts || {}),
    ...Object.keys(weekAggregate.accounts || {}),
    ...Object.keys(monthAggregate.accounts || {}),
  ])]
    .map((item) => toInteger(item))
    .filter((item) => item > 0);

  const accountMap = await getAccountSiteMap(accountIds);

  accountIds.forEach((accountId) => {
    const siteId = toInteger(accountMap[accountId]?.siteId) || 0;
    rowMap[buildRowKey(accountId, siteId)] = {
      accountId,
      siteId,
      today: getAggregateMetrics(dayAggregate.accounts, accountId),
      week: getAggregateMetrics(weekAggregate.accounts, accountId),
      month: getAggregateMetrics(monthAggregate.accounts, accountId),
      months: getAggregateMetrics(monthAggregate.accounts, accountId),
    };
  });

  return Object.values(rowMap);
};

const refreshSnapshotByDate = async (statDate) => {
  if (!isValidDateString(statDate)) {
    throw new Error('统计日期格式不正确');
  }

  const lockKey = `snapshot_refresh:${statDate}`;
  // 尝试获取分布式锁（120秒过期，快照刷新可能耗时较长）
  const lockIdentifier = await cacheService.acquireLock(lockKey, 120000);

  if (!lockIdentifier) {
    throw new Error(`日期 ${statDate} 的快照刷新正在执行中，请勿重复提交`);
  }

  try {
    const today = getChinaDateStr(new Date());
    const isToday = statDate === today;

    // 如果是今天，先清除今天的 Redis 缓存，确保获取最新数据
    if (isToday) {
      await statsNewService.clearTodayStatsCache(today);
    }

    await ProxyStatsSnapshot.destroy({
      where: {
        accountId: 0,
        siteId: { [Op.ne]: 0 },
      },
    });

  const dayStart = getChinaDayStart(statDate);
  const dayEnd = getChinaDayEnd(statDate);
  const weekRange = getWeekRangeByDate(statDate);
  const monthRange = getMonthRangeByDate(statDate);

  let dayAggregate, weekAggregate, monthAggregate;

  if (isToday) {
    // 使用新方案获取今天的实时数据
    const todayStats = await statsNewService.getTodayStats(today);

    dayAggregate = {
      summary: todayStats.summary,
      hours: todayStats.hours,
      accounts: todayStats.accounts,
      sites: todayStats.sites,
      remarks: todayStats.remarks,
    };

    // 获取已过天数的 daily_stats
    const weekDailyStats = await getWeekDailyStats(statDate);
    const monthDailyStats = await getMonthDailyStats(statDate);

    weekAggregate = {
      summary: statsNewService.mergeStats(weekDailyStats, todayStats.summary),
      hours: todayStats.hours,
      accounts: {},
      sites: {},
      remarks: {},
    };

    monthAggregate = {
      summary: statsNewService.mergeStats(monthDailyStats, todayStats.summary),
      hours: todayStats.hours,
      accounts: {},
      sites: {},
      remarks: {},
    };
  } else {
    // 非今天的数据：从 proxy_logs 直接查询
    [dayAggregate, weekAggregate, monthAggregate] = await Promise.all([
      logStatsService.getRawAggregateByDateRange(dayStart, dayEnd),
      logStatsService.getRawAggregateByDateRange(weekRange.startDate, weekRange.endDate),
      logStatsService.getRawAggregateByDateRange(monthRange.startDate, monthRange.endDate),
    ]);
  }

  const rowEntries = await buildSnapshotRowEntries(dayAggregate, weekAggregate, monthAggregate);
  const rowEntryMap = rowEntries.reduce((result, item) => ({
    ...result,
    [buildRowKey(item.accountId, item.siteId)]: item,
  }), {});
  const existingRows = await ProxyStatsSnapshot.findAll({ where: snapshotCompareWhere });
  const existingRowMap = {};

  existingRows.forEach((item) => {
    existingRowMap[buildRowKey(item.accountId, item.siteId)] = item;
  });

  const allRowKeys = [...new Set([
    ...Object.keys(existingRowMap),
    ...Object.keys(rowEntryMap),
  ])];

  await Promise.all(allRowKeys.map(async (rowKey) => {
    const existingRow = existingRowMap[rowKey];
    const item = rowEntryMap[rowKey];
    const payload = item
      ? {
        accountId: item.accountId,
        siteId: item.siteId,
        todayRequest: item.today.requestCount,
        todaySuccess: item.today.successCount,
        todayCost: Number(item.today.totalCost.toFixed(4)),
        weekRequest: item.week.requestCount,
        weekSuccess: item.week.successCount,
        weekCost: Number(item.week.totalCost.toFixed(4)),
        monthRequest: item.month.requestCount,
        monthSuccess: item.month.successCount,
        monthCost: Number(item.month.totalCost.toFixed(4)),
        monthsRequest: stringifyMetricMap(setMetricValueToMap(existingRow?.monthsRequest, monthRange.monthKey, item.months.requestCount)),
        monthsSuccess: stringifyMetricMap(setMetricValueToMap(existingRow?.monthsSuccess, monthRange.monthKey, item.months.successCount)),
        monthsCost: stringifyMetricMap(setMetricValueToMap(existingRow?.monthsCost, monthRange.monthKey, Number(item.months.totalCost.toFixed(4)))),
      }
      : {
        accountId: existingRow.accountId,
        siteId: existingRow.siteId,
        todayRequest: 0,
        todaySuccess: 0,
        todayCost: 0,
        weekRequest: 0,
        weekSuccess: 0,
        weekCost: 0,
        monthRequest: 0,
        monthSuccess: 0,
        monthCost: 0,
        monthsRequest: stringifyMetricMap(setMetricValueToMap(existingRow?.monthsRequest, monthRange.monthKey, 0)),
        monthsSuccess: stringifyMetricMap(setMetricValueToMap(existingRow?.monthsSuccess, monthRange.monthKey, 0)),
        monthsCost: stringifyMetricMap(setMetricValueToMap(existingRow?.monthsCost, monthRange.monthKey, 0)),
      };

    if (existingRow) {
      await existingRow.update(payload);
      return;
    }

    await ProxyStatsSnapshot.create(payload);
  }));

    return {
      statDate,
      refreshedRowCount: rowEntries.length,
      weekKey: weekRange.weekKey,
      monthKey: monthRange.monthKey,
    };
  } finally {
    // 释放锁
    await cacheService.releaseLock(lockKey, lockIdentifier);
  }
};

const buildAccountSuccessRanking = async (aggregate, limit = 10) => {
  const metricsMap = aggregate.accounts || {};
  const accountIds = Object.keys(metricsMap).map((item) => toInteger(item)).filter((item) => item > 0);
  const accounts = await Account.findAll({
    where: { id: accountIds },
    attributes: ['id', 'name', 'siteId'],
    raw: true,
  });
  const siteIds = [...new Set(accounts.map((item) => item.siteId).filter(Boolean))];
  const sites = await Site.findAll({
    where: { id: siteIds },
    attributes: ['id', 'name'],
    raw: true,
  });
  const accountMap = {};
  const siteMap = {};
  accounts.forEach((item) => {
    accountMap[item.id] = item;
  });
  sites.forEach((item) => {
    siteMap[item.id] = item;
  });

  return Object.entries(metricsMap)
    .filter(([accountId]) => toInteger(accountId) > 0)
    .map(([accountId, metrics]) => ({
      accountId: toInteger(accountId),
      accountName: accountMap[toInteger(accountId)]?.name || '未知账号',
      siteName: accountMap[toInteger(accountId)]?.siteId
        ? (siteMap[accountMap[toInteger(accountId)].siteId]?.name || '未知站点')
        : '独立包月',
      totalRequests: toInteger(metrics.requestCount),
      successCount: toInteger(metrics.successCount),
      successRate: toInteger(metrics.requestCount) > 0
        ? ((toInteger(metrics.successCount) / toInteger(metrics.requestCount)) * 100).toFixed(2)
        : '0.00',
      totalCost: toFloat(metrics.totalCost),
    }))
    .sort((left, right) => right.successCount - left.successCount)
    .slice(0, limit);
};

const buildAccountFailRanking = async (aggregate, limit = 10) => {
  const metricsMap = aggregate.accounts || {};
  const accountIds = Object.keys(metricsMap).map((item) => toInteger(item)).filter((item) => item > 0);
  const accounts = await Account.findAll({
    where: { id: accountIds },
    attributes: ['id', 'name', 'siteId', 'failCount'],
    raw: true,
  });
  const accountMap = {};
  accounts.forEach((item) => {
    accountMap[item.id] = item;
  });

  return Object.entries(metricsMap)
    .filter(([accountId]) => toInteger(accountId) > 0)
    .map(([accountId, metrics]) => ({
      accountId: toInteger(accountId),
      accountName: accountMap[toInteger(accountId)]?.name || '未知账号',
      totalRequests: toInteger(metrics.requestCount),
      failCount: toInteger(metrics.failCount),
      currentFailCount: toInteger(accountMap[toInteger(accountId)]?.failCount),
    }))
    .sort((left, right) => right.failCount - left.failCount)
    .slice(0, limit);
};

const buildSiteDistribution = async (aggregate) => {
  const metricsMap = aggregate.sites || {};
  const siteIds = Object.keys(metricsMap).map((item) => toInteger(item)).filter((item) => item > 0);
  const sites = await Site.findAll({
    where: { id: siteIds },
    attributes: ['id', 'name'],
    raw: true,
  });
  const siteMap = {};
  sites.forEach((item) => {
    siteMap[item.id] = item;
  });

  return Object.entries(metricsMap)
    .map(([siteIdKey, metrics]) => {
      const siteId = toInteger(siteIdKey);
      const requestCount = toInteger(metrics.requestCount);
      const successCount = toInteger(metrics.successCount);
      return {
        siteId: siteId || null,
        siteName: siteId > 0 ? (siteMap[siteId]?.name || '未知站点') : '独立包月',
        totalRequests: requestCount,
        successCount,
        successRate: requestCount > 0 ? ((successCount / requestCount) * 100).toFixed(2) : '0.00',
        totalCost: toFloat(metrics.totalCost),
      };
    })
    .sort((left, right) => right.totalRequests - left.totalRequests);
};

const buildHourlyDistribution = (aggregate) => Array.from({ length: 24 }, (_, hour) => {
  const metrics = normalizeMetrics((aggregate.hours || {})[String(hour)] || buildEmptyMetrics());
  return {
    hour,
    label: `${padNumber(hour)}:00`,
    requests: metrics.requestCount,
    successCount: metrics.successCount,
    failCount: metrics.failCount,
    totalCost: metrics.totalCost,
  };
});

const buildRemarkRequestRanking = (aggregate, limit = 10) => Object.entries(aggregate.remarks || {})
  .map(([remark, metrics]) => ({
    remark,
    totalRequests: toInteger(metrics.requestCount),
    successCount: toInteger(metrics.successCount),
    failCount: toInteger(metrics.failCount),
  }))
  .sort((left, right) => right.totalRequests - left.totalRequests)
  .slice(0, limit);

const buildRemarkCostRanking = (aggregate, limit = 10) => Object.entries(aggregate.remarks || {})
  .map(([remark, metrics]) => ({
    remark,
    totalRequests: toInteger(metrics.requestCount),
    totalCost: toFloat(metrics.totalCost),
  }))
  .sort((left, right) => right.totalCost - left.totalCost)
  .slice(0, limit);

const buildSnapshotTotalsFromRows = (rows, requestField, successField, costField) => {
  const totals = rows.reduce(
    (result, row) => addMetrics(result, {
      requestCount: row?.[requestField],
      successCount: row?.[successField],
      totalCost: row?.[costField],
    }),
    buildEmptyMetrics(),
  );
  totals.failCount = Math.max(totals.requestCount - totals.successCount, 0);
  return totals;
};

const buildSnapshotMonthTotalsFromRows = (rows, monthKey) => {
  const totals = rows.reduce(
    (result, row) => addMetrics(result, buildMetricsFromMonthsMap(row, 'monthsRequest', 'monthsSuccess', 'monthsCost', monthKey)),
    buildEmptyMetrics(),
  );
  totals.failCount = Math.max(totals.requestCount - totals.successCount, 0);
  return totals;
};

const getSnapshotCompareData = async (statDate, compareMonth) => {
  const dayStart = getChinaDayStart(statDate);
  const dayEnd = getChinaDayEnd(statDate);
  const weekRange = getWeekRangeByDate(statDate);
  const monthRange = getMonthRangeByDate(statDate);
  const selectedMonthKey = isValidMonthString(compareMonth) ? compareMonth : monthRange.monthKey;
  const selectedMonthRange = getMonthRangeByMonthKey(selectedMonthKey);

  const [snapshotRows, dayAggregate, weekAggregate, monthAggregate, selectedMonthAggregate] = await Promise.all([
    ProxyStatsSnapshot.findAll({
      where: snapshotCompareWhere,
      raw: true,
    }),
    logStatsService.getRawAggregateByDateRange(dayStart, dayEnd),
    logStatsService.getRawAggregateByDateRange(weekRange.startDate, weekRange.endDate),
    logStatsService.getRawAggregateByDateRange(monthRange.startDate, monthRange.endDate),
    logStatsService.getRawAggregateByDateRange(selectedMonthRange.startDate, selectedMonthRange.endDate),
  ]);

  const latestUpdatedAt = snapshotRows.reduce((latest, row) => {
    const current = row?.updatedAt || row?.updated_at;
    if (!current) {
      return latest;
    }

    if (!latest) {
      return current;
    }

    return new Date(current) > new Date(latest) ? current : latest;
  }, null);

  return {
    updatedAt: formatChinaDateTime(latestUpdatedAt),
    ranges: {
      day: statDate,
      weekStart: getChinaDateStr(weekRange.startDate),
      weekEnd: getChinaDateStr(weekRange.endDate),
      monthKey: monthRange.monthKey,
      selectedMonthKey,
    },
    items: [
      buildCompareItem(
        `当天 (${statDate})`,
        buildSnapshotTotalsFromRows(snapshotRows, 'todayRequest', 'todaySuccess', 'todayCost'),
        dayAggregate.summary,
        'today',
      ),
      buildCompareItem(
        `本周 (${getChinaDateStr(weekRange.startDate)} ~ ${getChinaDateStr(weekRange.endDate)})`,
        buildSnapshotTotalsFromRows(snapshotRows, 'weekRequest', 'weekSuccess', 'weekCost'),
        weekAggregate.summary,
        'week',
      ),
      buildCompareItem(
        `本月 (${monthRange.monthKey})`,
        buildSnapshotTotalsFromRows(snapshotRows, 'monthRequest', 'monthSuccess', 'monthCost'),
        monthAggregate.summary,
        'month',
      ),
      buildCompareItem(
        `月份 ${selectedMonthKey}`,
        buildSnapshotMonthTotalsFromRows(snapshotRows, selectedMonthKey),
        selectedMonthAggregate.summary,
        'months',
      ),
    ],
  };
};

const getSnapshotDetail = async (statDate, compareMonth, statDateTime) => {
  const {
    resolvedStatDate,
    resolvedCompareMonth,
  } = resolveSnapshotTarget(statDate, statDateTime, compareMonth);

  const today = getChinaDateStr(new Date());
  const isToday = resolvedStatDate === today;

  const dayStart = getChinaDayStart(resolvedStatDate);
  const dayEnd = getChinaDayEnd(resolvedStatDate);
  const weekRange = getWeekRangeByDate(resolvedStatDate);
  const monthRange = getMonthRangeByDate(resolvedStatDate);

  // 使用新方案获取实时数据
  let dayAggregate, weekAggregate, monthAggregate;

  if (isToday) {
    // 今天的数据：从 Redis 缓存 + proxy_logs 实时查询
    const todayStats = await statsNewService.getTodayStats(today);

    // 获取本周已过天数的 daily_stats
    const weekDailyStats = await getWeekDailyStats(resolvedStatDate);
    const monthDailyStats = await getMonthDailyStats(resolvedStatDate);

    dayAggregate = {
      summary: todayStats.summary,
      hours: todayStats.hours,
      accounts: todayStats.accounts,
      sites: todayStats.sites,
      remarks: todayStats.remarks,
    };

    weekAggregate = {
      summary: statsNewService.mergeStats(weekDailyStats, todayStats.summary),
      hours: todayStats.hours,
      accounts: {},
      sites: {},
      remarks: {},
    };

    monthAggregate = {
      summary: statsNewService.mergeStats(monthDailyStats, todayStats.summary),
      hours: todayStats.hours,
      accounts: {},
      sites: {},
      remarks: {},
    };
  } else {
    // 非今天的数据：从 proxy_logs 直接查询（保留原有逻辑）
    [dayAggregate, weekAggregate, monthAggregate] = await Promise.all([
      logStatsService.getRawAggregateByDateRange(dayStart, dayEnd),
      logStatsService.getRawAggregateByDateRange(weekRange.startDate, weekRange.endDate),
      logStatsService.getRawAggregateByDateRange(monthRange.startDate, monthRange.endDate),
    ]);
  }

  const compareData = await getSnapshotCompareData(resolvedStatDate, resolvedCompareMonth);

  const [successRanking, failRanking, siteDistribution] = await Promise.all([
    buildAccountSuccessRanking(dayAggregate, 10),
    buildAccountFailRanking(dayAggregate, 10),
    buildSiteDistribution(dayAggregate),
  ]);

  return {
    statDate: resolvedStatDate,
    compareMonth: resolvedCompareMonth,
    ranges: {
      weekStartDate: getChinaDateStr(weekRange.startDate),
      weekEndDate: getChinaDateStr(weekRange.endDate),
      monthKey: monthRange.monthKey,
    },
    overview: {
      day: buildSummaryMetrics(dayAggregate.summary),
      week: buildSummaryMetrics(weekAggregate.summary),
      month: buildSummaryMetrics(monthAggregate.summary),
    },
    successRanking,
    failRanking,
    siteDistribution,
    hourlyDistribution: buildHourlyDistribution(dayAggregate),
    remarkRequestRanking: buildRemarkRequestRanking(dayAggregate, 10),
    remarkCostRanking: buildRemarkCostRanking(dayAggregate, 10),
    compare: compareData,
    isRealtime: isToday,
  };
};

/**
 * 获取本周已过天数的 daily_stats（不含今天）
 */
const getWeekDailyStats = async (statDate) => {
  const weekStart = getWeekRangeByDate(statDate).startDate;
  const today = getChinaDateStr(new Date());
  const yesterday = getChinaDateStr(addDays(new Date(), -1));

  // 如果本周开始日期在今天之后，返回空
  if (weekStart > yesterday) {
    return statsNewService.buildEmptyMetrics();
  }

  // 从 daily_stats 查询本周开始到昨天的数据
  const result = await statsNewService.queryDailyStats(weekStart, yesterday, 'summary');
  return result;
};

/**
 * 获取本月已过天数的 daily_stats（不含今天）
 */
const getMonthDailyStats = async (statDate) => {
  const monthStart = getMonthRangeByDate(statDate).startDate;
  const today = getChinaDateStr(new Date());
  const yesterday = getChinaDateStr(addDays(new Date(), -1));

  // 如果本月开始日期在今天之后，返回空
  if (monthStart > yesterday) {
    return statsNewService.buildEmptyMetrics();
  }

  // 从 daily_stats 查询本月开始到昨天的数据
  const result = await statsNewService.queryDailyStats(monthStart, yesterday, 'summary');
  return result;
};

module.exports = {
  getAvailableOptions,
  getSnapshotDetail,
  refreshSnapshotByDate,
};
