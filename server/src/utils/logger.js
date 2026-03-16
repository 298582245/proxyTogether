const formatTime = () => {
  const now = new Date();
  const chinaDate = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  const year = chinaDate.getUTCFullYear();
  const month = String(chinaDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(chinaDate.getUTCDate()).padStart(2, '0');
  const hour = String(chinaDate.getUTCHours()).padStart(2, '0');
  const minute = String(chinaDate.getUTCMinutes()).padStart(2, '0');
  const second = String(chinaDate.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
};

const logger = {
  info: (...args) => {
    console.log(`[${formatTime()}] [INFO]`, ...args);
  },
  error: (...args) => {
    console.error(`[${formatTime()}] [ERROR]`, ...args);
  },
  warn: (...args) => {
    console.warn(`[${formatTime()}] [WARN]`, ...args);
  },
  debug: (...args) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${formatTime()}] [DEBUG]`, ...args);
    }
  },
};

module.exports = logger;
