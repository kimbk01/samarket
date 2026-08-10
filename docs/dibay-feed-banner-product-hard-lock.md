# DIBAY Feed Banner Product HARD LOCK

**Status:** FEED BANNER PRODUCT HARD LOCK  
**Locked at:** 2026-08-10 (product contract reopen close)  
**Prior LOCK:** 2026-08-09 (`e04be170d`) — superseded by this document for slot/selection/surface/creative  
**Product verdict:** `PRODUCT CONTRACT CHANGE RUNTIME: PASS` / `FIRST BREAK: NONE`  
**Companion rule:** `.cursor/rules/dibay-feed-banner-product-hard-lock.mdc`  
**Master contract:** `docs/dibay-paid-exposure-feed-ad-master-contract.md`  
**Runtime evidence:** `.qa-logs/feed-banner-runtime-evidence-20260810/REPORT.json` · `R6-FINAL.json`

This document freezes Feed Banner **product decisions / surface / cadence / selector / member limit / creatives / financial authority / sanitation / native boundary**.  
It does **not** claim Analytics, Notification, Legacy cleanup, or Native Cap changes.

---

## 0. Program status at LOCK

| Stage | Status |
|---|---|
| Phase 1 financial (HOLD/CAPTURE/RELEASE/idempotency) | **CLOSED / PASS** — unchanged |
| Phase 2 member hub + admin detail/replace + cancel | **CLOSED / PASS** — unchanged |
| Phase 3 eligibility + renewal + geometry card-rhythm | **KEEP** |
| Product contract reopen (surface / 6–10 cadence / multi-advertiser / 1–3 creatives / anti-repeat) | **RUNTIME PASS** |
| HARD LOCK | **THIS DOCUMENT** |

### Product PASS scope (what YES means)

Verified (unit + local runtime evidence 2026-08-10; **surface/cadence/slot-items reopen 2026-08-10 SSOT connect**):

- **Community surface:** ALL (latest|popular) → `COMMUNITY_HOME`; TOPIC → `COMMUNITY_TOPIC:<slug>`; LOCAL → no Feed Banner
- **ALL candidate pool:** `COMMUNITY_HOME` campaigns + all active `COMMUNITY_TOPIC` campaigns → existing rotation
- **TOPIC candidate pool:** matching `COMMUNITY_TOPIC` only (no cross-topic; no HOME bleed)
- Surface SSOT: `resolveCommunityFeedSurface` shared by chips / URL / posts / banner / `/api/feed-ads/active`
- Cadence: gaps ∈ **[4,6]** deterministic (`FeedAdSlotPolicy`); rerender/pagination stable; DB pagination has no ad rows
- Slot items: up to **3 distinct campaigns** per slot (`selectCampaignsForPlacement`); creative 1–3 remains per-campaign metadata
- Multi-advertiser: stable hash selector + anti-repeat when `eligible.length > 1`
- One member = one current banner: pending/active → second POST **409** / HOLD **0**; terminal → new create + HOLD **1**
- Empty pool → component **null** (no reserved blank height)
- Financial SSOT unchanged: HOLD / CAPTURE / RELEASE / renew spend
- Creative URL sanitation KEEP; Native **ZERO**

### Intentional residual (NOT product FAIL / not this LOCK)

| Residual | Status |
|---|---|
| Legacy cleanup | Deferred |
| Analytics / Notification | Deferred |
| Native / Capacitor / Auth / Push | **ZERO CHANGE** |
| Local nav banner | **No** — Local does not sell / does not inherit HOME banner |

---

## 1. Locked product decisions (KEEP)

| Concern | Decision |
|---|---|
| Community surface | **ALL** (latest\|popular) → `COMMUNITY_HOME`. TOPIC → `COMMUNITY_TOPIC:<slug>`. **LOCAL → no Feed Banner**. |
| ALL candidate pool | HOME + all active TOPIC campaigns → `selectCampaignsForPlacement` |
| TOPIC candidate pool | Matching TOPIC only |
| Surface authority | `lib/community/resolve-community-feed-surface.ts` |
| Cadence | Gaps **4–6** content between ad slots — `lib/ads/feed-ad-slot-policy.ts`. No `Math.random()`. |
| Session seed | `feedSessionId` via `lib/ads/feed-ad-session.ts` (sessionStorage per surfaceKey; not remount-minted) |
| Selector | Stable hash + hour bucket + anti-repeat — `selectCampaignsForPlacement` (max 3 / slot). **day-bucket-only REOPENED.** |
| Multi-advertiser | Slot may show up to **3 distinct campaigns** L→R |
| Member limit | One **current** campaign per member — `findCurrentFeedAdBanner` / `isFeedAdDisplayStatusBlockingNewCreate` |
| Creatives | 1 request → 1 campaign → **1–3** creatives (per-campaign). Slot items ≠ creative slides. |
| Empty pool | `null` / height 0 |
| Geometry | Card-rhythm KEEP (Community 72~88 / Trade 100 fixed + cover). Not hero 3:1. |
| Financial | HOLD → CAPTURE on approve; RELEASE on reject/cancel; renew = ledger spend |
| Sanitation | Production-reachable HTTPS creatives only |
| Native | **ZERO CHANGE** |

