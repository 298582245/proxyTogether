const SystemConfig = require('../models/SystemConfig');
const jwtUtil = require('../utils/jwt');
const cacheService = require('../services/cacheService');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

const BCRYPT_ROUNDS = 10;

/**
 * 检查密码是否为bcrypt哈希格式
 * 支持 $2a$ (bcryptjs) 和 $2b$ (原生bcrypt) 两种前缀
 */
const isHashedPassword = (password) => {
  return password && (password.startsWith('$2a$') || password.startsWith('$2b$'));
};

/**
 * 哈希密码
 */
const hashPassword = async (password) => {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
};

/**
 * 验证密码
 */
const verifyPassword = async (password, hashedPassword) => {
  return bcrypt.compare(password, hashedPassword);
};

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

    logger.info('JWT密钥已初始化');
    return keys;
  }

  // 保存到文件系统
  jwtUtil.saveKeys(privateKey, publicKey);

  return { privateKey, publicKey };
};

/**
 * 检查是否需要初始化密码
 */
const checkPasswordInit = async (req, res) => {
  try {
    const storedPassword = await SystemConfig.getValue('admin_password');

    // 如果没有密码记录，需要初始化
    if (!storedPassword) {
      return res.json({
        success: true,
        data: {
          needInit: true,
          message: '请设置初始密码',
        },
      });
    }

    return res.json({
      success: true,
      data: {
        needInit: false,
      },
    });
  } catch (error) {
    logger.error('检查密码初始化状态失败:', error);
    return res.status(500).json({
      success: false,
      message: '检查失败',
    });
  }
};

/**
 * 初始化密码（首次设置）
 */
const initPassword = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: '请输入密码',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: '密码长度不能少于6位',
      });
    }

    // 检查是否已经设置过密码
    const existingPassword = await SystemConfig.getValue('admin_password');
    if (existingPassword) {
      return res.status(400).json({
        success: false,
        message: '密码已设置，请使用修改密码功能',
      });
    }

    // 哈希密码并存储
    const hashedPassword = await hashPassword(password);
    await SystemConfig.setValue('admin_password', hashedPassword, '后台管理密码(哈希)');

    // 检查JWT密钥
    if (!jwtUtil.keysExist()) {
      await initJwtKeys();
    }

    // 生成Token
    const token = jwtUtil.generateToken({
      loginTime: Date.now(),
    });

    logger.info('初始密码设置成功');

    res.json({
      success: true,
      message: '密码设置成功',
      data: { token },
    });
  } catch (error) {
    logger.error('初始化密码失败:', error);
    res.status(500).json({
      success: false,
      message: '密码设置失败',
    });
  }
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
    const storedPassword = await SystemConfig.getValue('admin_password');

    // 如果没有密码，提示需要初始化
    if (!storedPassword) {
      return res.status(400).json({
        success: false,
        message: '请先设置初始密码',
        needInit: true,
      });
    }

    // 验证密码（支持bcrypt哈希和旧版明文密码的平滑迁移）
    let isValid = false;

    if (isHashedPassword(storedPassword)) {
      // 新版bcrypt哈希验证
      isValid = await verifyPassword(password, storedPassword);
    } else {
      // 旧版明文密码验证（用于平滑迁移）
      isValid = password === storedPassword;

      // 如果验证通过，自动升级为bcrypt哈希
      if (isValid) {
        const hashedPassword = await hashPassword(password);
        await SystemConfig.setValue('admin_password', hashedPassword, '后台管理密码(哈希)');
        logger.info('密码已自动升级为bcrypt哈希格式');
      }
    }

    if (!isValid) {
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

    logger.info('用户登录成功');

    res.json({
      success: true,
      message: '登录成功',
      data: { token },
    });
  } catch (error) {
    logger.error('登录失败:', error);
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
    logger.error('验证失败:', error);
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

    // 获取存储的密码
    const storedPassword = await SystemConfig.getValue('admin_password');

    if (!storedPassword) {
      return res.status(400).json({
        success: false,
        message: '请先设置初始密码',
        needInit: true,
      });
    }

    // 验证旧密码
    let isValid = false;

    if (isHashedPassword(storedPassword)) {
      isValid = await verifyPassword(oldPassword, storedPassword);
    } else {
      // 旧版明文密码验证
      isValid = oldPassword === storedPassword;
    }

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: '旧密码错误',
      });
    }

    // 哈希新密码并更新
    const hashedPassword = await hashPassword(newPassword);
    await SystemConfig.setValue('admin_password', hashedPassword, '后台管理密码(哈希)');

    logger.info('密码修改成功');

    res.json({
      success: true,
      message: '密码修改成功',
    });
  } catch (error) {
    logger.error('修改密码失败:', error);
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
  checkPasswordInit,
  initPassword,
};
