const crypto = require('crypto');
const http = require('http');
const net = require('net');
const config = require('../config');
const proxyService = require('./proxyService');
const logger = require('../utils/logger');
const { parseProxyEndpoint, formatProxyEndpoint } = require('../utils/proxyEndpoint');

const PROXY_REALM = 'proxyTogether';
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);
const proxyCache = new Map();
let proxyCacheSequence = 0;

const createRequestId = () => {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2, 12)}`;
};

const isEnabled = () => Boolean(config.forwardProxy.enabled);

const hasCredentials = () => Boolean(config.forwardProxy.username && config.forwardProxy.password);

const normalizeClientIp = (ip) => {
  if (!ip) {
    return 'unknown';
  }

  if (ip === '::1') {
    return '127.0.0.1';
  }

  if (ip.startsWith('::ffff:')) {
    return ip.substring(7);
  }

  return ip;
};

const getClientIp = (req) => normalizeClientIp(
  req.socket?.remoteAddress || req.connection?.remoteAddress,
);

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const parseBasicAuth = (headers) => {
  const authHeader = headers['proxy-authorization'];
  const authMatch = typeof authHeader === 'string' ? authHeader.match(/^basic\s+(.+)$/i) : null;
  if (!authMatch) {
    return null;
  }

  try {
    const decoded = Buffer.from(authMatch[1], 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex < 0) {
      return null;
    }

    return {
      username: decoded.substring(0, separatorIndex),
      password: decoded.substring(separatorIndex + 1),
    };
  } catch {
    return null;
  }
};

const isAuthorized = (headers) => {
  if (!hasCredentials()) {
    return false;
  }

  const credentials = parseBasicAuth(headers);
  if (!credentials) {
    return false;
  }

  return safeEqual(credentials.username, config.forwardProxy.username) &&
    safeEqual(credentials.password, config.forwardProxy.password);
};

const sendHttpError = (res, statusCode, message, headers = {}) => {
  if (res.headersSent) {
    res.destroy();
    return;
  }

  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    ...headers,
  });
  res.end(message);
};

const sendProxyAuthRequired = (res) => {
  sendHttpError(res, 407, 'Proxy Authentication Required', {
    'Proxy-Authenticate': `Basic realm="${PROXY_REALM}"`,
  });
};

const writeSocketResponse = (socket, statusCode, statusMessage, headers = {}, body = '') => {
  if (socket.destroyed) {
    return;
  }

  const responseHeaders = {
    Connection: 'close',
    'Content-Length': Buffer.byteLength(body),
    ...headers,
  };
  const headerLines = Object.entries(responseHeaders).map(([key, value]) => `${key}: ${value}`);
  const response = `HTTP/1.1 ${statusCode} ${statusMessage}\r\n${headerLines.join('\r\n')}\r\n\r\n${body}`;
  socket.write(response, () => socket.destroy());
};

const writeSocketProxyAuthRequired = (socket) => {
  writeSocketResponse(
    socket,
    407,
    'Proxy Authentication Required',
    { 'Proxy-Authenticate': `Basic realm="${PROXY_REALM}"` },
    'Proxy Authentication Required'
  );
};

const isAbsoluteProxyRequest = (req) => /^https?:\/\//i.test(req.url || '');

const cleanHeaders = (headers) => {
  const extraHopHeaders = String(headers.connection || '')
    .split(',')
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);
  const blockedHeaders = new Set([...HOP_BY_HOP_HEADERS, ...extraHopHeaders]);
  const cleanedHeaders = {};

  Object.entries(headers).forEach(([key, value]) => {
    if (!blockedHeaders.has(key.toLowerCase())) {
      cleanedHeaders[key] = value;
    }
  });
  return cleanedHeaders;
};

const buildUpstreamProxyAuthHeader = (proxyEndpoint) => {
  if (!proxyEndpoint.auth) {
    return null;
  }

  const token = Buffer.from(`${proxyEndpoint.auth.username}:${proxyEndpoint.auth.password}`).toString('base64');
  return `Basic ${token}`;
};

const getProxyCacheTtlMs = () => {
  if (config.forwardProxy.cacheTtlSeconds > 0) {
    return config.forwardProxy.cacheTtlSeconds * 1000;
  }

  return Math.max(30, (config.forwardProxy.duration * 60) - 15) * 1000;
};

const getCachedProxy = (triedProxyKeys = []) => {
  if (!config.forwardProxy.cacheEnabled) {
    return null;
  }

  const now = Date.now();
  for (const [key, item] of proxyCache.entries()) {
    if (item.expiresAt <= now) {
      proxyCache.delete(key);
    }
  }

  const skippedKeys = new Set(triedProxyKeys);
  const availableItems = [...proxyCache.values()].filter((item) => !skippedKeys.has(item.key));
  if (availableItems.length === 0) {
    return null;
  }

  availableItems.sort((a, b) => a.lastUsedAt - b.lastUsedAt);
  const item = availableItems[0];
  item.lastUsedAt = now;
  logger.info(`正向代理复用上游: proxy=${item.key}`);
  return item.proxy;
};

const cacheProxy = (proxy) => {
  if (!config.forwardProxy.cacheEnabled) {
    return;
  }

  const key = formatProxyEndpoint(proxy.endpoint);
  const now = Date.now();
  proxyCacheSequence += 1;
  proxyCache.set(key, {
    key,
    proxy,
    createdAt: now,
    lastUsedAt: now,
    expiresAt: now + getProxyCacheTtlMs(),
    sequence: proxyCacheSequence,
  });
};

const invalidateCachedProxy = (proxy, reason) => {
  if (!proxy || !proxy.endpoint) {
    return;
  }

  const key = formatProxyEndpoint(proxy.endpoint);
  if (proxyCache.delete(key)) {
    logger.warn(`正向代理上游已失效: proxy=${key}, reason=${reason}`);
  }
};

const getUpstreamProxy = async (clientIp, targetLabel, triedAccountIds = [], triedProxyKeys = []) => {
  const cachedProxy = getCachedProxy(triedProxyKeys);
  if (cachedProxy) {
    return cachedProxy;
  }

  const requestId = createRequestId();
  const result = await proxyService.getProxy(
    config.forwardProxy.duration,
    config.forwardProxy.format,
    clientIp,
    triedAccountIds,
    config.forwardProxy.remark,
    requestId
  );

  if (!result || !result.success || !result.data) {
    throw new Error(result && result.message ? result.message : '无法获取上游代理');
  }

  const proxyEndpoint = parseProxyEndpoint(result.data.response);
  if (!proxyEndpoint) {
    throw new Error('未从提取响应中解析到 IP:端口');
  }

  logger.info(`正向代理上游已选择: target=${targetLabel}, proxy=${formatProxyEndpoint(proxyEndpoint)}`);
  const proxy = {
    endpoint: proxyEndpoint,
    accountId: result.data.account ? result.data.account.id : null,
  };
  cacheProxy(proxy);
  return proxy;
};

const formatAuthorityHost = (hostname) => hostname.includes(':') ? `[${hostname}]` : hostname;

const createTargetFromUrl = (targetUrl) => {
  const port = Number.parseInt(targetUrl.port || '80', 10);
  return {
    host: targetUrl.hostname,
    port,
    authority: `${formatAuthorityHost(targetUrl.hostname)}:${port}`,
  };
};

const buildConnectRequest = (target, upstreamProxy) => {
  const headers = [
    `CONNECT ${target.authority} HTTP/1.1`,
    `Host: ${target.authority}`,
    'Proxy-Connection: Keep-Alive',
  ];
  const upstreamAuthHeader = buildUpstreamProxyAuthHeader(upstreamProxy);
  if (upstreamAuthHeader) {
    headers.push(`Proxy-Authorization: ${upstreamAuthHeader}`);
  }

  return `${headers.join('\r\n')}\r\n\r\n`;
};

const connectThroughUpstreamProxy = (target, upstreamProxy) => new Promise((resolve, reject) => {
  let responseBuffer = Buffer.alloc(0);
  let settled = false;
  const upstreamSocket = net.connect(upstreamProxy.port, upstreamProxy.host);

  const rejectTunnel = (error) => {
    if (settled) {
      return;
    }

    settled = true;
    upstreamSocket.destroy();
    reject(error);
  };

  const onData = (chunk) => {
    if (settled) {
      return;
    }

    responseBuffer = Buffer.concat([responseBuffer, chunk]);
    const headerEndIndex = responseBuffer.indexOf('\r\n\r\n');
    if (headerEndIndex < 0) {
      if (responseBuffer.length > 8192) {
        rejectTunnel(new Error('上游代理 CONNECT 响应过大'));
      }
      return;
    }

    const headerText = responseBuffer.subarray(0, headerEndIndex).toString('latin1');
    const statusMatch = headerText.match(/^HTTP\/1\.[01]\s+(\d{3})/i);
    const statusCode = statusMatch ? Number.parseInt(statusMatch[1], 10) : 0;
    if (statusCode !== 200) {
      rejectTunnel(new Error(`上游代理 CONNECT 失败: HTTP ${statusCode || 'unknown'}`));
      return;
    }

    settled = true;
    upstreamSocket.removeListener('data', onData);
    upstreamSocket.removeListener('error', rejectTunnel);
    upstreamSocket.removeListener('timeout', onTimeout);
    const restData = responseBuffer.subarray(headerEndIndex + 4);
    if (restData.length > 0) {
      upstreamSocket.unshift(restData);
    }
    resolve(upstreamSocket);
  };

  const onTimeout = () => rejectTunnel(new Error('上游代理连接超时'));

  upstreamSocket.setTimeout(config.forwardProxy.timeout);
  upstreamSocket.once('connect', () => {
    upstreamSocket.write(buildConnectRequest(target, upstreamProxy));
  });
  upstreamSocket.on('data', onData);
  upstreamSocket.once('timeout', onTimeout);
  upstreamSocket.once('error', rejectTunnel);
  upstreamSocket.once('close', () => {
    if (!settled) {
      rejectTunnel(new Error('上游代理连接已关闭'));
    }
  });
});

const getOriginPath = (targetUrl) => `${targetUrl.pathname}${targetUrl.search}` || '/';

const hasRequestBody = (req) => {
  const method = String(req.method || '').toUpperCase();
  if (method === 'GET' || method === 'HEAD') {
    return false;
  }

  const contentLength = Number.parseInt(req.headers['content-length'] || '0', 10);
  return contentLength > 0 || Boolean(req.headers['transfer-encoding']);
};

const sendRequestToUpstream = (req, upstreamRequest) => {
  if (hasRequestBody(req)) {
    req.pipe(upstreamRequest);
    return;
  }

  upstreamRequest.end();
};

const pipeUpstreamResponse = (upstreamResponse, res) => {
  res.writeHead(
    upstreamResponse.statusCode || 502,
    upstreamResponse.statusMessage,
    cleanHeaders(upstreamResponse.headers)
  );
  upstreamResponse.pipe(res);
};

const forwardHttpByAbsoluteForm = (req, res, targetUrl, upstreamProxy) => new Promise((resolve, reject) => {
  const headers = cleanHeaders(req.headers);
  headers.host = targetUrl.host;
  const upstreamAuthHeader = buildUpstreamProxyAuthHeader(upstreamProxy);
  if (upstreamAuthHeader) {
    headers['Proxy-Authorization'] = upstreamAuthHeader;
  }

  const upstreamRequest = http.request({
    host: upstreamProxy.host,
    port: upstreamProxy.port,
    method: req.method,
    path: targetUrl.href,
    headers,
    timeout: config.forwardProxy.timeout,
  }, (upstreamResponse) => {
    pipeUpstreamResponse(upstreamResponse, res);
    resolve();
  });

  upstreamRequest.on('timeout', () => {
    upstreamRequest.destroy(new Error('上游代理请求超时'));
  });

  upstreamRequest.on('error', reject);
  req.on('aborted', () => upstreamRequest.destroy());
  sendRequestToUpstream(req, upstreamRequest);
});

const forwardHttpByConnectTunnel = async (req, res, targetUrl, upstreamProxy) => {
  const tunnelSocket = await connectThroughUpstreamProxy(createTargetFromUrl(targetUrl), upstreamProxy);
  const headers = cleanHeaders(req.headers);
  headers.host = targetUrl.host;

  return new Promise((resolve, reject) => {
    const upstreamRequest = http.request({
      createConnection: () => tunnelSocket,
      host: targetUrl.hostname,
      port: Number.parseInt(targetUrl.port || '80', 10),
      method: req.method,
      path: getOriginPath(targetUrl),
      headers,
      timeout: config.forwardProxy.timeout,
    }, (upstreamResponse) => {
      pipeUpstreamResponse(upstreamResponse, res);
      resolve();
    });

    upstreamRequest.on('timeout', () => {
      upstreamRequest.destroy(new Error('上游代理请求超时'));
    });

    upstreamRequest.on('error', (error) => {
      tunnelSocket.destroy();
      reject(error);
    });
    req.on('aborted', () => upstreamRequest.destroy());
    sendRequestToUpstream(req, upstreamRequest);
  });
};

const handleHttpProxyRequest = async (req, res) => {
  const clientIp = getClientIp(req);
  if (!isAuthorized(req.headers)) {
    logger.warn(`正向代理认证失败: ip=${clientIp}, method=${req.method}`);
    sendProxyAuthRequired(res);
    return;
  }

  let targetUrl;
  try {
    targetUrl = new URL(req.url);
  } catch {
    sendHttpError(res, 400, 'Bad proxy request URL');
    return;
  }

  if (targetUrl.protocol !== 'http:') {
    sendHttpError(res, 400, 'HTTPS proxy requests must use CONNECT');
    return;
  }

  const maxAttempts = Math.max(1, config.forwardProxy.maxAttempts || 1);
  const triedAccountIds = [];
  const triedProxyKeys = [];
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let upstreamProxyResult;
    try {
      upstreamProxyResult = await getUpstreamProxy(clientIp, targetUrl.host, triedAccountIds, triedProxyKeys);
    } catch (error) {
      logger.warn(`正向代理获取上游失败: ip=${clientIp}, target=${targetUrl.host}, error=${error.message}`);
      lastError = error;
      break;
    }

    const upstreamProxy = upstreamProxyResult.endpoint;
    triedProxyKeys.push(formatProxyEndpoint(upstreamProxy));
    if (upstreamProxyResult.accountId) {
      triedAccountIds.push(upstreamProxyResult.accountId);
    }

    try {
      await forwardHttpByAbsoluteForm(req, res, targetUrl, upstreamProxy);
      return;
    } catch (absoluteError) {
      logger.warn(`正向代理 HTTP 普通转发失败，尝试隧道模式: target=${targetUrl.host}, attempt=${attempt}, error=${absoluteError.message}`);
      invalidateCachedProxy(upstreamProxyResult, absoluteError.message);
      lastError = absoluteError;
      if (res.headersSent || hasRequestBody(req)) {
        break;
      }
    }

    try {
      await forwardHttpByConnectTunnel(req, res, targetUrl, upstreamProxy);
      return;
    } catch (tunnelError) {
      logger.warn(`正向代理 HTTP 隧道转发失败: target=${targetUrl.host}, attempt=${attempt}, error=${tunnelError.message}`);
      invalidateCachedProxy(upstreamProxyResult, tunnelError.message);
      lastError = tunnelError;
      if (res.headersSent || hasRequestBody(req)) {
        break;
      }
    }
  }

  if (res.headersSent) {
    res.destroy(lastError || new Error('Bad Gateway'));
    return;
  }

  sendHttpError(res, 502, lastError ? lastError.message : 'Bad Gateway');
};

const handleHttpRequest = (req, res, next) => {
  if (!isEnabled() || !isAbsoluteProxyRequest(req)) {
    next();
    return;
  }

  if (!hasCredentials()) {
    logger.warn('正向代理已启用但未配置账号密码，已拒绝请求');
    sendProxyAuthRequired(res);
    return;
  }

  handleHttpProxyRequest(req, res).catch((error) => {
    logger.error('正向代理 HTTP 请求异常:', error);
    sendHttpError(res, 502, error.message || 'Bad Gateway');
  });
};

const parseConnectTarget = (requestUrl) => {
  const value = String(requestUrl || '').trim();
  if (!value || /[\s/\\]/.test(value) || value.includes('\r') || value.includes('\n')) {
    return null;
  }

  let url;
  try {
    url = new URL(`http://${value}`);
  } catch {
    return null;
  }

  const port = Number.parseInt(url.port || '443', 10);
  if (!url.hostname || Number.isNaN(port) || port <= 0 || port > 65535) {
    return null;
  }

  return {
    host: url.hostname,
    port,
    authority: `${url.hostname}:${port}`,
  };
};

