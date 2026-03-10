# 前端 Dockerfile - 直接使用本地已构建的 dist 目录
FROM nginx:alpine

# 复制构建产物
COPY dist /usr/share/nginx/html

# 复制 nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
