const express = require('express');
const proxyAuthMiddleware = require('../middlewares/proxyAuth');
const proxyController = require('../controllers/proxyController');

const router = express.Router();

// 代理接口（需要Token/IP白名单验证）
router.get('/get', proxyAuthMiddleware, proxyController.getProxy);
router.get('/detail', proxyAuthMiddleware, proxyController.getProxyDetail);

module.exports = router;
