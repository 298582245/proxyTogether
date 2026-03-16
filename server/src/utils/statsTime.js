const CHINA_TIMEZONE_OFFSET = 8 * 60 * 60 * 1000;
const BUCKET_INTERVAL_MINUTES = 10;

const padNumber = (value) => String(value).padStart(2, '0');

const shiftToChinaTime = (date) => new Date(date.getTime() + CHINA_TIMEZONE_OFFSET);

const getChinaDateStr = (date) => {
  const chinaDate = shiftToChinaTime(date);
  const year = chinaDate.getUTCFullYear();
  const month = padNumber(chinaDate.getUTCMonth() + 1);
  const day = padNumber(chinaDate.getUTCDate());
  return `${year}-${month}-${day}`;
};

const getChinaHour = (date) => shiftToChinaTime(date).getUTCHours();

const getChinaDayStart = (dateStr) => new Date(`${dateStr}T00:00:00.000+08:00`);

const getChinaDayEnd = (dateStr) => new Date(`${dateStr}T23:59:59.999+08:00`);

const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60 * 1000);

const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const getBucketStart = (date) => {
  const chinaDate = shiftToChinaTime(date);
  const minute = Math.floor(chinaDate.getUTCMinutes() / BUCKET_INTERVAL_MINUTES) * BUCKET_INTERVAL_MINUTES;
  const bucketUtcTime = Date.UTC(
    chinaDate.getUTCFullYear(),
    chinaDate.getUTCMonth(),
    chinaDate.getUTCDate(),
    chinaDate.getUTCHours(),
    minute,
    0,
    0,
  ) - CHINA_TIMEZONE_OFFSET;

  return new Date(bucketUtcTime);
};

const getBucketLabel = (date) => {
  const bucketStart = getBucketStart(date);
  const chinaDate = shiftToChinaTime(bucketStart);
  return `${padNumber(chinaDate.getUTCHours())}${padNumber(chinaDate.getUTCMinutes())}`;
};

const formatBucketId = (date) => {
  const bucketStart = getBucketStart(date);
  const chinaDate = shiftToChinaTime(bucketStart);
  const dateStr = getChinaDateStr(bucketStart);
  const hour = padNumber(chinaDate.getUTCHours());
  const minute = padNumber(chinaDate.getUTCMinutes());
  return `${dateStr} ${hour}:${minute}:00`;
};

const parseBucketId = (bucketId) => new Date(bucketId.replace(' ', 'T') + '+08:00');

const getTimeRange = (type) => {
  const now = new Date();
  const todayStr = getChinaDateStr(now);
  let startDate = null;
  let endDate = null;

  switch (type) {
    case 'today':
      startDate = getChinaDayStart(todayStr);
      endDate = getChinaDayEnd(todayStr);
      break;
    case 'week': {
      const chinaDate = shiftToChinaTime(now);
      const weekStart = new Date(chinaDate);
      weekStart.setUTCDate(weekStart.getUTCDate() - 6);
      startDate = getChinaDayStart(weekStart.toISOString().split('T')[0]);
      endDate = getChinaDayEnd(todayStr);
      break;
    }
    case 'month': {
      const chinaDate = shiftToChinaTime(now);
      const monthStart = new Date(chinaDate);
      monthStart.setUTCDate(monthStart.getUTCDate() - 29);
      startDate = getChinaDayStart(monthStart.toISOString().split('T')[0]);
      endDate = getChinaDayEnd(todayStr);
      break;
    }
    case 'total':
      startDate = null;
      endDate = null;
      break;
    default:
      startDate = getChinaDayStart(todayStr);
      endDate = getChinaDayEnd(todayStr);
      break;
  }

  return { startDate, endDate };
};

const isDateRangeIncludesToday = (startDate, endDate) => {
  const todayStr = getChinaDateStr(new Date());
  const todayStart = getChinaDayStart(todayStr);
  const todayEnd = getChinaDayEnd(todayStr);

  if (startDate && startDate > todayEnd) {
    return false;
  }

  if (endDate && endDate < todayStart) {
    return false;
  }

  return true;
};

module.exports = {
  BUCKET_INTERVAL_MINUTES,
  CHINA_TIMEZONE_OFFSET,
  addDays,
  addMinutes,
  formatBucketId,
  getBucketLabel,
  getBucketStart,
  getChinaDateStr,
  getChinaDayEnd,
  getChinaDayStart,
  getChinaHour,
  getTimeRange,
  isDateRangeIncludesToday,
  parseBucketId,
};
