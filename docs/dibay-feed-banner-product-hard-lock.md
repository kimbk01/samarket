# DIBAY Feed Banner Product HARD LOCK

**Status:** FEED BANNER PRODUCT HARD LOCK  
**Locked at:** 2026-08-09  
**Product verdict:** `FEED BANNER PRODUCT PASS` / `FINAL FIRST BREAK: NONE`  
**Repo commit:** `e04be170d` (`e04be170df03dc668b4f9b6b1e69428906166815`)  
**Production deploy:** `dpl_2cborGNhuh9A9tCn1SoUQyvLjMzB`  
**Production URL:** `https://samarket-argkrxdvg-kimbk01s-projects.vercel.app`  
**Production alias:** `https://samarket.vercel.app` (inspect Ready → above deployment)  
**Companion rule:** `.cursor/rules/dibay-feed-banner-product-hard-lock.mdc`  
**Master contract:** `docs/dibay-paid-exposure-feed-ad-master-contract.md`  
**FINAL E2E evidence:** `.qa-logs/feed-banner-final-e2e-20260809/REPORT.json`

This document freezes Feed Banner **product decisions / financial authority / eligibility / geometry / native boundary**.  
It does **not** claim Analytics, Notification, Legacy cleanup, or Native Cap changes.

---

## 0. Program status at LOCK

| Stage | Status |
|---|---|
| Phase 1 financial (HOLD/CAPTURE/RELEASE/idempotency/CODE price) | **CLOSED / PASS** |
| Phase 2 member hub + admin detail/replace + cancel | **CLOSED / PASS** |
| Phase 3 eligibility + renewal + geometry OPTION B | **CODE CLOSED / PASS** |
| FINAL E2E A–F (Community/Trade DOM, reject/release, replace, expire, renew) | **PASS** |
| HARD LOCK | **THIS DOCUMENT** |

### Product PASS scope (what YES means)

Directly verified PASS (API + DOM remasure against localhost QA; product code unchanged after remasure):

- Community / Trade mid-slot feed exposure (`feedId` = MEMBER_REQUESTED campaigns)
- Reject → hold `released` + balance restore path
- Admin creative replace → live Creative URL on feed
- Eligibility resolver: `status=active` AND `start_at ≤ now` AND `end_at > now` (expired surfaces as ended / not eligible)
- Renewal: same campaign, `point_ledger` spend, `end_at` extends; changed creative/destination → `re_review_required`
- Static gates at close: lint · `tsc --noEmit` · ads vitest (42) · `verify:i18n-key-exposure` · `npm run build`

### Intentional residual (NOT product FAIL / not this LOCK)

| Residual | Status |
|---|---|
| Legacy cleanup | Deferred — independent track |
| Analytics | Deferred |
| Notification | Deferred |
| Playwright `member-feed-ad-banner-ui.spec.ts` refresh | Stale vs Phase 2 Detail CTAs; FINAL used API+DOM probe |
| Native / Capacitor / Auth / Push | **ZERO CHANGE** — out of scope |

---

## 1. Locked product decisions (KEEP)

| Concern | Decision |
|---|---|
| Slot | **N=4 KEEP** — `FEED_AD_SLOT_AFTER_CONTENT_COUNT` / `shouldInjectFeedAdAfterContentIndex` |
| Rotation | **day-bucket KEEP** — `selectCampaignForPlacement` |
| Geometry | **REOPENED 2026-08-09 (Card-rhythm correction)** — source 1200×400; runtime **fixed list-thumb height + object-cover** (Community 72→88 / Trade 100). Former unbounded aspect 3:1 + contain (hero strip) superseded. |
| Price/period | **REOPENED 2026-08-09** — runtime SSOT = DB `feed_ad_products` (Admin writer). CODE seed = deploy reference only. Request still snapshots `duration_days`/`point_cost`. |
| Eligibility | Resolver-only; no cron status writer to flip expired campaigns |
| Financial | HOLD → CAPTURE on approve; RELEASE on reject/cancel; renew = ledger spend (not second hold) |
| Native | **ZERO CHANGE** |

### Product boundary (do not merge)

- **A** Post promotion (`point_promotion_orders`) — not banner work  
- **B** Feed Banner (`feed_ad_requests` / creatives / campaigns / holds) — this LOCK  
- **C** Admin Direct (`source=ADMIN_DIRECT`) — keep separate from member paid requests  

---

## 2. Authority LOCK (SSOT)

| Concern | Owner (final) | Forbidden without reopen |
|---|---|---|
| Member create + HOLD | `POST /api/me/feed-ad-requests` + point-hold writers | Capture-before-persist; inventing prices outside `feed_ad_products` |
| Approve CAPTURE + campaign activate | `lib/ads/approve-feed-ad-request.ts` | Leaving ACTIVE without capture; skipping compensate on post-capture failure |
| Reject / cancel RELEASE | approve reject path · `cancel-feed-ad-request.ts` | Double-release / silent skip of hold row |
| Renewal | `lib/ads/renew-feed-ad-campaign.ts` + `POST .../renew` | Treating renew as new request without re-review when creative/destination change |
| Price / period | DB `feed_ad_products` via Admin PATCH + `lib/ads/feed-ad-products.ts` readers | Dual CODE+DB runtime prices; rewriting past request snapshots |
| Eligibility read | placement/campaigns-db resolver (`end_at > now`) | Cron that rewrites campaign status solely for expiry |
| Feed injection | Community / Trade list slot helpers (N=4) | Changing slot interval / inventing second creative viewport without reopen |
| Admin creative replace | Admin detail PATCH path | Queue-only approve without persisted creative review |

### Required migration (runtime)

- `supabase/migrations/20261024160000_feed_ad_request_idempotency.sql`

---

## 3. DO NOT (without explicit reopen)

- Reopen Phase 1/2 financial writers “for cleanup”
- Change slot N or day-bucket rotation
- Revert card-rhythm fixed-height + cover back to unbounded aspect-3:1 + contain hero strip without measured reopen
- Dual price authority (CODE constants + DB) for runtime catalog
- Mix Legacy cleanup / Analytics into this product commit stream
- Touch Native Cap / Auth / Push / Badge as part of Feed Banner
- Claim Playwright UI e2e PASS from the stale member banner UI spec
- Hollow product PASS by deleting FINAL evidence references

---

## 4. Close-out evidence (ops)

| Step | Result |
|---|---|
| Ads-only commit | `e04be170d` on `main` |
| Push | `origin/main` @ `e04be170d` |
| Production deploy | clean worktree `scripts/deploy-prod-clean-worktree.sh e04be170d` → `dpl_2cborGNhuh9A9tCn1SoUQyvLjMzB` |
| Alias | `https://samarket.vercel.app` → Ready on that deployment |

---

## 5. Reopen criteria

Only with explicit user approval naming this LOCK:

1. Financial writer / hold semantics change  
2. Slot / rotation / geometry product redesign  
3. Eligibility cron writer  
4. Native surface for banner ads  
5. Merging Product A/C into B or deleting deferred tracks as “same PASS”
