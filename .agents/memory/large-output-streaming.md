---
name: Large-output streaming
description: How long AI responses are handled end-to-end — backend continuation loop and frontend live display.
---

## Backend (`artifacts/api-server/src/routes/anthropic/index.ts`)

`streamUntilDone(messages, system, res, log, maxIterations=5)`:
- Streams with `max_tokens: 16000`
- On `stop_reason: "max_tokens"` appends `{role:"assistant", content: chunk}` + `{role:"user", content:"Continue."}` and loops
- Sends `{ continuing: true }` SSE between iterations (client ignores gracefully)
- All Claude paths (synthesis, detection fallback, image path) go through this

OpenAI path uses `max_tokens: 16384`.

**Why:** The original `max_tokens: 8192` cut responses at ~30–40K chars. The continuation loop allows effectively unlimited output length.

## Frontend (`artifacts/cortex-ai/src/hooks/use-chat-stream.ts`)

`LIVE_STREAM_THRESHOLD = 2000` chars:
- Below threshold: silent buffering + typewriter animation (original UX)
- Above threshold: `scheduleLiveUpdate()` via RAF throttle updates `streamingContent` in real-time; `fullTextRef` holds mutable snapshot; after generation ends, `setStreamingContent(fullText)` then 80ms `setTimeout` before `finalize()`

`{ continuing: true }` SSE event: `continue` — no state change, generation keeps going.

**Why:** For large outputs the silent buffering phase caused a very long blank wait. Live display shows content building as it streams in.
