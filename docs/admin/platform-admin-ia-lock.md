# DIBAY Platform Admin — IA LOCK (Phase 0)

**Date:** 2026-08-07  
**Scope:** `/admin/**` platform Admin only. `/stores/owner/**` Owner Admin **out of scope**.  
**Mode:** Evidence from HEAD code · **FUNCTION / AUTHORITY / API / DB / WRITER UNCHANGED**  
**Next:** Phase 1 Menu SSOT (this document locks IA before menu rewrite)

---

## 0. Non-change declaration

| Layer | Change in Phase 0–1 |
|-------|---------------------|
| API / RPC / DB / migration / RLS | **NO** |
| Writers / business authority | **NO** |
| Page URL (canonical) | **PRESERVE** (redirect-only routes stay redirect) |
| Owner Admin (`BusinessAdminShell`) | **NO** |
| New product features / TODO page invent | **NO** |
| Page/file deletion | **NO** |

---

## A. Menu authority table (verified)

| 항목 | 현재 권위 | 사용 위치 | 충돌 |
|------|-----------|-----------|------|
| Sidebar menu | `components/admin/admin-menu.ts` → `adminMenu` + `filterMenuByRole` | `AdminSidebar.tsx` | SSOT 후보 |
| Dashboard quick links | `lib/admin-menu-config.ts` → `OPS_QUICK_LINKS_PRIORITY` / `MANAGE_QUICK_LINKS_PRIORITY` + hard-coded `DEV_LINKS` | `DashboardQuickLinksBySection.tsx` | **충돌** — 사이드바와 다른 목록; `/admin/operations`는 퀵링크만 |
| Breadcrumb | **없음** (공통 Admin breadcrumb SSOT 부재) | 일부 화면 로컬 (`admin_users_lite_breadcrumb_members` 등) | 미연결 |
| Role filter (sidebar) | `admin-menu.ts` `filterMenuByRole` + `AdminMenuRole` | `AdminSidebar` | OK |
| Role filter (legacy sections) | `lib/admin-permission.ts` `filterMenuByRole(ADMIN_MENU_SECTIONS)` | 섹션 접근 헬퍼 | **이중 API** — sections는 config 파생 |
| Legacy menu config | `lib/admin-menu-config.ts` — `ADMIN_MENU_SECTIONS`, `OPS_MENU_GROUPS` 등 `adminMenu`에서 **일부** 파생 | staff API types (`AdminRole`), dashboard, tests | **부분 adapter** — 키(`common`/`settings`/`ads`)가 구 IA 가정 |

**Phase 1 목표:** sidebar · quick links · role filter · (breadcrumb 준비)가 `admin-menu.ts` 단일 트리에서 파생. `admin-menu-config.ts`는 삭제하지 않고 **compatibility adapter**로 축소.

---

## B. Canonical path 중복 (현재 → 최종 워크스페이스)

Uniqueness key = menu `path` 문자열 전체(쿼리·hash 포함).  
아래는 **base path** 기준 중복(동일 화면 다중 노출) 중 Phase 1에서 제거하는 항목.

