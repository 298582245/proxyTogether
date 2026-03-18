/**
 * 时间工具函数
 *
 * 重要说明：数据库配置了 timezone: '+08:00'，所以 created_at 存储的已经是本地时间（中国时区）
 * 所有查询都应该直接使用日期字符串，避免 Date 对象的时区转换问题
 */

const BUCKET_INTERVAL_MINUTES = 10;

const padNumber = (value) => String(value).padStart(2, '0');

/**
 * 获取本地日期字符串
 */
const getChinaDateStr = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = padNumber(d.getMonth() + 1);
  const day = padNumber(d.getDate());
  return `${year}-${month}-${day}`;
};

/**
 * 获取本地小时
 */
const getChinaHour = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  return d.getHours();
};

/**
 * 获取日期的开始时间字符串
 * @param {string} dateStr - 日期字符串 YYYY-MM-DD
 * @returns {string} - 日期时间字符串 YYYY-MM-DD 00:00:00
 */
const getChinaDayStartStr = (dateStr) => `${dateStr} 00:00:00`;

/**
 * 获取日期的结束时间字符串
 * @param {string} dateStr - 日期字符串 YYYY-MM-DD
 * @returns {string} - 日期时间字符串 YYYY-MM-DD 23:59:59
 */
const getChinaDayEndStr = (dateStr) => `${dateStr} 23:59:59`;

/**
 * 获取日期的开始时间（返回 Date 对象，向后兼容旧代码）
 * 注意：这个 Date 对象代表的是本地时间的 00:00:00
 * @param {string} dateStr - 日期字符串 YYYY-MM-DD
 * @returns {Date} - Date 对象
 */
const getChinaDayStart = (dateStr) => {
  // 直接解析本地时间字符串，不涉及 UTC 转换
  const parts = dateStr.split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
};

/**
 * 获取日期的结束时间（返回 Date 对象，向后兼容旧代码）
 * @param {string} dateStr - 日期字符串 YYYY-MM-DD
 * @returns {Date} - Date 对象
 */
const getChinaDayEnd = (dateStr) => {
  const parts = dateStr.split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999);
};

const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60 * 1000);

const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

/**
 * 获取时间桶的起始时间
 */
const getBucketStart = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  const minute = Math.floor(d.getMinutes() / BUCKET_INTERVAL_MINUTES) * BUCKET_INTERVAL_MINUTES;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), minute, 0, 0);
};

/**
 * 获取时间桶标签
 */
const getBucketLabel = (date) => {
  const bucketStart = getBucketStart(date);
  return `${padNumber(bucketStart.getHours())}${padNumber(bucketStart.getMinutes())}`;
};

/**
 * 格式化时间桶 ID
 */
const formatBucketId = (date) => {
  const bucketStart = getBucketStart(date);
  const dateStr = getChinaDateStr(bucketStart);
  const hour = padNumber(bucketStart.getHours());
  const minute = padNumber(bucketStart.getMinutes());
  return `${dateStr} ${hour}:${minute}:00`;
};

/**
 * 解析时间桶 ID
 */
const parseBucketId = (bucketId) => {
  // 格式: "YYYY-MM-DD HH:MM:SS"
  const parts = bucketId.split(' ');
  const dateParts = parts[0].split('-').map(Number);
  const timeParts = parts[1].split(':').map(Number);
  return new Date(dateParts[0], dateParts[1] - 1, dateParts[2], timeParts[0], timeParts[1], timeParts[2]);
};

/**
 * 获取时间范围
 */
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
      // 本周一
      const dayOfWeek = now.getDay(); // 0=周日, 1=周一, ..., 6=周六
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const weekStartDate = new Date(now);
      weekStartDate.setDate(now.getDate() - diffToMonday);
      const weekStartStr = getChinaDateStr(weekStartDate);
      startDate = getChinaDayStart(weekStartStr);
      endDate = getChinaDayEnd(todayStr);
      break;
    }
    case 'month': {
      // 本月1号
      const monthStartStr = todayStr.slice(0, 7) + '-01';
      startDate = getChinaDayStart(monthStartStr);
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

/**
 * 判断日期范围是否包含今天
 */
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

// 兼容旧代码的常量（已不使用，但保留避免报错）
const CHINA_TIMEZONE_OFFSET = 8 * 60 * 60 * 1000;

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
  getChinaDayEndStr,
  getChinaDayStartStr,
  getChinaHour,
  getTimeRange,
  isDateRangeIncludesToday,
  parseBucketId,
};
