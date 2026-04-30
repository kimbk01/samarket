# Dynamic Route Exception: `community-messenger/rooms/[roomId]`

## Why this route stays dynamic

`app/(main)/community-messenger/rooms/[roomId]/page.tsx` intentionally keeps:

- `export const dynamic = "force-dynamic";`

This route reads per-request runtime inputs:

- `cookies()` (`samarket_e2e_room_diag`)
- `headers()` (`x-samarket-e2e-room-diag`)

Those values drive E2E room diagnostics and must be reflected on every request.
If this page is converted to static caching behavior, diagnostic toggles can be ignored or delayed.

## Current policy

- Remove `force-dynamic` everywhere possible (already applied across app routes).
- Keep `force-dynamic` only on this room page until diagnostic flow is redesigned.

## Before removing this exception

All conditions below must be true:

1. E2E room diagnostics no longer depend on request-time `cookies()` / `headers()`.
2. Equivalent behavior is validated in production-like build (`npm run build` + E2E).
3. No regression in room bootstrap visibility/trace tooling.

If any condition is unmet, keep this route dynamic.