| canonical path | 현재 메뉴 노출 | 현재 그룹 | 실제 페이지 | 최종 워크스페이스 · 조치 |
|----------------|---------------:|-----------|-------------|-------------------------|
| `/admin` | 1 | dashboard | `AdminDashboardPage` | **HOME** · leaf 1 |
| `/admin/customer-platform` | 5 (group+dashboard+AQ+mon+analytics) | CP | `CustomerPlatformDashboardPage` | **CP** · Overview 1 + `#action-queue` / `#monitoring` leaf (analytics 병합 Monitoring) |
| `/admin/member-notes?kind=inquiry` | 1 | CP | member-notes | **CP Support** |
| `/admin/member-notes?kind=inbox` | 1 | CP | member-notes | **CP Support** |
| `/admin/point-charges` | 2 | CP mirror | point-charges | **CP Member Assets** · leaf 1 |
| `/admin/point-plans` | 2 | CP mirror | point-plans | **CP Member Assets** · leaf 1 |
| `/admin/points/ledger` | 2 | CP mirror | points/ledger | **CP Member Assets** · leaf 1 |
| `/admin/store-point-charges` | 2 | CP mirror | store-point-charges | **CP Store Assets** · leaf 1 |
| `/admin/store-point-ledger` | 2 | CP mirror | store-point-ledger | **CP Store Assets** · leaf 1 |
| `/admin/promoted-items` | 2 | CP + common | promoted-items | **GROWTH** only |
| `/admin/member-benefits` | 2 | CP + common | member-benefits | **GROWTH** only |
| `/admin/settings/notifications` | 2 | CP + settings | settings/notifications | **APP CONFIG** only |
| `/admin/posts-management` | 2 (+jobs query) | common | posts-management | **TRADE** · posts + jobs(`?tab=jobs`) 별 canonical |
| `/admin/trade` | 2 (group+hub) | trade | trade | **TRADE** · parent path 제거, hub leaf 1 |
| `/admin/stores` | 2 | delivery | stores | **DELIVERY** · parent path 제거 |
| `/admin/stores/orders` | 2 | delivery | DeliveryOrdersDashboard | **DELIVERY Orders Console** · parent path 제거 |
| `/admin/chats` | 2 | messenger | AdminChatListPage all | **MESSENGER** · parent path 제거 |
| `/admin/reviews` | 2 | messenger | reviews | **MODERATION** · parent path 제거 |
| `/admin/reports` | 2 | messenger | reports | **MODERATION** · parent path 제거 |
| `/admin/recommendation-experiments` | 2 | settings | recommendation-experiments | **GROWTH** · parent path 제거 |
| `/admin/ops-docs` | 2 | settings | ops-docs | **PLATFORM OPS** · parent path 제거 |
| `/admin/ops-maturity` | 2 | settings | ops-maturity | **PLATFORM OPS** · parent path 제거 |
| `/admin/release-notes` | 2 | settings | release-notes | **PLATFORM OPS** · parent path 제거 |
| `/admin/system` | 2 | settings | system | **PLATFORM OPS** · parent path 제거 |

---

## C. 메뉴 미등재 route 분류 (page.tsx 실측)

분류 규칙: 파일을 열고 redirect / re-export / 실컴포넌트를 확인.

### C1. 메뉴 편입 (Phase 1)

| Route | 확인된 기능 | Workspace |
|-------|-------------|-----------|
| `/admin/ad-products` | `AdminAdProductsPageClient` 광고 상품 CRUD | GROWTH |
| `/admin/banners` (+ create) | `AdminBannerListPage` | GROWTH |
| `/admin/categories` | `AdminCategoriesPage` | APP CONFIG |
| `/admin/app/countries` | `AdminAppCountriesPage` | APP CONFIG |
| `/admin/app/languages` | `AdminAppLanguagesPage` | APP CONFIG |
| `/admin/app/meta` | `AdminAppMetaPage` | APP CONFIG |
| `/admin/my/banners` | my_page_banners | APP CONFIG |
| `/admin/my/sections` | my_page_sections | APP CONFIG |
| `/admin/my/services` | my_services | APP CONFIG |
| `/admin/push-devices` | `AdminPushDevicesPage` | MEMBERS |
| `/admin/order-chats` | 주문 채팅 허브 + `AdminOrderChatList` | DELIVERY Orders |
| `/admin/order-notifications` | 주문 알림 운영 UI | DELIVERY (ops alerts 인접) |
| `/admin/recommendation-analytics` | 추천 analytics | GROWTH |
| `/admin/recommendation-monitoring` | 추천 monitoring | GROWTH |
| `/admin/recommendation-deployments` | 추천 deployments | GROWTH |
| `/admin/recommendation-automation` | 추천 automation | GROWTH |
| `/admin/chats/business` | `AdminChatListPage mode=business` | MESSENGER |
| `/admin/chats/community` | mode=community | MESSENGER |
| `/admin/chats/group` | mode=group | MESSENGER |
| `/admin/chats/trade-complete` | `AdminTradeCompletionPage` | TRADE (거래완료 운영) |
| `/admin/community` | Community engine hub | COMMUNITY |
| `/admin/community/sections|topics|settings|meetings` | Philife 구현 본체 | COMMUNITY (canonical; philife=* re-export) |
| `/admin/community/reports` | 피드 신고 목록 | MODERATION |
| `/admin/philife/meeting-events` | 모임 이벤트 로그 (실페이지) | COMMUNITY |
| `/admin/philife/meeting-reports` | 모임 신고 | MODERATION |
| `/admin/launch-readiness` | Launch readiness | PLATFORM OPS |
| `/admin/launch-week` | Launch week | PLATFORM OPS |
| `/admin/docs/board` | 운영 가이드 MD | PLATFORM OPS |
| `/admin/docs/chat` | 운영 가이드 MD | PLATFORM OPS |
| `/admin/memo` | 운영 메모(테스트/배포 체크리스트 UI) | PLATFORM OPS |

