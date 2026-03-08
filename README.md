# 代理统一接口管理系统

一个用于统一管理多个代理网站账号的系统，自动选择余额最高的账号提取代理IP。

## 功能特性

- 支持多个代理网站配置
- 同一网站可添加多个账号
- 自动选择余额最高的账号提取代理
- 定时查询余额并缓存到Redis
- 连续失败自动禁用账号，余额恢复后自动启用
- 后台管理界面，JWT认证
- 代理接口支持Token验证和IP白名单

## 技术栈

**后端:**
- Node.js + Express
- MySQL + Sequelize
- Redis (ioredis)
- JWT (RS256)

**前端:**
- Vue 3
- Element Plus
- Pinia
- Vite

## 项目结构

```
proxyTogether/
├── server/                    # 后端服务
│   ├── src/
│   │   ├── config/           # 配置文件
│   │   ├── models/           # 数据模型
│   │   ├── controllers/      # 控制器
│   │   ├── services/         # 业务逻辑
│   │   ├── routes/           # 路由
│   │   ├── middlewares/      # 中间件
│   │   ├── schedulers/       # 定时任务
│   │   ├── utils/            # 工具函数
│   │   └── app.js            # 入口文件
│   └── package.json
├── web/                       # 前端项目
│   ├── src/
│   │   ├── views/            # 页面组件
│   │   ├── components/       # 公共组件
│   │   ├── api/              # API请求
│   │   ├── stores/           # 状态管理
│   │   ├── router/           # 路由
│   │   └── utils/            # 工具函数
│   └── package.json
└── sqls/
    └── v1_init.sql           # 数据库初始化SQL
```

## 快速开始

### 1. 创建数据库

```sql
CREATE DATABASE proxy_together DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

然后执行 `sqls/v1_init.sql` 初始化表结构。

### 2. 后端配置

```bash
cd server

# 安装依赖
npm install

# 复制环境变量文件
cp .env.example .env

# 修改 .env 配置
# DB_HOST=localhost
# DB_PORT=3306
# DB_NAME=proxy_together
# DB_USER=root
# DB_PASSWORD=your_password
# REDIS_HOST=localhost
# REDIS_PORT=6379

# 启动服务
npm run dev
```

### 3. 前端配置

```bash
cd web

# 安装依赖
npm install

# 开发模式启动
npm run dev

# 生产构建
npm run build
```

### 4. 访问系统

- 前端地址: http://localhost:5173
- 后端API: http://localhost:3000/api
- 默认密码: `admin123` (首次登录后请修改)

## API 接口

### 代理接口

```
GET /proxy/get?duration=1&format=txt&token=xxx
```

参数:
- `duration`: 时长参数类型
- `format`: 格式参数
- `token`: 接口Token (如果配置了)

### 后台管理接口

- `POST /api/admin/auth/login` - 登录
- `GET /api/admin/sites` - 网站列表
- `POST /api/admin/sites` - 添加网站
- `GET /api/admin/accounts` - 账号列表
- `POST /api/admin/accounts` - 添加账号
- `GET /api/admin/config` - 系统配置
- `GET /api/admin/logs` - 提取日志

## 配置说明

### 网站配置

1. **提取链接模板**: 支持变量替换
   - `{duration}` - 时长参数
   - `{format}` - 格式参数
   - `{xxx}` - 账号特有参数

2. **格式参数**: JSON数组，如:
   ```json
   [{"label": "TXT", "value": "txt"}, {"label": "JSON", "value": "json"}]
   ```

3. **时长参数**: JSON数组，如:
   ```json
   [{"label": "1分钟", "times": 1, "type": 1}, {"label": "5分钟", "times": 5, "type": 2}]
   ```

4. **余额字段路径**: JSONPath格式，如 `data.balance`

### 账号配置

- **提取参数**: 账号特有的提取参数，如 `{"key": "xxx", "secret": "yyy"}`
- **余额参数**: 账号特有的余额查询参数

## License

MIT
