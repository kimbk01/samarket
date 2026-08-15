# Trade National LGU (PSGC) — N0/N1/N2 data

## Authority

- **National LGU SSOT**: PSGC City / Municipality (`trade_national_lgu`)
- **Local Area taxonomy**: `lib/products/regions-data.ts` (unchanged)
- These are **not** the same taxonomy

## Provenance

See `PROVENANCE.json`. Source is PSA PSGC (via `@jobuntux/psgc@0.2.1` 2025-2Q packaging).
Barangays are **not** vendored / not selectable.

## Build

```bash
node scripts/trade/build-psgc-trade-national-lgu.mjs
```

Outputs:

- `lgu-projection.json`
- `legacy-alias-map.json` (includes legacy 29 + display aliases)
- `local-area-map.json` (143 local Area → PSGC)
- `build-report.json`

## DB import (after schema migration; not production-applied in N0-N2 gate)

```bash
node scripts/trade/import-psgc-trade-national-lgu-to-db.mjs
```

Does **not** rewrite `posts.region` / `posts.city` and does **not** backfill `posts.trade_lgu_id`.
