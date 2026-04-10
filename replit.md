# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **AI**: Anthropic (claude-sonnet-4-6) via Replit AI Integrations
- **Auth**: Express sessions with bcryptjs password hashing

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── cortex-ai/          # CORTEX AI React+Vite frontend
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   ├── db/                 # Drizzle ORM schema + DB connection
│   └── integrations-anthropic-ai/  # Anthropic AI client
├── scripts/                # Utility scripts (single workspace package)
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## Environment Variables

Required secrets (set in Replit Secrets or Railway environment variables):

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Express session secret (throws in production if missing) |
| `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` | Yes | Anthropic proxy base URL |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | Yes | Anthropic proxy API key |
| `AI_INTEGRATIONS_GEMINI_BASE_URL` | Yes | Gemini proxy base URL (image generation) |
| `AI_INTEGRATIONS_GEMINI_API_KEY` | Yes | Gemini proxy API key |
| `TAVILY_API_KEY` | No | Tavily Search API key for real web search results (free: 1,000/month at https://app.tavily.com). Falls back to Wikipedia-only if not set. |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | Yes | OpenAI proxy base URL (auto-provisioned via Replit AI Integrations — for TTS/STT) |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Yes | OpenAI proxy API key (auto-provisioned via Replit AI Integrations — for TTS/STT) |

## Applications

### CORTEX AI (`artifacts/cortex-ai`)

Full-stack AI chat application. Features:
- Auth screen: Login / Register / Guest mode
- Chat with Claude Sonnet (claude-sonnet-4-6) branded as "Cortex AI"
- Conversation history with database persistence
- Live code preview in markdown code blocks
- AI image generation via Gemini (triggered by `[GENERATE_IMAGE: ...]`)
- Real web search via Tavily API (auto-triggered when needed)
- **Voice TTS**: hover any AI message → speaker icon → hear it read aloud (4 voices)
- **Voice STT**: mic button in chat input → speak → transcript inserted into text box
- **Voice settings**: Settings → Voice tab (voice selector, auto-read toggle)
- Profile system (name, bio, password change, account stats)
- Settings modal (AI model, voice, appearance, notifications, about)
- AI-generated Cortex avatar (`public/cortex-avatar.png`)
- Deterministic SVG user avatars (unique per email/name via `AvatarUtils.tsx`)
- Modals rendered via React portals to avoid stacking context issues
- PostgreSQL session store via `connect-pg-simple`
- Collapsible sidebar on desktop, mobile hamburger menu
- Dark cyberpunk design (OmegaTeck brand)
- PWA manifest + iOS meta tags

### API Server (`artifacts/api-server`)

Express 5 API server. Routes:
- `GET /api/healthz` — health check
- `POST /api/auth/register` — user registration
- `POST /api/auth/login` — login
- `GET /api/auth/me` — current user
- `POST /api/auth/logout` — logout
- `GET /api/profile` — get profile
- `PUT /api/profile` — update profile
- `GET|POST /api/anthropic/conversations` — conversation CRUD
- `GET|DELETE /api/anthropic/conversations/:id` — single conversation
- `GET|POST /api/anthropic/conversations/:id/messages` — messages + SSE stream
- `POST /api/tts` — text-to-speech via OpenAI gpt-audio-mini (returns audio/mpeg)
- `POST /api/stt` — speech-to-text via OpenAI gpt-4o-mini-transcribe (returns {transcript})
- `POST /api/image/generate` — AI image generation via Gemini

## Database Schema

- `users` — id, name, email, passwordHash, role, bio, createdAt
- `conversations` — id, title, createdAt
- `messages` — id, conversationId, role, content, createdAt

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, sessions, routes at `/api`
- Depends on: `@workspace/db`, `@workspace/api-zod`, `@workspace/integrations-anthropic-ai`
- `pnpm --filter @workspace/api-server run dev` — run the dev server

### `artifacts/cortex-ai` (`@workspace/cortex-ai`)

React + Vite frontend for the CORTEX AI chat application.
- Uses `@workspace/api-client-react` for generated React Query hooks
- Anthropic SSE streaming uses manual fetch (not generated hooks)

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL.
- `src/schema/users.ts` — users table
- `src/schema/conversations.ts` — AI conversations
- `src/schema/messages.ts` — chat messages

### `lib/integrations-anthropic-ai` (`@workspace/integrations-anthropic-ai`)

Anthropic AI client wrapper using Replit AI Integrations.
- Requires `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` and `AI_INTEGRATIONS_ANTHROPIC_API_KEY` env vars
- Exports: `anthropic` client, `batchProcess`, `batchProcessWithSSE`

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`).
Run codegen: `pnpm --filter @workspace/api-spec run codegen`
