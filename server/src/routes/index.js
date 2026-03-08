const express = require('express');
const adminRoutes = require('./admin');
const proxyRoutes = require('./proxy');

const router = express.Router();

// 后台管理接口
router.use('/admin', adminRoutes);

// 代理接口
router.use('/proxy', proxyRoutes);

module.exports = router;
