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

Verified (unit + local runtime evidence 2026-08-10):

- **Community surface CASE 2:** topic-first IA (`showAllFeedTab=false` prod+local); ads follow `COMMUNITY_TOPIC:<slug>`; `COMMUNITY_HOME` only when All tab is ON
- Surface SSOT: `resolveCommunityFeedSurface` shared by chips / URL / posts / banner / `/api/feed-ads/active`
- Cadence: gaps ∈ **[6,10]** deterministic (`FeedAdSlotPolicy`); rerender/pagination stable; DB pagination has no ad rows
- Multi-advertiser: stable hash selector + anti-repeat when `eligible.length > 1`
- One member = one current banner: pending/active → second POST **409** / HOLD **0**; terminal → new create + HOLD **1**
- One campaign = **1–3** creatives; carousel = selected campaign only; 2–3 auto-slide
- Empty pool → component **null** (no reserved blank height)
- Financial SSOT unchanged: HOLD / CAPTURE / RELEASE / renew spend
- Creative URL sanitation KEEP; Native **ZERO**

### Intentional residual (NOT product FAIL / not this LOCK)

| Residual | Status |
|---|---|
| Legacy cleanup | Deferred |
| Analytics / Notification | Deferred |
| Native / Capacitor / Auth / Push | **ZERO CHANGE** |
| `COMMUNITY_HOME` as default user surface | **Not required** while All tab OFF (product IA) |

---

## 1. Locked product decisions (KEEP)

| Concern | Decision |
|---|---|
| Community surface | **Topic-first.** Primary = `COMMUNITY_TOPIC:<slug>`. `COMMUNITY_HOME` = user surface **only when** `showAllFeedTab=true` / empty·recommend-sort category. Do **not** flip `showAllFeedTab` for ads QA. |
| Surface authority | `lib/community/resolve-community-feed-surface.ts` — HOME/TOPIC **no cross-fallback** |
| Cadence | Gaps **6–10** content between ad slots — `lib/ads/feed-ad-slot-policy.ts`. **N=4 REOPENED.** No `Math.random()`. |
| Session seed | `feedSessionId` via `lib/ads/feed-ad-session.ts` (sessionStorage per surfaceKey; not remount-minted) |
| Selector | Stable hash + hour bucket + anti-repeat — `selectCampaignForPlacement`. **day-bucket-only REOPENED.** |
| Multi-advertiser | Many members’ campaigns share exact placement pool; slot picks **one** campaign |
| Member limit | One **current** campaign per member — `findCurrentFeedAdBanner` / `isFeedAdDisplayStatusBlockingNewCreate` |
| Creatives | 1 request → 1 campaign → **1–3** creatives. Member max-one REOPENED. |
| Carousel | Campaign selection ≠ creative slide mix. Same campaign only. |
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
| Campaign select | `selectCampaignForPlacement` (+ anti-repeat) | Day-bucket-only permanent winner; auction/weighting engine |
| Member create + HOLD | `POST /api/me/feed-ad-requests` + point-hold writers | Second current without 409; inventing prices outside `feed_ad_products` |
| Approve CAPTURE | `lib/ads/approve-feed-ad-request.ts` | Leaving ACTIVE without capture |
| Reject / cancel RELEASE | approve reject · `cancel-feed-ad-request.ts` | Double-release / silent skip of hold row |
| Renewal | `lib/ads/renew-feed-ad-campaign.ts` | Treating renew as new request without re-review when creative/destination change |
| Price / period | DB `feed_ad_products` | Dual CODE+DB runtime prices |
| Eligibility read | resolver (`active` + window + reachable creative) | Cron status flip solely for expiry |
| Feed active API | `GET /api/feed-ads/active` + slot/session seeds | Mixing advertiser creatives in one carousel |
| Admin creative replace | Admin detail PATCH path | Queue-only approve without persisted creative |

### Required migration (runtime)

- `supabase/migrations/20261024160000_feed_ad_request_idempotency.sql` (prior)

---

## 3. DO NOT (without explicit reopen)

- Flip `showAllFeedTab` solely to force `COMMUNITY_HOME` for ads tests
- Restore fixed **N=4** or **day-bucket-only** selection as product defaults
- Mix A/B/C advertisers’ images in one carousel
- Allow second current campaign without **409** / HOLD **0**
- Revert card-rhythm geometry to unbounded aspect-3:1 + contain hero strip
- Dual price authority (CODE + DB) for runtime catalog
- Mix Legacy cleanup / Analytics into this product commit stream
- Touch Native Cap / Auth / Push / Badge as part of Feed Banner
- Hollow product PASS by deleting runtime evidence references
- Raw `point_ledger` INSERT / balance patch bypassing `adjustUserPoints` / hold writers

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