const establishTunnel = (clientSocket, upstreamSocket, head) => {
  clientSocket.write('HTTP/1.1 200 Connection Established\r\nProxy-Agent: proxyTogether\r\n\r\n');
  if (head && head.length > 0) {
    upstreamSocket.write(head);
  }

  clientSocket.setTimeout(0);
  upstreamSocket.setTimeout(0);
  upstreamSocket.pipe(clientSocket);
  clientSocket.pipe(upstreamSocket);
};

const handleConnect = async (req, clientSocket, head) => {
  if (!isEnabled()) {
    writeSocketResponse(clientSocket, 405, 'Method Not Allowed', {}, 'Forward proxy is disabled');
    return;
  }

  const clientIp = getClientIp(req);
  if (!hasCredentials() || !isAuthorized(req.headers)) {
    logger.warn(`正向代理 CONNECT 认证失败: ip=${clientIp}, target=${req.url}`);
    writeSocketProxyAuthRequired(clientSocket);
    return;
  }

  const target = parseConnectTarget(req.url);
  if (!target) {
    writeSocketResponse(clientSocket, 400, 'Bad Request', {}, 'Bad CONNECT target');
    return;
  }

  let upstreamProxy;
  try {
    upstreamProxy = await getUpstreamProxy(clientIp, target.authority);
  } catch (error) {
    logger.warn(`正向代理 CONNECT 获取上游失败: ip=${clientIp}, target=${target.authority}, error=${error.message}`);
    writeSocketResponse(clientSocket, 502, 'Bad Gateway', {}, error.message || 'Bad Gateway');
    return;
  }

  let upstreamSocket;
  try {
    upstreamSocket = await connectThroughUpstreamProxy(target, upstreamProxy.endpoint);
  } catch (error) {
    logger.warn(`正向代理 CONNECT 转发失败: target=${target.authority}, error=${error.message}`);
    invalidateCachedProxy(upstreamProxy, error.message);
    writeSocketResponse(clientSocket, 502, 'Bad Gateway', {}, error.message || 'Bad Gateway');
    return;
  }

  const closeBothSockets = () => {
    if (!clientSocket.destroyed) {
      clientSocket.destroy();
    }
    if (!upstreamSocket.destroyed) {
      upstreamSocket.destroy();
    }
  };

  establishTunnel(clientSocket, upstreamSocket, head);
  clientSocket.once('error', closeBothSockets);
  upstreamSocket.once('error', closeBothSockets);
  clientSocket.once('close', () => upstreamSocket.destroy());
  upstreamSocket.once('close', () => clientSocket.destroy());
};

const attach = (server) => {
  server.on('connect', (req, clientSocket, head) => {
    handleConnect(req, clientSocket, head).catch((error) => {
      logger.error('正向代理 CONNECT 请求异常:', error);
      writeSocketResponse(clientSocket, 502, 'Bad Gateway', {}, error.message || 'Bad Gateway');
    });
  });
};

module.exports = {
  attach,
  handleHttpRequest,
};
