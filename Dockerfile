FROM node:22

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/cortex-ai/package.json ./artifacts/cortex-ai/

COPY lib/db/package.json ./lib/db/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY lib/integrations-anthropic-ai/package.json ./lib/integrations-anthropic-ai/
COPY lib/integrations-gemini-ai/package.json ./lib/integrations-gemini-ai/

RUN pnpm install --frozen-lockfile

COPY . .

RUN BASE_PATH=/ PORT=3000 pnpm --filter @workspace/cortex-ai run build

RUN pnpm --filter @workspace/api-server run build

RUN cp -r artifacts/cortex-ai/dist/public artifacts/api-server/dist/public

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]
