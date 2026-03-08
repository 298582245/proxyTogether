@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ==========================================
echo   proxyTogether Docker 一键部署
echo ==========================================

:: 检查 Docker 是否安装
where docker >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo 错误: Docker 未安装，请先安装 Docker Desktop
    pause
    exit /b 1
)

:: 检查 Docker Compose
docker compose version >nul 2>nul
if %ERRORLEVEL% neq 0 (
    docker-compose --version >nul 2>nul
    if %ERRORLEVEL% neq 0 (
        echo 错误: Docker Compose 未安装
        pause
        exit /b 1
    )
    set COMPOSE_CMD=docker-compose
) else (
    set COMPOSE_CMD=docker compose
)

:: 检查 .env 文件
if not exist .env (
    echo 未找到 .env 文件，从 .env.example 复制...
    copy .env.example .env >nul
    echo 已创建 .env 文件，请根据需要修改配置
)

:: 构建并启动服务
echo.
echo 正在构建并启动服务...
%COMPOSE_CMD% up -d --build

:: 等待服务启动
echo.
echo 等待服务启动...
timeout /t 10 /nobreak >nul

:: 检查服务状态
echo.
echo 服务状态:
%COMPOSE_CMD% ps

echo.
echo ==========================================
echo   部署完成!
echo ==========================================
echo.
echo 访问地址: http://localhost
echo.
echo 常用命令:
echo   查看日志: %COMPOSE_CMD% logs -f
echo   停止服务: %COMPOSE_CMD% down
echo   重启服务: %COMPOSE_CMD% restart
echo   查看状态: %COMPOSE_CMD% ps
echo.
pause
