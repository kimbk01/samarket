# Platform Admin — Dead Code Register (Phase E prep)

**Date:** 2026-08-07  
**Rule:** No delete without static + dynamic + string + test + script + build + Runtime zero.  
**Slice 1:** candidates only. **DELETE_PROVEN = 0**.

| Candidate | Evidence | Risk | Classification | Replacement | Decision |
|-----------|----------|------|----------------|-------------|----------|
| `components/admin/settings/_quarantine/AdminMessengerCallSoundsSection.deprecated.tsx` | Explicit quarantine; 0 imports | Low | QUARANTINED_PENDING_EVIDENCE | Sound SSOT settings | Keep |
| `components/admin/AdminSidebar.tsx` | 0 import sites; live shell uses `AdminWorkspaceSidebar` | Med | DEPRECATE | `components/admin/shell/AdminWorkspaceSidebar.tsx` | Classify before delete (Slice 2B) |
| `components/admin/dashboard/AdminQuickLinks.tsx` | 0 imports; parallel hardcoded map | Low | DEPRECATE | `DashboardQuickLinksBySection` | |
| `components/admin/users/AdminUserDetailPage.tsx` | 0 imports; `[id]` redirects to `?detail=` | Med | QUARANTINED_PENDING_EVIDENCE | detail modal | |
| `components/admin/ads/AdminAdApplicationListPage.tsx` | 0 imports | Med | QUARANTINED_PENDING_EVIDENCE | `AdminPostAdManagePage` | |
| `components/admin/audit/AdminAuditLogListPage.tsx` | 0 imports | Med | QUARANTINED_PENDING_EVIDENCE | `AdminAuditLogsPage` | |
| `components/admin/menus/MainBottomNavFabEditor.tsx` | 0 imports | Med | QUARANTINED_PENDING_EVIDENCE | inline section | |
| Category legacy modals/lists | 0 imports | Med | QUARANTINED_PENDING_EVIDENCE | current categories page | |
| User detail cluster (action/moderation/points/summary) | 0 imports | Med | QUARANTINED_PENDING_EVIDENCE | list modal | |
| Community legacy tables/panels | 0 imports | High | QUARANTINED_PENDING_EVIDENCE | engine clients | Deep graph required |
| Delivery-orders orphan modals/tables | 0 imports | High | QUARANTINED_PENDING_EVIDENCE | stores/orders clients | |

## Counts

- `components/admin` non-test files ≈ **551**
- **DELETE_PROVEN count: 0** (not hidden)

```text
DEAD CODE CLEANUP: PARTIAL (register only)
```

Legacy dual matcher note: leaf active = `admin-sidebar-active-path.ts` (query/hash); workspace/breadcrumb = `admin-workspace-routing.ts` (pathname-only). Recorded as SSOT OPEN — not a delete candidate.
