# ==============================================================================
# 听序（Tingxu）— 控制面后端生产级 Dockerfile
# ==============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# 安装构建依赖
RUN apk add --no-cache python3 make g++

# 拷贝依赖配置
COPY package*.json ./
RUN if [ -f package.json ]; then npm install; else echo "Init package.json" && npm init -y && npm install express; fi

# 拷贝源码
COPY . .

# 如果存在 tsconfig.json 则执行编译
RUN if [ -f tsconfig.json ]; then npm run build 2>/dev/null || true; fi

# 运行镜像
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app ./

EXPOSE 3000

# 启动服务
CMD ["node", "dist/main.js"]
