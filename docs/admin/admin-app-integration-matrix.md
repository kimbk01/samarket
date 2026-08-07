# Platform Admin ↔ App Integration Matrix (Phase C)

**Date:** 2026-08-07  
**HEAD:** `b61feda45`  
**Mode:** Code-path mapping only. Runtime round-trip is a separate gate.

### Normalized verdict

```text
ADMIN ↔ APP CODE CHAIN: FULL — 8 sampled domains
ADMIN ↔ APP RUNTIME CHAIN: NOT_PROVEN — 0 full runtime chains in this Slice
ADMIN ↔ APP INTEGRATION FINAL: PARTIAL
```

Do **not** read “code FULL” as Runtime PASS.

---

## Matrix

| Domain | Admin route | Admin API | Writer / service | Persist | App read | App route | Code chain | Runtime |
|--------|-------------|-----------|------------------|---------|----------|-----------|------------|---------|
| Notices | `/admin/app/notices` | `/api/admin/app-notices*` | `AdminAppNoticeForm` | `app_notices` | `/api/me/settings/notices*` | `/mypage/section/settings/notices`, `/mypage/notices/[id]` | **FULL** | **NOT_PROVEN** |
| FAQ | menu `/admin/customer-platform/faq` | — | — | — | — | — | **NOT_PROVEN** | **NOT_PROVEN** |
| Legal | `/admin/app/legal` | `/api/admin/app-legal-documents*` | `AdminAppLegalDocumentForm` | `app_legal_documents` | `/api/legal/[kind]` | `/terms`, `/privacy` | **FULL** | **NOT_PROVEN** |
| Member inquiry | `/admin/member-notes?kind=inquiry` | `/api/admin/member-notes*` | `lib/notifications/member-admin-notes-service.ts` | note threads/messages | `/api/me/admin-notes*` | `/mypage/inquiries*` | **FULL** | **NOT_PROVEN** (Admin console layout Runtime only) |
| Member inbox | `?kind=inbox` | same | same service | same | same | `/mypage/inbox*` | **FULL** | **NOT_PROVEN** |
| Store inquiry | `/admin/store-inquiries` | `/api/admin/store-inquiries` | — | — | — | — | **NOT_PROVEN** | **NOT_PROVEN** |
| Member D-Point | `/admin/point-charges*` | `/api/admin/point-charges*` | `approve_user_point_charge_request` | `point_charge_requests` | `/api/me/points*` | `/mypage/points*` | **FULL** | **NOT_PROVEN** |
| Store Business Credit | `/admin/store-point-charges` | `/api/admin/store-point-charges*` | `approve_store_point_charge_request` | `store_point_charge_requests` | `/api/me/stores/[id]/points*` | `/stores/owner/points` | **FULL** | **NOT_PROVEN** |
| Notification campaigns | `/admin/notifications*` | `/api/admin/notification-campaigns*` | → `notification_events` | campaigns + events | `/api/me/notifications` | `/notifications*` | **FULL** | **NOT_PROVEN** |
| Delivery orders | `/admin/stores/orders` + `/admin/store-orders` | `/api/admin/store-orders*` | `lib/stores/apply-admin-store-order-operations.ts` | `store_orders` | buyer/owner order reads | `/mypage/store-orders`, `/stores/owner/orders` | **FULL** | **NOT_PROVEN** |
| Moderation reports | `/admin/reports` | merged sources | multi writers | multi tables | create + mypage activity | `/mypage/community-activity?tab=reports` | **PARTIAL** | **NOT_PROVEN** |

Delivery note: dual Admin consoles share one API — intentional. **OPEN:** `app/api/admin/store-orders/[orderId]/mark-paid/route.ts` uses `admin_console_stub`.

---

## Owner Admin isolation

PASS — Platform `/admin/**` vs Owner `/stores/owner/**` (`BusinessAdminShell`).

---

## Aggregate

```text
CODE CHAIN FULL samples: 8
RUNTIME FULL chains: 0
INTEGRATION FINAL: PARTIAL
```

Next dedicated Slice: runtime chain validation (do not mix with DEV_LINKS or writer stub).
