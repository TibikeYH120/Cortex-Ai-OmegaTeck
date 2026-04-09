FROM node:22-alpine AS base
RUN npm install -g pnpm@10

FROM base AS deps
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

FROM deps AS frontend-builder
ENV BASE_PATH=/ PORT=3000 NODE_ENV=production
RUN pnpm --filter @workspace/cortex-ai run build

FROM deps AS api-builder
ENV NODE_ENV=production
RUN pnpm --filter @workspace/api-server run build

FROM base AS runner
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/artifacts/api-server/node_modules ./artifacts/api-server/node_modules
COPY --from=deps /app/lib ./lib
COPY --from=api-builder /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=frontend-builder /app/artifacts/cortex-ai/dist/public ./artifacts/api-server/dist/public
ENV NODE_ENV=production
CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]
