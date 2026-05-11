# Runtime boundary architecture (SAMARKet / dibaY)

This document defines **where** messenger, store, trade, and admin runtimes may mount, and what must **not** return to the root layout. It complements `docs/dev-memory-runtime-separation.md` (dev heap vs prod) and existing chat/shell contracts under `.cursor/rules/`.

## Goals

- Keep **dev** compile/HMR graphs bounded as domains grow.
- Keep **`next start`** stable; moving boundaries must not change product behavior or API contracts.
- Prefer **mount boundary moves** over feature removal or “dynamic import only” patches.

## Root layout (`app/layout.tsx`) — allowed vs forbidden

### Allowed (truly global, minimal)

- `html` / `body`, global CSS, fonts, viewport metadata.
- Theme-related hooks or classes if they are O(1) and have no domain Realtime.
- **Auth sync minimum** (e.g. session cookie ↔ client, single flight).
- **Language** (`AppLanguageProvider` and cookie/header-derived `lang`).
- **Truly global** toasts or error surfaces that do not pull messenger/store Realtime.

### Forbidden (must not live here long term)

- **Messenger** presence / participants / unread bridges / room bump listeners.
- **Call** provider stack and incoming overlay (unless a documented exception requires global ring UX with zero `(main)` shell — then document and measure).
- **Store** cart context, delivery polling, order-chat global chrome tied to `/stores`.
- **Trade** presence heartbeat provider, trade chat entry overlays, unless proven required on every route (including `/admin`, `/login`) with measurements.
- **Heavy bridge** modules that subscribe to Supabase Realtime or Agora from the root.
- **Room probe** or messenger-only metrics inside root.

Current code still mounts in root (audit baseline): `CallIncomingChrome`, `CommunityMessengerPresenceRuntimeChrome`, `MainShellMessengerParticipantBridge` — see repo history and `docs/dev-memory-runtime-separation.md` section 5.

These three exist for **badge / incoming call / `community_messenger_participants`** contracts; relocating them is a **separate measured step**, not ad-hoc removal.

### Hard rule — no new root runtimes

Do **not** add messenger, store, trade, or admin runtimes to `app/layout.tsx` (no new providers, bridges, Realtime hosts, call surfaces, cart shells, or trade heartbeat trees).

### Hard rule — new providers live under domain layouts

Any **new** React provider must mount under the **deepest** appropriate segment, for example:

- `app/(main)/community-messenger/layout.tsx` (or deeper) for messenger-only state.
- `app/(main)/stores/**/layout.tsx` (or `app/(main)/mypage/layout.tsx` when mypage-owned) for store/cart/delivery.
- `app/admin/layout.tsx` (or under `components/admin`) for admin-only state.

Promotion toward `(main)` or root is allowed **only** after an exception entry (below).

### Hard rule — root exceptions need reason + measurement

If a change truly requires a new root-level client (or expanding root beyond the current baseline), add a subsection under **References** or extend this file with:

1. **Why** root is the only place (which routes break otherwise).
2. **Measurement** (before/after): `docs/dev-memory-runtime-separation.md` §4 table row, or linked PR notes — heap/rss, compile/HMR, or `next start` scenario.

### Hard rule — `MainAppProviderTree` is frozen for new domain providers

Do **not** add new domain-scoped providers to `components/layout/MainAppProviderTree.tsx`. New domain state belongs in that domain’s layout (or a colocated client wrapper imported only from that layout). Refactors that **split** existing providers out are allowed as dedicated steps with the same behavioral contracts.

## Domain runtime rules

