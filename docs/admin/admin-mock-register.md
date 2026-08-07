# Platform Admin — Mock / Stub / Fixture Register (Phase A4 / F prep)

**Date:** 2026-08-07  
**Mode:** Classification only — **NO deletion in Slice 1**  
**Noise excluded:** i18n `fallback*`, React Suspense fallback, HTML placeholder, HistoryBack fallbackHref

| ID | File / surface | Class | Production reachable | Decision |
|----|----------------|-------|----------------------|----------|
| M01 | `app/api/admin/store-orders/[orderId]/mark-paid/route.ts` (`provider: admin_console_stub`) | production stub writer | YES | **OPEN** — separate Slice 2C; no delete/replace until writer authority proven |
| M02 | `components/admin/AdminTestSwitcher.tsx` in Platform shell | env-gated test role UI | IF env true | DEPRECATE / guard audit |
| M03 | `PersonalizedFeedSimulator` MOCK_REGION | simulator UI | YES (admin page) | KEEP as tooling or quarantine label |
| M04 | `HomeFeedPreview` MOCK_PREVIEW_REGION | simulator | YES | same |
| M05 | Backup / DR “mock restore / rehearsal” copy | labeled sim | YES | KEEP labeled ops tooling |
| M06 | Taxonomy `seed` admin API | seed | Admin-triggered | KEEP seed utility |
| M07 | User create address seed | seed | Admin create | KEEP |
| M08 | Notification campaign `test_only` channel | intentional test channel | YES (send rejected) | KEEP with guard |
| M09 | `DashboardQuickLinksBySection` `DEV_LINKS` | hardcoded nav outside menu SSOT | YES | **OPEN first break** — Slice 2A |
| M10 | Sample-data badges (`is_sample_data`) | DB flag display | YES | KEEP |
| M11 | `settings/_quarantine/AdminMessengerCallSoundsSection.deprecated.tsx` | unused quarantine | NO imports found | QUARANTINED |
| M12 | `lib/admin/**/__tests__`, API `__tests__` | test-only | NO | KEEP |
| M13 | Read-path snapshot/RPC “fallback” in APIs | ops degradation | YES | Not mock class |

## Production mock / stub gate

```text
PRODUCTION MOCK: OPEN
Primary write stub: M01 mark-paid admin_console_stub
Primary nav leak: M09 DEV_LINKS
```

FAQ `pendingRoute` is **not** a mock — see route classification (**ACCEPTED** pending).
