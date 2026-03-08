const axios = require('axios');

// 创建axios实例
const httpClient = axios.create({
  timeout: 30000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  },
});

// 请求拦截器
httpClient.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
httpClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * GET请求
 * @param {string} url - 请求URL
 * @param {object} params - 查询参数
 * @param {object} options - 其他选项
 */
const get = async (url, params = {}, options = {}) => {
  const response = await httpClient.get(url, {
    params,
    ...options,
  });
  return response.data;
};

/**
 * POST请求
 * @param {string} url - 请求URL
 * @param {object} data - 请求体数据
 * @param {object} options - 其他选项
 */
const post = async (url, data = {}, options = {}) => {
  const response = await httpClient.post(url, data, options);
  return response.data;
};

/**
 * 从URL中提取参数
 * @param {string} url - URL字符串
 * @returns {object} 参数对象
 */
const extractUrlParams = (url) => {
  const params = {};
  const urlObj = new URL(url);
  urlObj.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return params;
};

/**
 * 构建带参数的URL
 * @param {string} baseUrl - 基础URL
 * @param {object} params - 参数对象
 * @returns {string} 完整URL
 */
const buildUrl = (baseUrl, params = {}) => {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, value);
    }
  });
  return url.toString();
};

module.exports = {
  httpClient,
  get,
  post,
  extractUrlParams,
  buildUrl,
};
