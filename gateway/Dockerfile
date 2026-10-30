# ==============================================================================
# 听序（Tingxu）— 自建 AI Gateway 生产级 Dockerfile
# ==============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN if [ -f package.json ]; then npm install; else echo "Init package.json" && npm init -y && npm install express axios; fi

COPY . .

RUN if [ -f tsconfig.json ]; then npm run build 2>/dev/null || true; fi

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

COPY --from=builder /app ./

EXPOSE 3001

CMD ["node", "dist/main.js"]
