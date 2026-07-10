---
name: D1 cross-conversation AI memory
description: How CORTEX's persistent "remembers the user" feature is built on Cloudflare D1, why extraction uses Anthropic (not the user's own OpenAI key), and the owner-keying convention.
---

CORTEX AI stores durable facts about each user/guest in the same Cloudflare D1 database already used for search caching (table `user_memory`: id, owner_key, fact, created_at).

**Why:** users want the AI to remember things ("emlékezzen") across separate conversations, not just within one chat's history. A relational Postgres table would work too, but D1 was already wired up and the user explicitly wanted it reused.

**How to apply:**
- After every assistant reply, a fire-and-forget call asks a cheap Anthropic model (`claude-haiku-4-5`) to extract durable facts (name, preferences, ongoing projects) from the exchange as JSON, then stores them via `addMemory()`.
- Extraction deliberately uses the Anthropic proxy, NOT `getOpenAIClient()` — the api-server prioritizes the user's own `OPENAI_API_KEY` from Secrets for CORTEX LITE, and that personal key can hit its own quota/billing limits independently of the app's own credits, silently breaking a background feature the user never explicitly triggered.
- Owner keying: `user:${userId}` for logged-in users, `guest:${sessionId}` for guests — mirrors the existing `Owner` type/`getOwner()` pattern used for conversation ownership.
- Memories are injected into `buildSystemPrompt()` as a "WHAT YOU REMEMBER ABOUT THIS USER" block, capped at 30 facts per owner (oldest trimmed first), with naive case-insensitive dedup on insert.
- Endpoints: `GET/DELETE /api/anthropic/memory` and `DELETE /api/anthropic/memory/:id` exist for viewing/clearing, but no frontend UI was built for them yet — only backend + auto system-prompt injection.