### C2. redirect-only (메뉴 leaf 금지 · 코드 유지)

| Route | Target |
|-------|--------|
| `/admin/delivery-orders/**` | `/admin/stores/orders/**` |
| `/admin/delivery/bottom-nav` | `/admin/stores/bottom-nav` |
| `/admin/menus` | `/admin/menus/main-bottom-nav` |
| `/admin/posts` | `/admin/community/posts` |
| `/admin/behavior-events` | `/admin/recommendation-analytics?tab=events` |
| `/admin/order-notifications/settings` | `/admin/settings/notifications` |

### C3. internal detail route (메뉴 leaf 없음 · 목록 leaf의 자식 URL)

| Pattern | Parent leaf |
|---------|-------------|
| `/admin/users?detail=` / `/admin/users/[id]` → redirect | MEMBERS `/admin/users` |
| `/admin/chats/[id]` | MESSENGER `/admin/chats` |
| `/admin/chats/messenger/[id]` | MESSENGER messenger list |
| `/admin/stores/orders/[orderId]` (+ `/chat`) | DELIVERY console |
| `/admin/stores/orders/by-store|by-buyer/...` | DELIVERY console |
| `/admin/*/create|edit` under listed parents | parent list |
| `/admin/banners/edit` (dynamic) | banners |
| `/admin/reports/[id]`, `/admin/reviews/[id]` | moderation lists |
| `/admin/notifications/[campaignId]`, create | CP Engine |
| `/admin/point-charges/[id]`, point-executions/[id] | CP assets |
| `/admin/products/[id]` | TRADE products |
| `/admin/ops-docs/[id]`, runbooks/[id], release-* /[id] | PLATFORM OPS |

### C4. HOME / 이중 시작점

| Route | 실측 | Phase 1 처리 |
|-------|------|----------------|
| `/admin/operations` | `AdminOperationsHubPage` — chats/reports/posts/comments/users **퀵링크 허브만** (신규 업무 권위 없음) | **메뉴 leaf 금지**. 퀵링크에서 제거. Phase 5에서 `/admin` redirect 후보. 페이지 코드 **삭제 금지** |
| Dashboard `OPS_QUICK_LINKS` 내 `/admin/operations` | 삼중 시작점 | 제거 |

### C5. Community canonical

| Menu path (Phase 1) | Compatibility |
|---------------------|---------------|
| `/admin/community/sections` 등 | `/admin/philife/*` re-export 유지 · `matchPaths`에 philife 경로 |
| `/admin/philife/meeting-events` | community에 동일 re-export 없음 → **이 path를 canonical leaf**로 유지 |

### C6. 페이지 없는 pending (메뉴에서 제거 · 구현 금지)

| Former menu path | pageExists |
|------------------|------------|
| `/admin/price-offers` | false |
| `/admin/trade-status` | false |
| `/admin/promo-posts` | false |
| `/admin/coupons` | false |
| `/admin/business-exposure` | false |
| `/admin/reviews/business` | false |
| `/admin/reviews/reported` | false |
| `/admin/reports/comments` | false |
| `/admin/reports/chats` | false |
| `/admin/reports/sanctions` | false |
| `/admin/regions` | false |
| `/admin/board-categories` | false |
| `/admin/popular-posts` | false |
| `/admin/services` | false |
| `/admin/permissions` | false |
| `/admin/customer-platform/faq` | false — **FAQ는 pending leaf 유지**(기존 CP contract · 제품 자리표시). 구현 안 함 |

`/admin/reports/log` — page **exists** → MODERATION leaf.

---

## D. Final 11 workspace IA

```text
HOME                 /admin
CUSTOMER PLATFORM    /admin/customer-platform (+ Support / Assets / Content / Engine)
MEMBERS              /admin/users · push-devices
MODERATION           reports · reviews · feed/store/chat reported · meeting-reports · recommendation-reports
TRADE                trade hub · products · posts-management · trade ads · menus/trade · favorites · trade-flow · trade-complete
COMMUNITY            community/* · boards · comments · meeting-events
DELIVERY             stores · orders console · store-orders (Action Queue) · order-chats · riders · settlement · …
MESSENGER            chats (all/trade/messenger/group/community/business) · messenger-performance
GROWTH               ads* · banners · ad-products · promoted · benefits · recommendation*
APP CONFIG           settings · startup · auth · notifications · menus · categories · app meta/countries/languages · my/*
PLATFORM OPS         manage knowledge/eval · system · launch* · docs · memo · qa … (role-gated)
```

