# DIBAY Global Notification SSOT HARD LOCK

**Status:** HARD LOCK DECLARED  
**Locked at:** 2026-08-12  
**Companion rule:** `.cursor/rules/dibay-global-notification-ssot-hard-lock.mdc`

This freezes Member / Messenger / Store Owner / Platform Admin notification **authority** after GATE 4 + GATE 4.5 + device Push/summary close.  
It does **not** claim 2-store Owner UI E2E or OEM launcher digit rendering (Xiaomi Dock).

---

## 0. Program status at LOCK

| Concern | Status |
|---|---|
| Migration `20261028120000_global_notification_ssot_owner_admin.sql` | **PASS** (Production applied) |
| Equation A+B | **PASS** |
| Logout badge clear | **PASS** |
| Explainability | **PASS** |
| Read / Delete / History | **PASS** |
| Admin RT | **PASS** |
| Push exact CTA (Android) | **PASS** |
| Android summary residual (`setNumber` ≡ A+B) | **PASS** |
| iOS equation / ACK / Icon / logout·cold·resume | **PASS** |
| Push exact CTA (iOS) | **PASS** (user-confirmed OS path after Xcode reinstall; APNS deliver HTTP 200 proven) |
| Store Point RT | **PASS** |
| Feed Ad RT | **PASS** |
| Delivery P0 RT | **PASS** |
| Point Charge RT (Admin JWT · Member JWT · service_role) | **PASS** |
| Admin Bell = Action Queue | **PASS** |
| Owner Point Inbox | **PASS** |
| Owner `sold_out` | **PASS** |
| Owner → Member isolation | **PASS** |
| Admin sound hydrate 0 / new 1 / duplicate 0 | **PASS** |
| multi-tab (total sound = 1) | **PASS** |
| auth isolation | **PASS** |
| Admin domain ≠ Member badge-count | **PASS** |
| Member badge-count / Bell smoke | **PASS** |
| ACTUAL PRODUCT DEFECTS | **0** |
| 2-store Owner UI | **NOT_PROVEN — NO FIXTURE** |
| Xiaomi Dock digit display | **OEM / NOT product FAIL** (App Icon authority = A+B; dumpsys `setNumber` proven) |
| HARD LOCK | **DECLARED** |

### Intentional NOT_PROVEN (not product FAIL)

| Residual | Reason | Do not |
|---|---|---|
| 2-store Owner UI | Production/QA: no owner with ≥2 approved stores fixture | Invent fixture · force PASS |
| Xiaomi Dock digits | Launcher may hide digits; product authority is A+B + summary carrier | Force Dock visual PASS · reopen Native unless DIBAY-only numeric failure |

Static/unit Owner active-store authority remains **PASS** without 2-store UI.

---

## 1. Authority LOCK

| Surface | Count / list SSOT | Sound | Forbidden without reopen |
|---|---|---|---|
| Member Bell / App Icon | `/api/me/notifications/badge-count` + Domain Badge Authority | GATE 2 sound decision | Kill badge-count to “fix” Admin |
| Owner commerce inbox | `get_owner_store_commerce_notifications` / snapshot + `?owner_store_id=` | existing Owner surface | Bleed Owner kinds into Member inbox |
| Platform Admin Action Queue | `loadAdminActionQueueCounts` → `/api/admin/admin-bell` (+ CP Overview same total) | Admin row PK + GATE 2 class · RT wake-up only | `/api/me/notifications` as Admin ops inbox |
| Admin RT | `supabase_realtime` + Admin SELECT RLS (`is_platform_admin`) | ingest on INSERT | Poll-only sound workaround · replica identity guess |
| Push route CTA | Cap `pushNotificationActionPerformed` → `resolvePushRouteFromFcmData` | — | Fake CTA via deep-link launch in QA |

### Admin ≠ Member badge

Member badge-count runtime (`notification-badge-count-store` + App Boot `app-boot-initial-badge`) runs only on **Member badge authority surfaces**.

Platform Admin surface = `pathname === "/admin"` OR `pathname.startsWith("/admin/")`  
(`lib/notifications/member-badge-surface-authority.ts`).

On Admin surface: **no** `/api/me/notifications` and **no** `/api/me/notifications/badge-count`.

DO NOT:

- `pathname === "/admin/order-notifications"` one-page cancel
- fetch abort / digit 0 / API response masking
- disable Member / Owner / Messenger / Trade / customer-order badge HARD LOCK paths

---

## 2. Evidence

| Item | Log |
|---|---|
| PCR RT FIRST BREAK close | `.qa-logs/gate45-pcr-first-break-2026-08-12T02-42-06-287Z/` |
| Origin UI + Owner inbox + sound | `.qa-logs/gate45-notification-ssot-2026-08-12T02-43-56-006Z/` |
| Admin isolation + multi-tab + auth + Member smoke | `.qa-logs/gate45-remaining-2026-08-12T02-53-13-675Z/` |
| Android summary residual | `.qa-logs/gate4-android-summary-only-2026-08-12T06-39-44-342Z/` |
| iOS equation / ACK / logout | `.qa-logs/gate4-summary-ios-final-2026-08-12T07-08-14-125Z/` |
| iOS APNS deliver (presence background) | `.qa-logs/gate4-ios-apns-deliver-only-2026-08-12T07-43-06-548Z/` |

SIGKILL(137) origin crashes are **test-harness**, not product defects.  
iOS empty Bell sheet during Xcode tooling break = **environment**, not product FAIL (user-confirmed restored after Xcode reinstall).

---

## 3. Verify

```bash
npx vitest run \
  lib/notifications/__tests__/member-badge-admin-surface-isolation.test.ts \
  lib/admin/__tests__/admin-action-queue-ssot-contract.test.ts \
  lib/notifications/__tests__/p3b1-boot-initial-generation-contract.test.ts \
  lib/notifications/__tests__/notification-badge-count-store.test.ts \
  lib/notifications/__tests__/notification-sound-hard-lock-contract.test.ts \
  lib/delivery/owner/__tests__/resolve-owner-active-store.test.ts
```

---

## 4. DO NOT (without reopen)

- Restore Member badge-count boot on `/admin/*`
- Use `/api/me/notifications` as Admin Action Queue
- Bypass 409 / invent second current HOLD (Feed Banner LOCK still applies)
- Poll-workaround Admin sound when RT is available
- ALTER replica identity without a new FIRST BREAK
- Declare 2-store UI or Xiaomi Dock digit **PASS** without new fixture/device evidence
- Treat OEM launcher-hidden digits as App Icon authority FAIL
- `vercel --prod` / dirty-tree Production (Build/Deploy HARD LOCK)

---

## 5. Cutover SHAs

| Field | Value |
|---|---|
| Commit | `874b4a60e1a4c0a3d710533c8c3efc134b4c303b` |
| Production deployment | `dpl_CNu9VhGEPnAUQAPDBGaX9AghSXac` |
| Alias | `https://samarket.vercel.app` |
