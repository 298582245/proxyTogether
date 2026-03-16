const { QueryTypes, Op } = require('sequelize');
const { sequelize } = require('../config/database');
const Account = require('../models/Account');
const Site = require('../models/Site');
const ProxyStatsSnapshot = require('../models/ProxyStatsSnapshot');
const logStatsService = require('./logStatsService');
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

const buildMetricsFromNumericFields = (row, requestField, successField, costField) => {
  const requestCount = toInteger(row?.[requestField]);
  const successCount = toInteger(row?.[successField]);
  const totalCost = toFloat(row?.[costField]);

  return {
    requestCount,
    successCount,
    failCount: Math.max(requestCount - successCount, 0),
    totalCost,
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

  return {
    availableDates: dateRows.map((item) => item.statDate).filter(Boolean),
    availableMonths: monthRows.map((item) => item.monthKey).filter(Boolean),
    currentDateTime: formatChinaDateTime(new Date()),
    latestDateTime: formatChinaDateTime(latestDateTime),
  };
};

const resolveSnapshotTarget = (statDate, statDateTime, compareMonth) => {
  const targetDateTime = parseSnapshotDateTime(statDateTime)
    || (isValidDateString(statDate) ? getChinaDayStart(statDate) : null);

  if (!targetDateTime) {
    throw new Error('统计日期或时间点格式不正确');
  }

  const resolvedStatDate = getChinaDateStr(targetDateTime);
  const resolvedCompareMonth = isValidMonthString(compareMonth) ? compareMonth : getMonthKey(targetDateTime);

  return {
    targetDateTime,
    resolvedStatDate,
    resolvedCompareMonth,
  };
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
  const rowMap = {
    [buildRowKey(0, 0)]: {
      accountId: 0,
      siteId: 0,
      today: normalizeMetrics(dayAggregate.summary),
      week: normalizeMetrics(weekAggregate.summary),
      month: normalizeMetrics(monthAggregate.summary),
      months: normalizeMetrics(monthAggregate.summary),
    },
  };

  const siteIds = new Set([
    ...Object.keys(dayAggregate.sites || {}),
    ...Object.keys(weekAggregate.sites || {}),
    ...Object.keys(monthAggregate.sites || {}),
  ]);

  siteIds.forEach((siteIdKey) => {
    const siteId = toInteger(siteIdKey);
    rowMap[buildRowKey(0, siteId)] = {
      accountId: 0,
      siteId,
      today: getAggregateMetrics(dayAggregate.sites, siteId),
      week: getAggregateMetrics(weekAggregate.sites, siteId),
      month: getAggregateMetrics(monthAggregate.sites, siteId),
      months: getAggregateMetrics(monthAggregate.sites, siteId),
    };
  });

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

  const dayStart = getChinaDayStart(statDate);
  const dayEnd = getChinaDayEnd(statDate);
  const weekRange = getWeekRangeByDate(statDate);
  const monthRange = getMonthRangeByDate(statDate);

  const [dayAggregate, weekAggregate, monthAggregate] = await Promise.all([
    logStatsService.getRawAggregateByDateRange(dayStart, dayEnd),
    logStatsService.getRawAggregateByDateRange(weekRange.startDate, weekRange.endDate),
    logStatsService.getRawAggregateByDateRange(monthRange.startDate, monthRange.endDate),
  ]);

  const rowEntries = await buildSnapshotRowEntries(dayAggregate, weekAggregate, monthAggregate);
  const rowConditions = rowEntries.map((item) => ({ accountId: item.accountId, siteId: item.siteId }));
  const existingRows = rowConditions.length
    ? await ProxyStatsSnapshot.findAll({ where: { [Op.or]: rowConditions } })
    : [];
  const existingRowMap = {};

  existingRows.forEach((item) => {
    existingRowMap[buildRowKey(item.accountId, item.siteId)] = item;
  });

  await Promise.all(rowEntries.map(async (item) => {
    const rowKey = buildRowKey(item.accountId, item.siteId);
    const existingRow = existingRowMap[rowKey];
    const payload = {
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

const getSnapshotCompareData = async (statDate, compareMonth) => {
  const dayStart = getChinaDayStart(statDate);
  const dayEnd = getChinaDayEnd(statDate);
  const weekRange = getWeekRangeByDate(statDate);
  const monthRange = getMonthRangeByDate(statDate);
  const selectedMonthKey = isValidMonthString(compareMonth) ? compareMonth : monthRange.monthKey;
  const selectedMonthRange = getMonthRangeByMonthKey(selectedMonthKey);

  const [snapshotRow, dayAggregate, weekAggregate, monthAggregate, selectedMonthAggregate] = await Promise.all([
    ProxyStatsSnapshot.findOne({ where: { accountId: 0, siteId: 0 }, raw: true }),
    logStatsService.getRawAggregateByDateRange(dayStart, dayEnd),
    logStatsService.getRawAggregateByDateRange(weekRange.startDate, weekRange.endDate),
    logStatsService.getRawAggregateByDateRange(monthRange.startDate, monthRange.endDate),
    logStatsService.getRawAggregateByDateRange(selectedMonthRange.startDate, selectedMonthRange.endDate),
  ]);

  return {
    updatedAt: formatChinaDateTime(snapshotRow?.updatedAt || snapshotRow?.updated_at || null),
    items: [
      buildCompareItem(
        '当天',
        buildMetricsFromNumericFields(snapshotRow, 'todayRequest', 'todaySuccess', 'todayCost'),
        dayAggregate.summary,
        'today',
      ),
      buildCompareItem(
        '本周',
        buildMetricsFromNumericFields(snapshotRow, 'weekRequest', 'weekSuccess', 'weekCost'),
        weekAggregate.summary,
        'week',
      ),
      buildCompareItem(
        '本月',
        buildMetricsFromNumericFields(snapshotRow, 'monthRequest', 'monthSuccess', 'monthCost'),
        monthAggregate.summary,
        'month',
      ),
      buildCompareItem(
        `月份 ${selectedMonthKey}`,
        buildMetricsFromMonthsMap(snapshotRow, 'monthsRequest', 'monthsSuccess', 'monthsCost', selectedMonthKey),
        selectedMonthAggregate.summary,
        'months',
      ),
    ],
  };
};

const getSnapshotDetail = async (statDate, compareMonth, statDateTime) => {
  const {
    targetDateTime,
    resolvedStatDate,
    resolvedCompareMonth,
  } = resolveSnapshotTarget(statDate, statDateTime, compareMonth);

  const dayStart = getChinaDayStart(resolvedStatDate);
  const dayEnd = getChinaDayEnd(resolvedStatDate);
  const weekRange = getWeekRangeByDate(resolvedStatDate);
  const monthRange = getMonthRangeByDate(resolvedStatDate);
  const selectedMonthKey = resolvedCompareMonth;

  const [dayAggregate, weekAggregate, monthAggregate, compareData] = await Promise.all([
    logStatsService.getRawAggregateByDateRange(dayStart, dayEnd),
    logStatsService.getRawAggregateByDateRange(weekRange.startDate, weekRange.endDate),
    logStatsService.getRawAggregateByDateRange(monthRange.startDate, monthRange.endDate),
    getSnapshotCompareData(resolvedStatDate, selectedMonthKey),
  ]);

  const [successRanking, failRanking, siteDistribution] = await Promise.all([
    buildAccountSuccessRanking(dayAggregate, 10),
    buildAccountFailRanking(dayAggregate, 10),
    buildSiteDistribution(dayAggregate),
  ]);

  return {
    statDate: resolvedStatDate,
    statDateTime: formatChinaDateTime(targetDateTime),
    compareMonth: selectedMonthKey,
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
  };
};

module.exports = {
  getAvailableOptions,
  getSnapshotDetail,
  refreshSnapshotByDate,
};
