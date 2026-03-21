const BUCKET_INTERVAL_MINUTES = 10;
const CHINA_TIMEZONE_OFFSET = 8 * 60 * 60 * 1000;

const padNumber = (value) => String(value).padStart(2, '0');

const parseChinaDate = (dateStr) => {
  const [year, month, day] = String(dateStr).split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
};

const formatChinaDateTime = (date = new Date()) => {
  const localDate = date instanceof Date ? date : new Date(date);
  return `${localDate.getFullYear()}-${padNumber(localDate.getMonth() + 1)}-${padNumber(localDate.getDate())} ${padNumber(localDate.getHours())}:${padNumber(localDate.getMinutes())}:${padNumber(localDate.getSeconds())}`;
};

const getChinaDateStr = (date) => {
  const localDate = date instanceof Date ? date : new Date(date);
  return `${localDate.getFullYear()}-${padNumber(localDate.getMonth() + 1)}-${padNumber(localDate.getDate())}`;
};

const getChinaHour = (date) => {
  const localDate = date instanceof Date ? date : new Date(date);
  return localDate.getHours();
};

const getChinaDayStartStr = (dateStr) => `${dateStr} 00:00:00`;
const getChinaDayEndStr = (dateStr) => `${dateStr} 23:59:59`;

const getChinaDayStart = (dateStr) => parseChinaDate(dateStr);

const getChinaDayEnd = (dateStr) => {
  const endDate = parseChinaDate(dateStr);
  endDate.setHours(23, 59, 59, 999);
  return endDate;
};

const addMinutes = (date, minutes) => {
  const nextDate = new Date(date);
  nextDate.setMinutes(nextDate.getMinutes() + minutes);
  return nextDate;
};

const addDays = (date, days) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

const getBucketStart = (date) => {
  const localDate = date instanceof Date ? new Date(date) : new Date(date);
  const minute = Math.floor(localDate.getMinutes() / BUCKET_INTERVAL_MINUTES) * BUCKET_INTERVAL_MINUTES;
  localDate.setMinutes(minute, 0, 0);
  return localDate;
};

const getBucketLabel = (date) => {
  const bucketStart = getBucketStart(date);
  return `${padNumber(bucketStart.getHours())}${padNumber(bucketStart.getMinutes())}`;
};

const formatBucketId = (date) => {
  const bucketStart = getBucketStart(date);
  return `${getChinaDateStr(bucketStart)} ${padNumber(bucketStart.getHours())}:${padNumber(bucketStart.getMinutes())}:00`;
};

const parseBucketId = (bucketId) => {
  const [datePart, timePart] = String(bucketId).split(' ');
  const [hours, minutes, seconds] = String(timePart).split(':').map(Number);
  const bucketDate = parseChinaDate(datePart);
  bucketDate.setHours(hours, minutes, seconds || 0, 0);
  return bucketDate;
};

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
      const weekStartDate = new Date(now);
      const dayOfWeek = weekStartDate.getDay();
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      weekStartDate.setDate(weekStartDate.getDate() - diffToMonday);
      startDate = getChinaDayStart(getChinaDateStr(weekStartDate));
      endDate = getChinaDayEnd(todayStr);
      break;
    }
    case 'month': {
      startDate = getChinaDayStart(`${todayStr.slice(0, 7)}-01`);
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
  formatChinaDateTime,
  getBucketLabel,
  getBucketStart,
  getChinaDateStr,
  getChinaDayEnd,
  getChinaDayEndStr,
  getChinaDayStart,
  getChinaDayStartStr,
  getChinaHour,
  getTimeRange,
  isDateRangeIncludesToday,
  parseBucketId,
  parseChinaDate,
};
