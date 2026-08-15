# DIBAY Customer Center Content HARD LOCK

**Status:** HARD LOCK DECLARED  
**Locked at:** 2026-08-12  
**Companion rule:** `.cursor/rules/dibay-customer-center-content-hard-lock.mdc`

Freezes Customer Center 3-board Content / Campaign delivery / View / Comment / Bell destination authority after Production P7 close.

---

## 0. Program status at LOCK

| Concern | Status |
|---|---|
| HEAD = ORIGIN/MAIN = PRODUCTION | **PASS** (`5e7acb2c9`) |
| Deployment | `dpl_8WCN92S2Te15Fnb1TFLeU3TYgRbo` · `https://samarket.vercel.app` |
| Migration `20261030120000_app_notices_customer_center_content_ssot.sql` | **PASS** (OWNER applied) |
| Migration `20261030130000_customer_center_views_comments.sql` | **PASS** (OWNER applied) |
| Migration `20261030140000_fix_customer_center_view_rpc_ambiguous.sql` | **PASS** (OWNER applied; Cursor must not re-apply) |
| View RPC (no ambiguous `view_count`) | **PASS** |
| View dedupe (member/content/Seoul-day) | **PASS** |
| Read ≠ View | **PASS** |
| NOTICE Push + In-App | **PASS** |
| SYSTEM Push + In-App | **PASS** |
| MARKETING Push + In-App | **PASS** |
| Push/Bell same destination × 3 | **PASS** |
| Copy SSOT (board full ≠ campaign short; auto-truncate 0) | **PASS** |
| Comments × 3 | **PASS** |
| MyPage single Customer Center entry | **PASS** |
| Badge writer regression (new writers) | **0** |
| CTA authority | **PASS** |
| HARD LOCK | **DECLARED** |
| FINAL | **CLOSED** |

Evidence: `.qa-logs/customer-center-p7-close-1786542864402/` · `.qa-logs/customer-center-p7-close-1786543011018/` · `.qa-logs/customer-center-p7-rescore-1786543163007/REPORT.json`

---

## 1. Authority LOCK

| Concern | Owner |
|---|---|
| Content original | `app_notices` (ONE AUTHORITY) — notice / system / marketing |
| Board UI | 3 independent PATH boards under `/mypage/customer-center/{type}` |
| Board copy | `Content.title` / `Content.body` |
| Delivery copy | `Campaign.title` / `Campaign.body` |
| Auto truncate | **FORBIDDEN** |
| Content hero | Content SSOT (`hero_image_url`) |
| Push / In-App image | Campaign delivery assets |
| Campaign | Delivery policy only |
| Occurrence | Immutable send-time snapshot (+ `content_id` / `content_type` / `canonical_route`) |
| Bell | `notification_events` |
| Bell read | `notification_events.unread` / `read_at` |
| View | `record_customer_center_content_view` |
| View dedupe | member / content / Seoul-day |
| Comment | Customer Center comment authority (not `community_comments`) |
| Push destination | Canonical board detail |
| Bell destination | Same canonical board detail |
| Badge | Existing Notification / App Icon authority only |
| MyPage support | Single Customer Center entry |
| Legacy | Bridge only until caller zero (`/mypage/notices/[id]`, settings notices list) |

Canonical routes:

- `/mypage/customer-center/notice/{contentId}`
- `/mypage/customer-center/system/{contentId}`
- `/mypage/customer-center/marketing/{contentId}`

---

## 2. DO NOT (without reopen)

- Re-apply / recreate Customer Center content/view migrations or invent DB function patches
- Parallel Content table / rename away from `app_notices` as Content SSOT
- Auto-truncate board body into Campaign copy
- Mix board original into Push/Bell delivery copy
- Different Push vs Bell destinations for content-bound campaigns
- Treat Notification Read as Content View (or the reverse)
- Route Customer Center comments through `community_comments`
- Invent new Bell / App Icon badge writers for views or comments
- Restore MyPage flat duplicate support rows (공지/문의/쪽지) as peer entries beside Customer Center
- Call residual device-tray UX “FAIL” when delivery `push.status=sent` is proven and VoIP token skip is expected

---

## 3. Board Presentation HARD LOCK (2026-08-15)

Companion runtime: `.qa-logs/cc-board-ui-2026-08-15T09-24-02-446Z/REPORT.json`  
Commit / Production: `79fa129b4` · Deployment `dpl_DsLtbZtGxmgvufwnt6tLzT3SCGis`

| Contract | Rule |
|---|---|
| Domains | NOTICE / SYSTEM / MARKETING remain separate content domains |
| Chrome | Shared Customer Center board presentation only |
| No valid image | No image DOM, no placeholder, no reserved media space |
| Valid image | Content media only — never `SamarketThumbnail` / store-product-fallback |
| Invalid / dead remote | Broken-image icon = 0; `onError` removes surface; body layout intact |
| Responsive | Desktop + mobile: overflow / clipping / bottom-nav overlap / image overflow = 0 |
| Authority | Customer Communication SSOT Original→Campaign→Event→Destination **unchanged** |
| Migration | **NO** |

DO NOT (without reopen):

- Treat product-fallback SVG as content media
- Reserve empty hero boxes when media is absent/invalid
- Add notification 7-tabs onto Customer Center boards
- Change canonical destinations while “fixing” presentation

---

## 4. Gate

```bash
# Production P7 close / rescore (QA users only; no all-members blast)
node scripts/qa/customer-center-p7-final-close.mjs
node scripts/qa/customer-center-p7-rescore.mjs

# Board presentation runtime (unit tests ≠ substitute)
EXPECT_GIT_SHA=79fa129b4 node scripts/qa/customer-center-board-ui-prod-runtime.mjs
```
