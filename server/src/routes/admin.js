const express = require('express');
const authMiddleware = require('../middlewares/auth');
const authController = require('../controllers/authController');
const siteController = require('../controllers/siteController');
const accountController = require('../controllers/accountController');
const configController = require('../controllers/configController');
const logController = require('../controllers/logController');

const router = express.Router();

// 认证相关
router.post('/auth/login', authController.login);
router.get('/auth/verify', authMiddleware, authController.verify);
router.put('/auth/password', authMiddleware, authController.changePassword);

// 网站管理
router.get('/sites', authMiddleware, siteController.getList);
router.get('/sites/all', authMiddleware, siteController.getAllActive);
router.get('/sites/:id', authMiddleware, siteController.getDetail);
router.get('/sites/:id/param-hints', authMiddleware, siteController.getParamHints);
router.post('/sites', authMiddleware, siteController.create);
router.put('/sites/:id', authMiddleware, siteController.update);
router.delete('/sites/:id', authMiddleware, siteController.remove);
router.put('/sites/:id/toggle', authMiddleware, siteController.toggleStatus);

// 账号管理
router.get('/accounts', authMiddleware, accountController.getList);
router.get('/accounts/stats', authMiddleware, accountController.getStats);
router.get('/accounts/:id', authMiddleware, accountController.getDetail);
router.post('/accounts', authMiddleware, accountController.create);
router.put('/accounts/:id', authMiddleware, accountController.update);
router.delete('/accounts/:id', authMiddleware, accountController.remove);
router.put('/accounts/:id/toggle', authMiddleware, accountController.toggleStatus);
router.post('/accounts/:id/refresh-balance', authMiddleware, accountController.refreshBalance);
router.post('/accounts/refresh-all-balance', authMiddleware, accountController.refreshAllBalance);

// 系统配置
router.get('/config', authMiddleware, configController.getConfig);
router.put('/config', authMiddleware, configController.updateConfig);
router.get('/config/:key', authMiddleware, configController.getConfigValue);

// 日志管理
router.get('/logs', authMiddleware, logController.getList);
router.get('/logs/stats', authMiddleware, logController.getStats);
router.get('/logs/:id', authMiddleware, logController.getDetail);

module.exports = router;
