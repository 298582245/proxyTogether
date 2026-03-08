#!/bin/bash

# proxyTogether 一键部署脚本

echo "=========================================="
echo "  proxyTogether Docker 一键部署"
echo "=========================================="

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo "错误: Docker 未安装，请先安装 Docker"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "错误: Docker Compose 未安装，请先安装 Docker Compose"
    exit 1
fi

# 检查 .env 文件
if [ ! -f .env ]; then
    echo "未找到 .env 文件，从 .env.example 复制..."
    cp .env.example .env
    echo "已创建 .env 文件，请根据需要修改配置"
fi

# 构建并启动服务
echo ""
echo "正在构建并启动服务..."
docker-compose up -d --build

# 等待服务启动
echo ""
echo "等待服务启动..."
sleep 10

# 检查服务状态
echo ""
echo "服务状态:"
docker-compose ps

echo ""
echo "=========================================="
echo "  部署完成!"
echo "=========================================="
echo ""
echo "访问地址: http://localhost:${WEB_PORT:-80}"
echo ""
echo "常用命令:"
echo "  查看日志: docker-compose logs -f"
echo "  停止服务: docker-compose down"
echo "  重启服务: docker-compose restart"
echo "  查看状态: docker-compose ps"
echo ""
