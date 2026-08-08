# DIBAY Manner Battery — Final SSOT

**Policy version:** `manner_trade_v1`  
**Status:** MANNER BATTERY PRODUCT PASS — HARD LOCK (Production Closeout 2026-08-08)  
**HARD LOCK:** ONE ledger · ONE policy · ONE calculator · ONE snapshot · ONE writer · ONE reader

## Domain lock (do not invent weights)

```
TRADE       ACTIVE
COMMUNITY   INACTIVE / architecture ready
DELIVERY    INACTIVE / architecture ready

NO DATA != BAD TRUST
REPORT CREATED != PENALTY
STORE RATING != MEMBER MANNER
ORDER VOLUME != MEMBER MANNER
```

## Definition

DIBAY Manner Battery is a **0–100%** member trust indicator based on verified trust-related behavior across Trade, Community, and Delivery member surfaces.

It is **not** popularity, post/like volume, order volume, D-Point, Business Credit, store/food ratings, or ad spend.

- **Neutral (no evidence):** `50`
- **Range:** `0..100`
- **UI label:** Manner Battery `%` (not temperature °C)

## 3-domain architecture

| Domain | Architecture | Scoring v1 |
|---|---|---|
| Trade | supported | **ACTIVE** — verified completion + reviews |
| Community | supported | **INACTIVE** — no verified positive/confirmed-sanction writers yet |
| Delivery | supported | **INACTIVE** — no confirmed member-abuse / commitment events yet |

**NO DATA ≠ BAD TRUST.** Inactive domains do not invent weights (no 50/25/25) and do not penalize members.

Store reputation remains **separate** from member Manner Battery.

## Eligible events (v1 scoring)

| Event | Direction | Notes |
|---|---|---|
| `trade_completed` | positive | Only after seller done + buyer confirm |
| `trade_review_good` | positive | Counterparty review |
| `trade_review_normal` | neutral | History only — no score direction |
| `trade_review_bad` | low negative | Not a confirmed policy violation |
| `manual_adjustment` | ops | Admin delta with provenance; absolute overwrite forbidden |

## Excluded (never score-eligible)

- `report_created` / pending report / `dispute_hold`
- Community post / comment / like / view / reaction volume
- Delivery order completed / cancelled / order count
- Store rating / food rating / delivery quality rating

**Report created ≠ penalty.** Pending report legacy `-5` is **IGNORE_FROM_BACKFILL**.

## Authorities

| Concern | Authority |
|---|---|
| History | `trust_events` (immutable; reverse via `status=reversed`) |
| Policy | `trust_score_policy` + `lib/trust/manner-battery-policy-v1.ts` |
| Calculator | `lib/trust/manner-battery-calculator.ts` |
| Projection | `member_trust_snapshots` |
| Writer | `recordTrustEvent` / `reverseTrustEvent` only |
| Reader | `member_trust_snapshots` (bridge: `profiles.trust_score` read-compat only) |

## Calculator (`bounded_evidence_ratio`)

```
pos = trade_completed + trade_review_good
neg = trade_review_bad
score = clamp(
  50
  + 50 * (pos - 0.5 * neg) / (pos + 0.5 * neg + 5)
  + Σ manual_adjustment.adjustment
, 0, 100)
```

Params (product-justified, not legacy magic copy):

- `amplitude=50`, `prior=5`, `bad_weight=0.5`
- Window: **365 days**; recency multiplier v1 = **1.0** (no ×1.5)
- Same ledger + policy + as_of → same score

## Idempotency

DB `UNIQUE(idempotency_key)`:

- `trade_completed:{productChatId}:{memberId}`
- `trade_review:{reviewId}:{targetMemberId}`
- `manual_adjustment:{adjustmentId}:{memberId}`

## Reversal

Do not DELETE events or UPDATE deltas/old scores. Set `status=reversed` (+ metadata) and recompute snapshot.

## Legacy classification

| Surface | Status |
|---|---|
| `profiles.trust_score` | **DEPRECATED / DROP_LATER** — bridge sync after snapshot only (not authority) |
| `profiles.manner_score` / `manner_temperature` | **DEPRECATED / DROP_LATER** — read fallback only |
| `reputation_logs` | **DEPRECATED / DROP_LATER** — backfill source; no new score writers |
| `TRUST_EVENT_DELTAS` / ×1.5 / report=-5 | **REMOVED** from authority |
| `applyTrustScoreDelta` | **REMOVED** (throws) |

DB column/table DROP is **not** part of this Closeout.

## Future activation

Raise `policy_version` when Community/Delivery have verified moderation/trust events. Do not invent scores before events exist.

## Code map

- Migration: `supabase/migrations/20260808145000_manner_battery_trust_ssot.sql`
- Backfill: `supabase/migrations/20260808145100_manner_battery_trust_events_backfill.sql`
- Recompute: `scripts/manner-battery-recompute-snapshots.ts`
- Policy / calculator / ledger / read: `lib/trust/manner-battery-*.ts`, `trust-event-ledger.ts`, `member-trust-read.ts`
