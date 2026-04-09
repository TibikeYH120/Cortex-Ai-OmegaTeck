FROM node:22-alpine

RUN npm install -g pnpm@10

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile

RUN BASE_PATH=/ PORT=3000 NODE_ENV=production pnpm --filter @workspace/cortex-ai run build

RUN NODE_ENV=production pnpm --filter @workspace/api-server run build

RUN cp -r artifacts/cortex-ai/dist/public artifacts/api-server/dist/public

ENV NODE_ENV=production

CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]
