FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app/api
COPY api/package.json api/package-lock.json ./
# Keep the Prisma CLI for Railway's pre-deploy migration command.
RUN npm ci --include=dev
COPY api/prisma ./prisma
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build npm run prisma:generate
COPY api/server ./server
RUN npm run build
ENV NODE_ENV=production STORAGE_DRIVER=local STORAGE_LOCAL_DIR=/data/storage TRUST_PROXY_HOPS=1
CMD ["node", "server/index.js"]
