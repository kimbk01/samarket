# PRODUCT DIFF (ad7942be6 → judged Product)

## Claimed vs independent

| Layer | Value |
|---|---|
| Claimed PRODUCT | `85480b40b` |
| Alias at first independent check | `85480b4` / `dpl_8ECb8ay8XnrwQn24vNRKMdVvu2Vk` — **MATCH claim** |
| Local/origin tip at first check | `b092c480f` (docs evidence only after product) |
| After DEF-011 repair | PRODUCT **`3d90c3e05`** / DEPLOY **`dpl_BzSZc4d4z17QG2p7JCzUPRhX3iNm`** |

## Diff classification `ad7942be6..3d90c3e05` (product, excl docs/perf)

### Admin repair (DEF mapped)

| File | DEF / owner |
|---|---|
| `app/api/admin/business-cash-charges/route.ts` | DEF-004 |
| `lib/admin/admin-action-queue.ts` | DEF-002/003 |
| `components/admin/dashboard/AdminActionCenter.tsx` | DEF-002/008 |
| `components/admin/delivery-orders/DeliveryOrderDetailClient.tsx` | DEF-001 |
| `components/admin/store-points/AdminStorePointPendingProvider.tsx` | DEF-002 |
| `components/admin/stores/AdminDeliveryAdCashChargeQueuePage.tsx` | DEF-006/011 |
| `components/admin/stores/AdminDeliveryAdPartnerMembershipsView.tsx` | DEF-007 |
| `components/admin/stores/AdminStoresPage.tsx` + API + model | DEF-008 |
| `components/admin/stores/AdminPlacementMapPanel.tsx` | DEF-012 |
| `lib/support/support-reference-admin-href.ts` | DEF-006/007/011 |
| `lib/admin-business/business-control-center-links.ts` | DEF-001/011 |
| `lib/admin/management/policies/seed-policies.ts` | DEF-010 |
| `lib/admin/domain-dashboard/load-community-domain-dashboard.ts` | DEF-014 |
| `lib/i18n/catalog/admin*.ts` | DEF-009/012 + labels |
| `components/admin/finance/AdminStoreFinancePanels.tsx` | DEF-011 note |
| repair tests / QA scripts | contracts |

### UNRELATED PRODUCT (Owner Store OS — not Admin DEF)

| File | Domain |
|---|---|
| `components/business/admin/BusinessAdminShell.tsx` | Owner shell |
| `components/business/owner/*` (ProductForm, Finance, Orders, etc.) | Owner |
| `app/(main)/stores/owner/products/new/page.tsx` | Owner |
| `lib/business/owner-*` | Owner |
| `components/stores/StoreDetailInfoPublic.tsx` | Public store |
| Owner scroll/nav i18n/tests | Owner |

**RESULT:** Admin repair files map to DEF-001~014. **Unrelated Owner product changes are present in the same SHA range** (Owner reachability / Product New scroll). They do not contradict Admin DEF mapping but are **not** Admin ARO-OPS-UX-002 scope.
