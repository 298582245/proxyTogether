const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('./logger');

const KEYS_DIR = path.join(__dirname, '../keys');
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'private.key');
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, 'public.key');

let loadedPrivateKey = null;
let loadedPublicKey = null;

const ensureKeysDir = () => {
  if (!fs.existsSync(KEYS_DIR)) {
    fs.mkdirSync(KEYS_DIR, { recursive: true });
  }
};

const loadKeyFromFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath, 'utf8');
};

const setKeys = (privateKey, publicKey, options = {}) => {
  const { persistToFile = false } = options;

  loadedPrivateKey = privateKey || null;
  loadedPublicKey = publicKey || null;

  if (persistToFile && loadedPrivateKey && loadedPublicKey) {
    ensureKeysDir();
    fs.writeFileSync(PRIVATE_KEY_PATH, loadedPrivateKey, 'utf8');
    fs.writeFileSync(PUBLIC_KEY_PATH, loadedPublicKey, 'utf8');
    logger.info('JWT 密钥已写入本地文件');
  }
};

const keysExist = () => Boolean(
  (loadedPrivateKey && loadedPublicKey)
  || (fs.existsSync(PRIVATE_KEY_PATH) && fs.existsSync(PUBLIC_KEY_PATH)),
);

const getPrivateKey = () => {
  if (loadedPrivateKey) {
    return loadedPrivateKey;
  }

  ensureKeysDir();
  loadedPrivateKey = loadKeyFromFile(PRIVATE_KEY_PATH);
  return loadedPrivateKey;
};

const getPublicKey = () => {
  if (loadedPublicKey) {
    return loadedPublicKey;
  }

  ensureKeysDir();
  loadedPublicKey = loadKeyFromFile(PUBLIC_KEY_PATH);
  return loadedPublicKey;
};

const saveKeys = (privateKey, publicKey) => {
  setKeys(privateKey, publicKey, { persistToFile: true });
};

const generateToken = (payload = {}) => {
  const privateKey = getPrivateKey();
  if (!privateKey) {
    throw new Error('JWT 私钥未初始化');
  }

  return jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    expiresIn: config.jwt.expiresIn,
  });
};

const verifyToken = (token) => {
  const publicKey = getPublicKey();
  if (!publicKey) {
    throw new Error('JWT 公钥未初始化');
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
  setKeys,
  generateToken,
  verifyToken,
  KEYS_DIR,
  PRIVATE_KEY_PATH,
  PUBLIC_KEY_PATH,
};
