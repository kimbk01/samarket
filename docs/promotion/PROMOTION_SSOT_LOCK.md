# DIBAY Promotion Program — SSOT LOCK

**Authority (after scheduled-drain source fix):** see git HEAD on `main`.  
**Scope:** Platform Promotion orchestration (Event / Popup / Banner / Push / Bell / Owner request).  
**Not in scope:** Merchant paid Ads product systems except isolation boundaries.

## 1. Scope

Promotion is an **orchestration/link layer**, not a mega-table.  
Domains remain separate with explicit writers/readers.

## 2. Domain authorities

| Domain | Authority |
|---|---|
| CONTENT | `platform_events` |
| ORCHESTRATION | `platform_promotion_distributions` |
| POPUP | `platform_popup_campaigns` + composition/dismiss/frequency SSOT |
| BANNER | Distribution + banner capability/geometry + INLINE optional `feed_ad` materialization (`ADMIN_DIRECT`) |
| PUSH / BELL | `admin_notification_campaigns` + occurrences + delivery / `notification_events` |
| OWNER REQUEST | `platform_event_owner_requests` → Event **draft** only on approve |
| DESTINATION | `buildPlatformEventDetailPath` / destination resolvers |
| FREQUENCY / DISMISS | Popup frequency + dismiss SSOT (`impression ≠ suppress`) |
| ANALYTICS | Observe only; OPEN coordinates; DELIVERED/CREATED do not |

## 3. Admin menu authorities

- **광고 / 노출** — paid/merchant ads, placement inventory (inspect Promotion INLINE; do not edit Dist)
- **프로모션 / 이벤트** — Event CMS, Popup, Banner list, Dist, Owner requests, Push/Bell handoff
- **알림** — campaign execution, settings, push-device diagnostics

## 4. Event

- Writer: Admin Event APIs; Owner approve creates **draft** only
- Public gate: `isPlatformEventPubliclyAvailable`
- Renderer: shared `PlatformEventDetailContent` (Admin preview + public)
- Admin hero `max-h-56` is editor presentation only

## 5. Popup

- Operator compositions via `resolvePlatformPopupComposition`
- Landscape: **DENY**
- Delete: `delete_safe_draft` only (Admin Direct draft/pending_review)
- Approval ≠ exposure

## 6. Banner

- INLINE 3:1 · HERO 39:16 · capability matrix host placements
- Edit owner: Event Distribution
- List pause: existing Dist GET+PUT (`banner: false`) only
- Paid Ads must not own Event Banner edit; billing side effect **0** on Admin Dist path

## 7. Push

- SAVE ≠ SEND · Event publish ≠ SEND · Dist save ≠ SEND · Owner approve ≠ SEND
- SEND eligibility: `evaluateOfficialCampaignSendEligibility`
- **Manual send and scheduled cron drain both revalidate source before batches**

## 8. Bell

- Explicit campaign execution only; Dist save does not create inbox rows

## 9. Owner request

- Requested channels = suggestion
- Approve = Event draft; no publish / Dist activate / Push / Bell side effects

## 10. Destination / CTA

- Canonical Event path: `buildPlatformEventDetailPath`
- Path alone is not Event identity for Push source (`platform_event_id` required)

## 11–13. Exposure / Frequency / Analytics

- Exposure uses domain operator status adapters
- Frequency → dismiss suppress modes via dismiss SSOT
- `content-visit-contract`: OPEN coordinates; IMPRESSION/DELIVERED do not

## 14. Billing

- Admin owned Promotion Dist / Event / free Popup Admin Direct: **0** internal Points/package charge
- Owner Popup package debit is a **separate paid** path (not Admin Dist)

## 15. Delete / Retention

| Domain | Policy |
|---|---|
| Event | DELETE_NOT_ALLOWED |
| Popup | DELETE_CONDITIONAL (`delete_safe_draft`) |
| Banner | DELETE_NOT_ALLOWED |
| Notification | DELETE_NOT_ALLOWED |
| Owner request | DELETE_NOT_ALLOWED |

## 16. Security

- Admin mutations: `requireAdminApiUser`
- Cron: `CRON_SECRET` / `verifyCronRequestAuthorization`

## 17. Device behavior

- Popup landscape DENY; Banner orientation allow
- Device matrices may remain PARTIAL when tooling unavailable

## 18. Known evidence limitations

- Push/Bell provider delivery/open end-to-end may be NOT_PROVEN without isolated QA audience
- iOS / full phone matrix may be UNAVAILABLE
- Exhaustive Popup frequency matrix may remain NOT_PROVEN

## 19. Reopen conditions

Reopen only for: reproducible Production regression; new Owner product requirement; security/billing defect; canonical schema change; prior NOT_PROVEN evidence that **contradicts** this lock.

Do not reopen for cleanup/refactor aesthetics alone.
