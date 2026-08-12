# DIBAY Global Notification SSOT HARD LOCK

**Status:** HARD LOCK READY WITH EXPLICIT NOT_PROVEN EVIDENCE  
**Locked at:** 2026-08-12  
**Companion rule:** `.cursor/rules/dibay-global-notification-ssot-hard-lock.mdc`

This freezes Member / Messenger / Store Owner / Platform Admin notification **authority** after GATE 4 + GATE 4.5 runtime.  
It does **not** claim 2-store Owner UI E2E or Samsung/Xiaomi `user_devices` sound matrix.

---

## 0. Program status at LOCK

| Concern | Status |
|---|---|
| Migration `20261028120000_global_notification_ssot_owner_admin.sql` | **PASS** (Production applied) |
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
| 2-store Owner UI | **NOT_PROVEN — NO FIXTURE** |
| Samsung / Xiaomi device sound | **NOT_PROVEN — inactive device registration** |
| HARD LOCK | **THIS DOCUMENT** |

### Intentional NOT_PROVEN (not product FAIL)

| Residual | Reason | Do not |
|---|---|---|
| 2-store Owner UI | Production/QA: approved stores = 14, owner with ≥2 approved stores = 0. No new QA store created. | Invent fixture · force PASS |
| Samsung | ADB present (`RFCY40PY2CA`) · QA `user_devices` active = 0 | Device registration rewrite |
| Xiaomi | ADB present (`8b37179f7d94`) · QA `user_devices` active = 0 | Device registration rewrite |

Static/unit Owner active-store authority remains **PASS** without 2-store UI.

---

## 1. Authority LOCK

| Surface | Count / list SSOT | Sound | Forbidden without reopen |
|---|---|---|---|
| Member Bell / App Icon | `/api/me/notifications/badge-count` + Domain Badge Authority | GATE 2 sound decision | Kill badge-count to “fix” Admin |
| Owner commerce inbox | `get_owner_store_commerce_notifications` / snapshot + `?owner_store_id=` | existing Owner surface | Bleed Owner kinds into Member inbox |
| Platform Admin Action Queue | `loadAdminActionQueueCounts` → `/api/admin/admin-bell` (+ CP Overview same total) | Admin row PK + GATE 2 class · RT wake-up only | `/api/me/notifications` as Admin ops inbox |
| Admin RT | `supabase_realtime` + Admin SELECT RLS (`is_platform_admin`) | ingest on INSERT | Poll-only sound workaround · replica identity guess |

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

## 2. Evidence (GATE 4.5)

| Item | Log |
|---|---|
| PCR RT FIRST BREAK close | `.qa-logs/gate45-pcr-first-break-2026-08-12T02-42-06-287Z/` |
| Origin UI + Owner inbox + sound | `.qa-logs/gate45-notification-ssot-2026-08-12T02-43-56-006Z/` |
| Admin isolation + multi-tab + auth + Member smoke | `.qa-logs/gate45-remaining-2026-08-12T02-53-13-675Z/` |

SIGKILL(137) origin crashes are **test-harness**, not product defects.

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
- Declare 2-store UI or Samsung/Xiaomi device sound **PASS** without new fixture/device evidence
- `vercel --prod` / dirty-tree Production (Build/Deploy HARD LOCK)

---

## 5. Cutover SHAs

Filled at commit / Git Integration Production time.
