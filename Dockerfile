FROM node:22

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile

RUN BASE_PATH=/ PORT=3000 pnpm --filter @workspace/cortex-ai run build

RUN pnpm --filter @workspace/api-server run build

RUN cp -r artifacts/cortex-ai/dist/public artifacts/api-server/dist/public

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]
