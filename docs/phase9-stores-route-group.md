# Phase 9 — `(stores)` route group (hub only)

## Goal

Reduce `/stores` first paint by avoiding `(main)/layout` server `getHomeTradeChipCategoriesForServer()` await and slimming client provider hydrate for the hub.

## Routes

| URL | Layout chain |
|-----|----------------|
| `/stores` | `app/(stores)/layout` → `app/(stores)/stores/layout` → page |
| `/stores/*` (slug, cart, owner, …) | `app/(main)/layout` → `app/(main)/stores/...` (unchanged) |

## Server

- `measureStoresHubLayoutServerLoads()` — bottom nav only (`cm-room-r2-m11c-layout-server-timers.ts`)

## Client

- `StoresHubMainAppProviders` — `MainAppProviderTree` with `layoutProfile="storesHub"`
- Skips: `TradeTabCategoriesServerPrime`, `TradePresenceActivityProvider`, trade write/chat lazy overlays, `GlobalIncomingFriendRequestHost`

## Measure (go/no-go ≥200 ms)

```bash
npm run build && npm run start
node scripts/measure-stores-home-network-10s.mjs
```

Compare `first_shell_ms`, `first_category_visible_ms` (3 cold runs).

## Page marker

`data-stores-layout-profile="stores-hub"` on `/stores` root div.
