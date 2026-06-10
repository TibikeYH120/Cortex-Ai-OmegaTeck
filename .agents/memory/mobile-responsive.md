---
name: Mobile responsive fixes
description: Specific CSS fixes for the chat UI on narrow screens.
---

## Issues fixed (`artifacts/cortex-ai/src/components/ChatArea.tsx`)

1. **Message header overflow** — `flex items-center gap-2` → `flex items-center gap-x-2 gap-y-1 flex-wrap`; allows name/timestamp/actions to wrap on 320–375px screens.

2. **Speak button text on mobile** — `<span>` with text label wrapped in `<span className="hidden sm:inline">` so only icon shows on small screens.

3. **User message long-line overflow** — Added `break-words overflow-wrap-anywhere` to the user message content div (was `whitespace-pre-wrap` only — didn't break long unspaced lines).

4. **Horizontal scroll prevention** — Messages scroll area: `overflow-y-auto` → `overflow-y-auto overflow-x-hidden`.

**Why:** Without `flex-wrap` the header row overflows on 320px screens; without `break-words` a long URL or code snippet in a user message causes horizontal page scroll.
