# DIBAY Delivery — Store Address / Service Area FINAL SSOT HARD LOCK

**Status:** PRODUCTION CLOSED · HARD LOCK  
**Declared:** 2026-09-17  
**Owner accepted:** YES  
**Evidence audit:** `.tmp/delivery-ssot-final-close/FINAL_LOCK_AUDIT.json`

## Meaning of HARD LOCK (this domain)

HARD LOCK means:

- Incomplete / historical data **cannot** enter **orderable Delivery authority**
- Canonical invariants are **enforced going forward**
- It does **not** mean every historical row is filled

```text
null-geo store          → not orderable (missing_store_coords)
unresolved member LGU   → V2 missing_lgu_identity fail-closed
delivery_available=true → requires canonical stores.lat/lng
```

## Functional baseline (LOCKED)

| Gate | Status |
|---|---|
| ACTIVE STORE GEO FUNCTIONAL | LOCKED |
| MASTER LGU FUNCTIONAL PREVENTION | LOCKED |
| R+10 / Owner·Admin selector / selected-ID parity | LOCKED |
| Customer cart retain / regional popup / checkout block | LOCKED |
| CUT1 `afterCanonicalStoreLocationWrite` | LOCKED |
| CUT2 `evaluateDeliveryServiceArea` dual-mode | LOCKED |
| HOME old-location authority | NONE (live revalidation) |
| Multi-instance stale eligibility | IMPOSSIBLE_BY_LIVE_REVALIDATION |
| LEGACY_RADIUS current missing-LGU blocker | 0 |
| Runtime shadow authority | NONE |

Delivery lock commits (ancestors; later HEAD may include unrelated work):

- `47db5c1c1` — fail-close orderable discovery when store origin geo missing
- `c2c018b0a` — persist resolvable LGU on master promote; delivery-eta LGU align

## Operational pending (does NOT unlock HARD LOCK)

| Item | Count | Rule |
|---|---|---|
| Store geo Owner pin confirmation | 9 | orderable=0 until pin; cannot re-enable delivery without geo |
| V2 activation readiness | 20 | city missing 16 + ambiguous 4; only on `regional_lgu` conversion |

## Historical / data-completion (does NOT unlock HARD LOCK)

| Item | Count | Rule |
|---|---|---|
| MASTER_MISSING_LGU | 60 | CURRENT REGIONAL_LGU=0 → not live eligibility defect; no bulk backfill |
| STORE_MISSING_GEO_RAW | 13 | includes non-orderable; not functional blocker |

## Forbidden follow-ups (without Owner product FAIL)

- Re-audit full Delivery address/service-area SSOT because of the 9 pins or 20 V2-readiness rows
- Bulk geocode / city-centroid / guessed coords
- Bulk backfill of 60 `canonical_lgu_id`
- Treat shop-linked Production mutation demo absence as functional divergence
- Treat missing Vercel `githubCommitSha` meta as product divergence
- Convert stores to `regional_lgu` without keeping `missing_lgu_identity` fail-closed

## Allowed later work

- Owner/Admin map-pin for the 9 stores (data completion → re-enter Delivery)
- Touch-repair resolvable LGU on normal address writes (already forward-hardened)
- On **future** V2 store activation: keep fail-closed for unresolved member LGU; treat the 20 as activation readiness only

## Change gate

Any change that touches store location, service-area authority, member delivery routing LGU, HOME/Browse/Search eligibility, cart regional popup, or checkout/order serviceability:

1. Assume this HARD LOCK holds
2. Prove **regression only** on the touched invariant
3. Do **not** reopen broad Delivery SSOT redesign / full matrix unless Owner declares PRODUCT FAIL first divergence

Production cutover remains: `git push origin main` → Vercel Git Integration only.
