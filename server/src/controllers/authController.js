const SystemConfig = require('../models/SystemConfig');
const jwtUtil = require('../utils/jwt');
const cacheService = require('../services/cacheService');
const crypto = require('crypto');

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
const initJwtKeys = async () => {
  // 检查数据库中是否已有密钥
  let privateKey = await SystemConfig.getValue('jwt_private_key');
  let publicKey = await SystemConfig.getValue('jwt_public_key');

  if (!privateKey || !publicKey) {
    // 生成新密钥
    const keys = generateKeyPair();
    await SystemConfig.setValue('jwt_private_key', keys.privateKey, 'JWT私钥');
    await SystemConfig.setValue('jwt_public_key', keys.publicKey, 'JWT公钥');

    // 同时保存到文件系统
    jwtUtil.saveKeys(keys.privateKey, keys.publicKey);

    console.log('JWT密钥已初始化');
    return keys;
  }

  // 保存到文件系统
  jwtUtil.saveKeys(privateKey, publicKey);

  return { privateKey, publicKey };
};

/**
 * 登录
 */
const login = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: '请输入密码',
      });
    }

    // 获取存储的密码
    const storedPassword = await SystemConfig.getValue('admin_password', 'admin123');

    if (password !== storedPassword) {
      return res.status(401).json({
        success: false,
        message: '密码错误',
      });
    }

    // 检查JWT密钥
    if (!jwtUtil.keysExist()) {
      await initJwtKeys();
    }

    // 生成Token
    const token = jwtUtil.generateToken({
      loginTime: Date.now(),
    });

    res.json({
      success: true,
      message: '登录成功',
      data: { token },
    });
  } catch (error) {
    console.error('登录失败:', error);
    res.status(500).json({
      success: false,
      message: '登录失败',
    });
  }
};

/**
 * 验证Token
 */
const verify = async (req, res) => {
  try {
    // 如果能到达这里，说明中间件已经验证通过了
    res.json({
      success: true,
      message: 'Token有效',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '验证失败',
    });
  }
};

/**
 * 修改密码
 */
const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: '请输入旧密码和新密码',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: '新密码长度不能少于6位',
      });
    }

    // 验证旧密码
    const storedPassword = await SystemConfig.getValue('admin_password', 'admin123');

    if (oldPassword !== storedPassword) {
      return res.status(400).json({
        success: false,
        message: '旧密码错误',
      });
    }

    // 更新密码
    await SystemConfig.setValue('admin_password', newPassword, '后台管理密码');

    res.json({
      success: true,
      message: '密码修改成功',
    });
  } catch (error) {
    console.error('修改密码失败:', error);
    res.status(500).json({
      success: false,
      message: '修改密码失败',
    });
  }
};

module.exports = {
  initJwtKeys,
  login,
  verify,
  changePassword,
};