### Product boundary (do not merge)

- **A** Post promotion (`point_promotion_orders`) — not banner work  
- **B** Feed Banner (`feed_ad_requests` / creatives / campaigns / holds) — this LOCK  
- **C** Admin Direct (`source=ADMIN_DIRECT`) — keep separate from member paid requests  

---

## 2. Authority LOCK (SSOT)

| Concern | Owner (final) | Forbidden without reopen |
|---|---|---|
| Community surface | `resolveCommunityFeedSurface` + feed `category` state | Banner from URL-only while posts use divergent category; HOME↔TOPIC campaign fallback |
| Cadence | `planFeedAdSlots` / `shouldInjectFeedAdAtContentIndex` | Fixed N=4; `Math.random()` gaps; ads in DB page rows |
| feedSessionId | `getOrCreateFeedAdSessionId(surfaceKey)` | New id every mount; new global session platform |
| Campaign select | `selectCampaignsForPlacement` (+ anti-repeat, max 3) | Day-bucket-only permanent winner; auction/weighting engine; `Math.random()` |
| Member create + HOLD | `POST /api/me/feed-ad-requests` + point-hold writers | Second current without 409; inventing prices outside `feed_ad_products` |
| Approve CAPTURE | `lib/ads/approve-feed-ad-request.ts` | Leaving ACTIVE without capture |
| Reject / cancel RELEASE | approve reject · `cancel-feed-ad-request.ts` | Double-release / silent skip of hold row |
| Renewal | `lib/ads/renew-feed-ad-campaign.ts` | Treating renew as new request without re-review when creative/destination change |
| Price / period | DB `feed_ad_products` | Dual CODE+DB runtime prices |
| Eligibility read | resolver (`active` + window + reachable creative) | Cron status flip solely for expiry |
| Admin queue filter/count | `projectFeedAdOpsProductStatus` (campaign status + window) | Raw `feed_ad_requests.status=active` as “광고중” |
| Campaign end → request | `endFeedAdCampaign` + `syncFeedAdRequestEndedWithCampaign` | Ending campaign without syncing linked request |
| Feed active API | `GET /api/feed-ads/active` + slot/session seeds | Mixing advertiser creatives in one carousel |
| Admin creative replace | Admin detail PATCH path | Queue-only approve without persisted creative |

### Required migration (runtime)

- `supabase/migrations/20261024160000_feed_ad_request_idempotency.sql` (prior)
- `supabase/migrations/20261026120000_purchase_member_community_promotion.sql` — Community Top-Pin atomic TX

---

## 3. DO NOT (without explicit reopen)

- Flip `showAllFeedTab` solely for ads tests unrelated to ALL→COMMUNITY_HOME contract
- Restore gaps **6–10** or day-bucket-only selection as product defaults
- Bypass 409 / invent second current HOLD
- Revert creative to unbounded aspect-3:1 + object-contain hero strip
- Dual CODE+DB runtime prices
- Mix Legacy cleanup / Analytics into this product commit stream
- Touch Native Cap / Auth / Push / Badge as part of Feed Banner
- Hollow product PASS by deleting runtime evidence references
- Raw `point_ledger` INSERT / balance patch bypassing `adjustUserPoints` / hold writers
- Put ads into DB pagination rows
- Topic feed showing other-topic or inventing multi-topic schema

---

## 4. Close-out evidence (ops)

| Step | Result |
|---|---|
| Runtime evidence | `.qa-logs/feed-banner-runtime-evidence-20260810/` (R1–R7 / R6-FINAL) |
| Ads commit | `b0359b90b` — `feat(ads): reopen feed banner cadence, surface SSOT, multi-advertiser` |
| Push | `origin/main` @ `b0359b90bd0e50a351aa6b485257017dfaf7fe7d` |
| Production deploy | `dpl_EG56Virz2MPdgJXtXLpg4E5qvw6D` (clean worktree @ `b0359b90b`) |
| Alias | `https://samarket.vercel.app` → same deployment |
| SHA align | `HEAD == origin/main == deploy SHA` (`b0359b90b`) |
| Production smoke | **PASS** — `.qa-logs/feed-banner-prod-smoke-20260810/REPORT.json` · `SMOKE.json` · `FIRST BREAK: NONE` |

---

## 5. Reopen criteria

Only with explicit user approval naming this LOCK:

1. Financial writer / hold semantics change  
2. Cadence / selector / surface / creative-count product redesign  
3. Forcing Community All-tab / HOME as default user IA for ads  
4. Eligibility cron writer  
5. Native surface for banner ads  
6. Merging Product A/C into B or deleting deferred tracks as “same PASS”