| Domain | Intended segment | Mount rule |
|--------|------------------|------------|
| Community messenger | `/community-messenger/**` (and sub-layouts) | Presence, messenger bootstrap warm, room-scoped prefetch, in-app banner hosts that are messenger-only should mount **inside** this tree unless a **documented** cross-route invariant requires otherwise. |
| Store commerce | `/stores/**`, `/mypage/**` (if cart is required there) | Cart provider, store order sounds, delivery hero doc-root class toggles stay under store/mypage shells. |
| Trade | Trade surfaces (`/market`, `/post`, trade chat entry, etc.) | Trade presence and trade overlays mount only where heartbeat/overlay contracts require — not root. |
| Admin | `/admin/**` | `AdminShell` / `AdminGuard` only; **no** `(main)` `MainAppProviders`. Root must not pull messenger graph for admin-only work unless measured and justified. |

## Provider boundary rules

1. **One authority per concern** — e.g. bottom nav visibility stays `resolveConditionalAppShellFlags` (see `.cursor/rules/chat-detail-bottom-nav-authority.mdc`).
2. **New providers**: default to the **deepest** route segment that needs them; promote to `(main)` or root only with a short design note in this file or a linked RFC.
3. **RSC layouts** should prefetch only data that **all** children of that segment need; domain-specific server loads belong in nested layouts.

## Realtime runtime rules

- **Subscriptions** (Supabase channels, call signaling) start where the UX contract needs them; tear down on segment unmount when possible.
- **Duplicate global bridges** are forbidden (e.g. two participants listeners) — see comments on `MainShellMessengerParticipantBridge` vs `MessagingGlobalChrome`.
- **Community messenger message path** remains server-bump authority per `docs/messenger-realtime-policy.md` — boundary moves must not shift bump publication to the client.

## Compile graph rules

1. **Static imports** in `MainAppProviderTree` and root `layout` pull **transitive** TypeScript/JavaScript into the same client boundary graph for dev compilation — `dynamic()` only splits **subtrees that are not statically imported** by the parent.
2. **Barrel files**: avoid `export *` re-export hubs for heavy domains; import concrete modules.
3. **`@/` alias**: large alias surface is normal; mitigate by **segmentation** and fewer root/static edges.
4. **Dead imports** still force module evaluation — remove unused imports (e.g. verify `ConditionalAppShell` vs `CallIncomingChrome`).

## `dynamic` import — when it is allowed

- For **optional** UI islands (SSR off) where the **contract** is unchanged and the parent does not statically depend on heavy types from the child.
- **Not** as the only fix for root layout obesity: first move **mount** boundaries, then split chunks if needed.

## Route segment responsibilities

| Segment | Responsibility |
|---------|----------------|
| `app/layout.tsx` | Minimal shell; **no new** domain runtimes (baseline legacy mounts documented above until relocated with measurement). |
| `app/(main)/layout.tsx` | Shared main RSC data (e.g. bottom nav items, trade tab primes) and **thin** client entry to `MainAppProviders`. |
| `app/(main)/community-messenger/layout.tsx` | Messenger-only clients (prefetch, snackbar, media preflight, etc.). |
| `app/(main)/stores/**/layout.tsx` | Store/delivery-specific providers and chrome. |
| `app/admin/layout.tsx` | Admin-only shell; no `(main)` provider tree. |

## Global provider additions — hard gate

Before adding a provider to `app/layout.tsx` or wrapping all of `(main)`:

1. List **routes that must mount it** (exact path prefixes).
2. If the answer is not “literally every URL including `/admin` and auth pages”, **do not** put it in root.
3. Add a **measurement** note (heap/rss or compile time) to `docs/dev-memory-runtime-separation.md` table when dev behavior changes.

## Change process (no regressions)

1. Analyze mount graph (this doc + code comments).
2. Measure (`[dev-memory-watch]`, `dev:compare:*`, `next start` scenario in `docs/dev-memory-runtime-separation.md`).
3. Move boundaries without changing APIs/UI semantics.
4. Update this doc’s tables if invariants shift.

## References

- `docs/dev-memory-runtime-separation.md`
- `.cursor/rules/chat-detail-bottom-nav-authority.mdc`
- `.cursor/rules/samarket-perf-change-protocol.mdc` (when touching trade hot path / messenger shell performance contracts)
