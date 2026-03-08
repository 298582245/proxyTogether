const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const SystemConfig = require('../models/SystemConfig');

const KEYS_DIR = path.join(__dirname, '../keys');
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'private.key');
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, 'public.key');

/**
 * 生成RSA密钥对
 */
const generateKeyPair = () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });
  return { publicKey, privateKey };
};

/**
 * 初始化JWT密钥
 */
const initKeys = async () => {
  try {
    // 确保keys目录存在
    if (!fs.existsSync(KEYS_DIR)) {
      fs.mkdirSync(KEYS_DIR, { recursive: true });
    }

    // 检查数据库中是否已有密钥
    let privateKey = await SystemConfig.getValue('jwt_private_key');
    let publicKey = await SystemConfig.getValue('jwt_public_key');

    if (!privateKey || !publicKey) {
      console.log('正在生成新的JWT密钥...');
      const keys = generateKeyPair();

      await SystemConfig.setValue('jwt_private_key', keys.privateKey, 'JWT私钥');
      await SystemConfig.setValue('jwt_public_key', keys.publicKey, 'JWT公钥');

      // 保存到文件
      fs.writeFileSync(PRIVATE_KEY_PATH, keys.privateKey, 'utf8');
      fs.writeFileSync(PUBLIC_KEY_PATH, keys.publicKey, 'utf8');

      console.log('JWT密钥已生成并保存');
    } else {
      // 保存到文件
      fs.writeFileSync(PRIVATE_KEY_PATH, privateKey, 'utf8');
      fs.writeFileSync(PUBLIC_KEY_PATH, publicKey, 'utf8');
      console.log('JWT密钥已从数据库加载');
    }

    process.exit(0);
  } catch (error) {
    console.error('初始化JWT密钥失败:', error);
    process.exit(1);
  }
};

// 直接运行
initKeys();
