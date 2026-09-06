# ADS / EXPOSURE REAL OPERATION RECONSTRUCTION — FINAL

**Date:** 2026-09-06  
**Scope:** Ads / Exposure only (Finance/Support/System out of scope)  
**Verdict:** `ADS OPERATOR READY = FAIL` · `HARD LOCK = NOT LOCKED`

## CURRENT (this run)

### Implemented (CODE)

| Area | Evidence |
|---|---|
| Route authority inventory | `docs/perf/admin-ads-reconstruction/ROUTE-AUTHORITY-INVENTORY.md` |
| Product contract + legacy audit | `ADS-PRODUCT-CONTRACT.md`, `LEGACY-ADS-AUDIT.md` |
| Shared presentation | `lib/admin/ads-operator/ads-operator-presentation.ts` |
| Occupancy / vacancy (no new capacity DB) | `placement-occupancy.ts` → control plane + Placement Map |
| Nav MERGE | Ads children; legacy → `promoted-items` only; community Ads entry → redirect path |
| Legacy URL MERGE | `/admin/post-ads`, `/admin/ad-products`, `/admin/banners` redirect; community applications → `/admin/community/promotions` |
| Feed operator list + filters | `AdminFeedAdsListPage` ops/test/history filters |
| Feed pause/resume CTA→writer→eligibility | `pause-resume-feed-ad-campaign.ts` + PATCH + detail UI; paused ≠ feed eligible |
| Popup single create CTA + queue language | `AdminPlatformPopupHubPage` |
| Popup source limit (evidence: optimize→1440×1000) | `POPUP_CREATIVE_SOURCE_MAX_BYTES=8MB` (notif campaign 2MB unchanged) |
| Placement Map operator surface | human labels + occupancy; Runtime:Y primary removed; tech under details |
| HOME/CATEGORY boundary copy | organic/slot gate vs Ads ops banners |
| Canonical lifecycle labels | `ads-canonical-lifecycle.ts` (Feed paused parity) |
| Storage policy notes | `ads-creative-storage-policy.ts` |
| Unit tests | `ads-operator-occupancy-lifecycle.test.ts` PASS; B7 menu + p1-3 PASS |

### First divergence (blocks PASS)

1. **Production P1–P24 + visual QA = NOT_PROVEN** — this run did not execute authenticated Production Admin/Customer/renderer proof. Screenshots alone would not count; none were taken this run.
2. **Paid extend money policy incomplete** — Feed renew exists; Delivery/Popup **PAID EXTENSION / COMPENSATION / FREE** operator UI with cost+payment+history not fully wired end-to-end for all products.
3. **Delivery “숨김”** — still maps to pause/end language; no separate hide mutation (documented PRODUCT language, not a second writer).
4. **Customer parity** — Feed pause/resume presentation aligned; Owner Delivery/Popup full 22-question parity across all surfaces not re-proven in Production.

### Owner A–V (honest)

| Key | Result |
|---|---|
| A Completion 22Q | FAIL — not Production-proven for one real ad |
| B MERGE | PARTIAL CODE — redirects + nav; writers frozen only where redirected |
| C Product≠Placement | CODE PASS (presentation) |
| D Placement Map | CODE PASS (operator-first); PROD NOT_PROVEN |
| E CTA chain | PARTIAL — Feed pause/resume/end + Delivery existing; extend money incomplete |
| F Delete | CODE — hard delete not primary on reconstructed surfaces |
| G Customer parity | PARTIAL CODE — Feed paused; full Admin↔Customer all products NOT_PROVEN |
| H Popup upload | CODE PASS (8MB source + pipeline); PROD size evidence NOT_PROVEN |
| I Creative replace | POLICY documented; orphan scan PROD NOT_PROVEN |
| J Preview honesty | PARTIAL — map labeled thumbnail / 노출 예시 language |
| K Ops defaults | CODE — Feed/Delivery history vs actionable |
| L Error integrity | CODE — occupancy unavailable ≠ vacant 0 |
| M Pre-approve safety | PARTIAL — collision/occupancy on CP; full approve gate PROD NOT_PROVEN |
| N Extension money | FAIL / GAP |
| O History | PARTIAL — domain audits exist; no fake timeline invented |
| P Production proof | **NOT_PROVEN** |
| Q Preserve canonical | PASS — no new Ads engine |
| R Continuity | This report is FINAL STOP |
| S Final re-audit | CODE search done this run; residual gaps listed above |
| T Authority matrix | See below |
| U Re-judge A–Z | FAIL on Production + extend money |
| V Binary | **FAIL · NOT LOCKED** |

### Authority matrix (T)

| PRODUCT | APPLICATION | PAYMENT | CREATIVE | PLACEMENT | SCHEDULE | EXECUTION | ELIGIBILITY | RENDERER | ADMIN MUTATION | CUSTOMER STATUS | HISTORY |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Delivery Cash | delivery applications | Cash | delivery creatives | delivery inventory | campaign window | store_*_ad_campaigns | delivery gates | stores discovery | delivery-ads actions | Owner delivery ads UI | delivery audit |
| Feed Point banner | feed_ad_requests | Point HOLD/CAPTURE | feed creatives | feed placements | campaign window | feed_ad_campaigns | status=active+window | feed slot selector | feed-ad-requests PATCH (+pause/resume) | member feed presentation | request/campaign |
| Platform Popup | owner requests | Cash | popup pipeline | popup surfaces | campaign window | platform_popup_campaigns | popup eligibility | popup renderer | popup actions/transition | Owner popup | popup audit |
| Trade/Community Promote | point_promotion_orders | Point | N/A (post) | boost/pin | order window | promotion orders | promote eligibility | feed/community | promote order PATCH | member promote UI | order history |

Chat paid advertising: **NOT SUPPORTED**.

### Tests this run

- `vitest` ads-operator occupancy/lifecycle + B7 menu + p1-3: **PASS**
- Placement map hard lock verify: run separately in ship gate

### Production P1–P24

**ALL NOT_PROVEN** (no Production session this run).

---

## STOP

No auto next phase. Next required: Production authenticated P1–P24 + visual (desktop/1024/768) after `git push origin main` deploys, then re-judge A–V with PROD evidence. Extend-money CTA must close before claiming PASS.
