# 매장 오너 허브 (`/stores/owner`) — 체감 속도 계약

## 목표

허브 첫 화면에서 **주문·KPI·헤더 배지**는 RSC 1회로 끝내고, 클라이언트 마운트 직후 **동일 API 재호출 금지**.

## 데이터 소유 (단일 경로)

| 데이터 | 소유 | 금지 |
|--------|------|------|
| 매장 목록 | `layout` RSC → `OwnerHubMeStoresCacheSeed` | Shell `reloadStores` 첫 마운트 GET |
| 주문 타임라인·KPI meta | `layout`+`page` RSC → `OwnerHubDashboardOrdersCacheSeed` | `loadDashboard` 즉시 `GET …/orders` |
| 주문 배지·delivery 알림 | `OwnerHubRuntimeProvider` 1곳 | `MyBusinessPage`·`BusinessAdminShell` 각각 `order-counts` 폴링 |
| 주문 Realtime | `OwnerHubRuntimeProvider` → `subscribeOrdersRefresh` | `BusinessAdminDashboard` 중복 채널 |
| 허브 통합 배지 API | App Boot 이후 (기존) | 허브에서 `useOwnerHubBadgeBreakdown` 구독 |
| 상품 목록(품절 KPI) | `owner-hub-secondary-fetch-queue` 직렬(문의 뒤 ~2.4s) | `loadRemote` 전체(매장 목록 재조회) |
| 문의 KPI | 동일 queue(시드 후 ~1.2s) | 마운트 즉시 `inquiries` |
| 커머스 알림 unread | 허브 5s+ idle 후 1회 | 마운트 즉시 `notifications` |

## 캐시

- `owner-hub-dashboard-orders-cache` — `fetchStoreOrdersListDeduped` peek
- `owner-hub-order-counts-cache` — `fetchStoreOrderCountsDeduped` peek

Realtime·pull-to-refresh 시 **두 캐시 모두 invalidate** 후 재조회.

## 회귀 체크

1. Network: 허브 cold load 후 3초 이내 `GET /api/me/stores`, `…/orders`, `…/order-counts` **0회**. `inquiries` → `products` → `notifications` 는 **직렬·지연** 1회씩.
2. DevTools **Finish** 는 녹화를 연 채로 두면 5분+로 보인다 — 측정 전 **Clear** 필수.
3. 최근 주문·KPI 빈 화면 없이 즉시 표시.
4. 신규 주문 Realtime 시 타임라인·배지 동시 갱신 (`OwnerHubRuntimeProvider` 단일).
5. 2차 fetch 큐 — **허브 URL 방문 1회**만 스케줄(HMR·remount 재실행 금지). `StoresOwnerLayoutClient` `enterOwnerHubSecondaryFetchSchedule`.
6. `BottomNav` 세션 boot warm·idle cross-tab prefetch — `store_owner` 도메인에서 **스킵** (taxonomy·philife·market 폭주 방지).
7. 바로가기 `Link` — `prefetch={false}` (6개 서브라우트 RSC 선로딩 금지).
8. 전역(허브 이후 ~5s 직렬·`key` 중복 스킵): `mandatory-address-gate`, `notification-settings`, `messenger-call-sound-config`. `profile?mode=full`·Supabase `categories` 는 **금지** (`WriteCategoryProvider`·`RegionProvider` 스킵).

## 매장 설정 하위 (`/stores/owner/*` except hub)

- `GET /api/me/store-owner-hub-badge` — **구독·fetch 모두 지연** (`isStoreOwnerAdminPathname`). 헤더 종은 `order-counts`·지연 commerce unread.
- `GET /api/me/addresses` — 기본정보 폼: session 캐시 선표시·마운트 시 `invalidate` 금지·단일 비행만.
- `GET /api/app/store-delivery-alert-sound` — `runSingleFlight` (동시 prime 2회 방지).
- `GET /api/app/delivery-ride-time-source` — `fetchDeliveryRideTimeSourceDeduped`.
- taxonomy — `runNowOrScheduleOnStoreOwnerAdmin` (~480ms).
