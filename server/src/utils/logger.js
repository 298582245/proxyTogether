const formatTime = () => {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
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
