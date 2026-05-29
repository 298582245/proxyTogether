const buildProxyEndpoint = (host, port, username = null, password = null) => {
  const hostValue = String(host || '').trim();
  const portValue = Number.parseInt(port, 10);
  const octetsValid = hostValue.split('.').every((part) => {
    const value = Number.parseInt(part, 10);
    return !Number.isNaN(value) && value >= 0 && value <= 255;
  });

  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostValue) || !octetsValid || portValue <= 0 || portValue > 65535) {
    return null;
  }

  return {
    host: hostValue,
    port: portValue,
    auth: username && password
      ? { username: String(username), password: String(password) }
      : null,
  };
};

const parseProxyEndpointFromText = (text) => {
  const responseText = String(text || '');
  const pattern = /(^|[^\d])(\d{1,3}(?:\.\d{1,3}){3})[:：](\d{2,5})(?:[:：]([^\s:：]+)[:：]([^\s:：]+))?/g;
  let match;

  while ((match = pattern.exec(responseText)) !== null) {
    const proxyEndpoint = buildProxyEndpoint(match[2], match[3], match[4], match[5]);
    if (proxyEndpoint) {
      return proxyEndpoint;
    }
  }

  return null;
};

const parseProxyEndpointFromObject = (value) => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const proxyEndpoint = parseProxyEndpoint(item);
      if (proxyEndpoint) {
        return proxyEndpoint;
      }
    }
    return null;
  }

  const host = value.ip || value.host || value.proxyIp || value.proxy_ip;
  const port = value.port || value.proxyPort || value.proxy_port;
  const username = value.username || value.user || value.account;
  const password = value.password || value.pass || value.pwd;
  const directEndpoint = buildProxyEndpoint(host, port, username, password);
  if (directEndpoint) {
    return directEndpoint;
  }

  for (const item of Object.values(value)) {
    const proxyEndpoint = parseProxyEndpoint(item);
    if (proxyEndpoint) {
      return proxyEndpoint;
    }
  }

  return null;
};

const parseProxyEndpoint = (response) => {
  if (typeof response === 'string') {
    return parseProxyEndpointFromText(response);
  }

  const objectEndpoint = parseProxyEndpointFromObject(response);
  if (objectEndpoint) {
    return objectEndpoint;
  }

  return parseProxyEndpointFromText(JSON.stringify(response || ''));
};

const buildAxiosProxy = (proxyEndpoint) => {
  const proxyConfig = {
    protocol: 'http',
    host: proxyEndpoint.host,
    port: proxyEndpoint.port,
  };

  if (proxyEndpoint.auth) {
    proxyConfig.auth = proxyEndpoint.auth;
  }

  return proxyConfig;
};

const formatProxyEndpoint = (proxyEndpoint) => `${proxyEndpoint.host}:${proxyEndpoint.port}`;

module.exports = {
  buildProxyEndpoint,
  parseProxyEndpoint,
  buildAxiosProxy,
  formatProxyEndpoint,
};
