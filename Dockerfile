# ================= 构建阶段：用 Bun 打包前端 =================
FROM oven/bun:1 AS build

WORKDIR /app

# 先复制依赖清单，利用 Docker 缓存
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# 复制源码并构建（API_BASE 默认为空 -> 相对路径，由 Nginx 反代）
COPY . .
RUN bun run build

# ================= 运行阶段：Nginx 托管静态文件 + 反代 API =================
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