### CP subtree (no URL mirrors)

```text
Overview                         /admin/customer-platform
Action Queue                     /admin/customer-platform#action-queue
Monitoring                       /admin/customer-platform#monitoring
Support
  Member Inquiries               /admin/member-notes?kind=inquiry
  Member Inbox                   /admin/member-notes?kind=inbox
  Store Inquiries                /admin/store-inquiries
  Platform Inquiries             /admin/platform-inquiries
Member Assets
  Deposit Requests               /admin/point-charges
  D-Point Ledger                 /admin/points/ledger
  Plans / Rates                  /admin/point-plans
  Policies                       /admin/point-policies
  Executions                     /admin/point-executions
  Expire                         /admin/points/expire
Store Assets
  Deposit Requests               /admin/store-point-charges
  Business Credit Ledger         /admin/store-point-ledger
  Plans / Rates                  /admin/store-point-policies
  Store Points Hub               /admin/store-points
Content
  Notices                        /admin/app/notices
  FAQ                            /admin/customer-platform/faq (pending)
  Legal                          /admin/app/legal
  Business Information           /admin/app/business
Notification Engine              /admin/notifications
```

### Delivery Orders roles

| Label | Path | Role |
|-------|------|------|
| Operations Console | `/admin/stores/orders` | KPI/취소·환불·정산·로그 콘솔 |
| Order Action Queue | `/admin/store-orders` | 매장 주문 액션 목록 (`AdminStoreOrdersPage`) |
| Cancel / Refund | `/admin/stores/orders/cancellations` · `…/refunds` | 콘솔 하위 |
| Order Chats | `/admin/order-chats` | 허브 (상세는 `…/orders/{id}/chat`) |

---

## E. Role visibility

| Workspace / section | roles |
|---------------------|-------|
| HOME … GROWTH, APP CONFIG (product) | 전체 (roles 미지정) |
| PLATFORM OPS · manage* | `admin`, `master` (기존 manage와 동일; UI role `manager`→menu `admin`) |
| PLATFORM OPS · system* | `master` |

---

## F. Implementation file scope

### Phase 0 (this doc only)

- `docs/admin/platform-admin-ia-lock.md`

### Phase 1

- `components/admin/admin-menu.ts` — SSOT rewrite
- `lib/admin-menu-config.ts` — adapter to new keys / workspace quick links
- `lib/admin/find-admin-menu-item.ts` — helpers if needed (`collectLeafPaths`)
- `lib/admin/__tests__/customer-platform-menu-contract.test.ts` — update
- `lib/admin/__tests__/find-admin-menu-item.test.ts` — update
- `lib/admin/__tests__/platform-admin-menu-ssot-contract.test.ts` — **new**
- `lib/i18n/catalog/admin.ts` — new workspace label keys only (ko/en)
- `components/admin/dashboard/DashboardQuickLinksBySection.tsx` — drop operations triple; consume adapter
- Optional: `admin-sidebar-active-path.ts` — honor `matchPaths` (if needed for philife)

### Explicitly NOT Phase 1

- AdminShell / visual console / list-detail (Phase 2–3)
- Page component business logic
- Owner admin files

---

## G. First-break watchlist (do not silently “fix”)

| Risk | Status at Phase 0 |
|------|-------------------|
| Same path, different authority | Not found for promoted/benefits/notifications — same page, duplicate IA only |
| `member-notes` inquiry vs inbox | Same page, different `kind` query — **two canonical paths** (allowed) |
| `store-orders` vs `stores/orders` | **Different components** — keep both, distinct labels |
| Removing `admin-menu-config` keys | Staff `AdminRole` type depends on file — **keep file** |
| Owner isolation | Platform menu files not imported by `BusinessAdminShell` — OK |

---

## H. Phase 1 gate (must PASS before Phase 2)

```text
ONE CANONICAL PATH = ONE MENU LEAF
DUPLICATE VISIBLE PATH = ZERO
MENU SSOT CONSUMERS IDENTIFIED
OWNER ADMIN UNAFFECTED
FUNCTION / API / DB UNCHANGED
```
