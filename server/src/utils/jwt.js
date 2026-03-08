const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const config = require('../config');

// 密钥文件路径
const KEYS_DIR = path.join(__dirname, '../keys');
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'private.key');
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, 'public.key');

// 确保密钥目录存在
const ensureKeysDir = () => {
  if (!fs.existsSync(KEYS_DIR)) {
    fs.mkdirSync(KEYS_DIR, { recursive: true });
  }
};

// 检查密钥是否存在
const keysExist = () => {
  return fs.existsSync(PRIVATE_KEY_PATH) && fs.existsSync(PUBLIC_KEY_PATH);
};

// 获取私钥
const getPrivateKey = () => {
  ensureKeysDir();
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    return null;
  }
  return fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
};

// 获取公钥
const getPublicKey = () => {
  ensureKeysDir();
  if (!fs.existsSync(PUBLIC_KEY_PATH)) {
    return null;
  }
  return fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');
};

// 保存密钥
const saveKeys = (privateKey, publicKey) => {
  ensureKeysDir();
  fs.writeFileSync(PRIVATE_KEY_PATH, privateKey, 'utf8');
  fs.writeFileSync(PUBLIC_KEY_PATH, publicKey, 'utf8');
  console.log('JWT密钥已生成并保存');
};

// 生成JWT Token
const generateToken = (payload = {}) => {
  const privateKey = getPrivateKey();
  if (!privateKey) {
    throw new Error('JWT私钥未初始化');
  }
  return jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    expiresIn: config.jwt.expiresIn,
  });
};

// 验证JWT Token
const verifyToken = (token) => {
  const publicKey = getPublicKey();
  if (!publicKey) {
    throw new Error('JWT公钥未初始化');
  }
  try {
    return jwt.verify(token, publicKey, { algorithms: ['RS256'] });
  } catch (error) {
    return null;
  }
};

module.exports = {
  keysExist,
  getPrivateKey,
  getPublicKey,
  saveKeys,
  generateToken,
  verifyToken,
  KEYS_DIR,
  PRIVATE_KEY_PATH,
  PUBLIC_KEY_PATH,
};
