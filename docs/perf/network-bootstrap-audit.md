# Network / Bootstrap 감사 (읽기 전용)

**브랜치·작업**: `optimize/network-bootstrap-v1` — **코드 변경 없음**, 정적 호출 그래프 분석만 수행.  
**기준일**: 2026-05-27 (main `d6a53f6c` 계열 스토어 홈 리팩터 반영)  
**관련 문서**: `docs/dibay-app-boot-call-map.md`, `docs/perf/cm-bootstrap-regression-lock.md`, `docs/perf/hub-badge-regression-lock.md`, `docs/perf/delivery-summary-regression-lock.md`

---

## 공통 레이어 (모든 대상 화면에 선행)

앱 셸 `AppBootProvider` → `ensureAppBoot()` (`lib/app-boot/run-app-boot.ts`).

| API | 시점 | 중복 억제 | 비고 |
|-----|------|-----------|------|
| `GET /api/me/profile?lite=1` | 첫 마운트 **blocking** | `app-boot:profile:minimal` single-flight, 4s TTL | Region·동의·언어 시드의 단일 소스 |
| `GET /api/me/profile?mode=full` | boot 직후 idle (~80ms) | `me:profile:get:full`, boot bridge 3s | consent·full 필드 |
| `GET /api/me/store-owner-hub-badge` | idle (~220ms) | `owner-hub-badge-store` defer·5s | BottomNav 배지; dev 터미널에서 수백 ms 관측 가능 |
| `GET /api/me/notification-settings` | startup deferred | startup scheduler | |
| `GET /api/stores/browse` | startup deferred | prewarm·browse 캐시 | 스토어 탭 전 화면에서도 스케줄될 수 있음 |
| `GET /api/philife/neighborhood-feed?...` | startup deferred | philife prewarm·session 캐시 | Philife 미방문이어도 백그라운드 1회 가능 |

**프로필 중복**: 동일 세션·4s TTL 안에서는 `fetchMeProfileDeduped` / boot minimal / mypage prewarm이 **1회로 합류**. TTL 밖·`invalidateMeProfileDedupedCache` 후에는 화면별로 다시 보일 수 있음.

**하단 탭 `pointerdown`**: `lib/main-menu/bottom-nav-tap-prewarm-data.ts` — 목적지별 지연 import prewarm (아래 화면 절과 중복 가능, single-flight로 완화).

---

## 1. `/stores` (스토어 홈 허브)

**진입**: `app/(stores)/stores/page.tsx` → `StoresHub` → `StoresHomeHub` (+ `StoresHomeQuickCategories` 항상 마운트).

### 호출 API 목록 (초기 진입, cold·로그인 가정)

| 순서(대략) | API | 호출 주체 | 첫 페인트 필수 |
|------------|-----|-----------|----------------|
| 0 | (공통) `profile?lite=1` 등 | App boot | 부분 |
| 1 | `GET /api/stores/home-feed` (+ region `?region=&district=`) | `prewarmStoresHomeRoute` + `StoresHomeHub.loadFeed` | **예** (목록) |
| 2 | `GET /api/stores/taxonomy` | prewarm + `StoresHomeQuickCategories` | **예** (카테고리 레일) |
| 3 | `GET /api/me/store-orders?hub_summary=1` | prewarm + `StoresHub.loadBuyerHub` | 아니오 (활성 주문 카드) |
| 4 | `GET /api/me/address-defaults` | `useDeliveryHomeHeaderAddress` (헤더) | 헤더 한 줄 |
| 5 | `GET /api/stores/browse-featured-items?storeIds=...` | `useBrowseFeaturedItemsHydration` (피드 ID 확보 후, viewport/eager) | 아니오 (썸네일 보강) |

**네트워크 없음**: `StoresHomeHeroBanner` — 정적 `STORES_HOME_HERO_SLIDES`.

**RSC**: 페이지 본문은 client hub only (`CONTRACT` 주석). SEO metadata만 서버.

### 중복 호출 횟수 (코드 경로 기준)

| API | cold 진입 시 네트워크(예상) | 이유 |
|-----|---------------------------|------|
| `home-feed` | **1** | `fetchStoresHomeFeedDeduped` + prewarm 동일 single-flight |
| `taxonomy` | **1** | `fetchStoresTaxonomyDeduped` 5분 TTL; QuickCategories는 cache layout + fetch 2 effect이나 dedupe |
| `hub_summary` | **1** | prewarm + `useEffect` dedupe |
| `address-defaults` | **0~1** | boot/RSC 스냅샷 없으면 1; `peekFreshAddressDefaultsSnapshot` 히트 시 0 |
| `browse-featured-items` | **0~N** | 배치(매장당 cap); eager+viewport — 피드 행 수에 비례, 피드 API와 **분리** |

### banners / categories / summary / menus 분리

- **홈**: `summary`·`menus`·`banners` **없음** — `home-feed` 한 덩어리 + `taxonomy` 분리 + 허브 `hub_summary` 분리.
- **카테고리**: `taxonomy` 단독 authoritative (`stores-home-taxonomy-display-contract`).

### pageshow / focus / revalidate

| 트리거 | 대상 | 동작 |
|--------|------|------|
| `useRefetchOnPageShowRestore` | `home-feed` | bfcache 복귀 시 `loadFeed({ silent: true })` |
| 동일 | `hub_summary` | silent `loadBuyerHub` |
| `visibilitychange` (기본 on) | 위와 동일 | 450ms 디바운스 |
| Pull-to-refresh | feed + taxonomy + buyer hub | `force`/`clearStoresTaxonomyClientCache` |
| `KASAMA_BUYER_STORE_ORDERS_HUB_REFRESH` | hub_summary | 이벤트 1회 |

### prefetch

- BottomNav `router.prefetch("/stores")` + `prewarmBottomNavStoresTab` → **1~3 API**가 네비 전에 시작될 수 있음 (체감 개선용).
- `scheduleStoresBrowseListPrewarm` — 카테고리 탭 시 browse 목록 (홈 첫 페인트와 병렬 가능).

### 느린 API · 호출 순서

1. **Critical path**: `home-feed` (목록 스켈레톤 해제) ∥ `taxonomy` (카테고리) — 직렬 의존 없음.  
2. **Secondary**: `hub_summary`, `address-defaults`, `browse-featured-items` (이미지).

서버 hot path: `app/api/stores/home-feed/route.ts` — 회귀 lock `verify:stores-home-hub-contract`.

### 제거 가능(지연·병합) 요청

- `hub_summary` — 활성 주문 없으면 UI 거의 없음 → bootstrap defer 후보.  
- `browse-featured-items` — LCP 이후 idle (이미 viewport defer 있음).  
- `address-defaults` — app boot 또는 stores 전용 bootstrap에 **스냅샷 embed** 시 헤더 2차 요청 제거.

### bootstrap 통합 후보

| 후보 ID | 묶을 API | shape 변경 | 비고 |
|---------|----------|--------------|------|
| `stores-home-bootstrap` | `home-feed` + `taxonomy` + 선택 `hub_summary` + `address-defaults` 스냅샷 | **신규 필드 추가만** (기존 route 유지 권장) | region suffix 키 설계 필요 |
| (유지) | featured-items | 분리 유지 | 매장 ID·viewport 의존 |

### 위험 파일

- `lib/stores/store-delivery-api-client.ts` — single-flight·TTL 계약  
- `lib/stores/stores-home-feed-load-policy.ts` — **DO NOT** 실패 시 `setStores([])`  
- `components/stores/home/hub/StoresHomeHub.tsx` — QuickCategories 분리 마운트 CONTRACT  
- `components/stores/home/hub/StoresHomeQuickCategories.tsx`  
- `lib/stores/stores-home-route-prewarm.ts`  
- `scripts/verify-stores-home-hub-contract.cjs`

### 다음 수정 제안

1. DevTools HAR로 cold 1회 측정 → `home-feed` p95 vs `taxonomy` p95 분리 기록.  
2. `stores-home-bootstrap` POC는 **region 키·캐시 무효화** 설계 후 (pull-refresh·region 변경).  
3. `hub_summary`를 bootstrap deferred wave로 옮기고 활성 주문 있을 때만 필드 포함.

---

## 2. `/stores/[slug]` (매장 소비자 메뉴 루트)

**진입**: `StoreDetailPublic` — RSC는 SEO metadata만; 본문 **클라 split hydrate** (`initialApiResponse={null}`).

### 호출 API 목록 (초기 `loadSplitDetail`)

| 병렬 그룹 | API | 역할 |
|-----------|-----|------|
| A (즉시) | `GET /api/stores/:slug/menus` | 메뉴 카탈로그 (워터폴 최우선 스케줄) |
| B | `GET /api/stores/:slug/summary` | 헤더·주문 가능·즐겨찾기 메타 |
| C | `GET /api/stores/:slug/banners` | 배너 |
| D | `GET /api/stores/:slug/notices` | 공지 |
| Fallback | `GET /api/stores/:slug` (monolith) | summary 실패 또는 menus 미적용 시 **legacy** |

**서브 경로** (`/info`, `/reviews`, …): `StoreSlugStickyBar` → 추가 `GET /api/stores/:slug` (sticky 헤더). 메뉴 루트는 SlideShell 내부 헤더 사용.

**reviews-summary**: 이 화면 진입 기본 경로에서는 **미호출** (리뷰 탭 전용).

### 중복 호출 횟수

| API | cold | warm / 캐시 |
|-----|------|-------------|
| `summary` | 1 | TTL·`peekStoreSummaryPublicCache` 히트 시 네트워크 0 |
| `menus` | 1 | `store-menus-public-server-cache` SWR |
| `banners` / `notices` | 각 1 | dedupe slug 키 |
| `GET /api/stores/:slug` | **0~2** | summary·menus 실패 시만; sticky bar 경로는 +1 가능 |

**sticky + detail 동시**: 메뉴 루트와 sticky layout이 겹치면 `summary` vs full store **중복 위험** — 현재 메뉴 루트는 split만 사용.

### pageshow / focus

- `useRefetchOnPageShowRestore` → `loadSplitDetailSilent()` (summary·menus·ban·not 재요청, silent).

### prefetch

- 홈 `browse`·카드 링크 `prefetch` 정책에 따라 `summary` 시드(`peekStoreDetailInstantHydrate`) 가능 — 네트워크 0.

### 느린 API · 순서

```
menus START ─┬─ summary START
             ├─ banners START
             └─ notices START
await summary + menus apply
→ (실패 시) legacy GET /api/stores/:slug
```

**병목**: `menus` RPC/snapshot (`get_store_menus_snapshot`) — `docs/perf/store-menus-regression-lock.md`.  
**secondary**: `summary` (`delivery-summary-regression-lock`).

### 제거 가능 요청

- `banners`·`notices` — 첫 페인트 이후 idle (헤더·메뉴만으로 주문 가능 시).  
- legacy `GET /api/stores/:slug` — snapshot 경로 안정 시 호출 0 유지 목표.

### bootstrap 통합 후보

| 후보 | 묶음 | 주의 |
|------|------|------|
| `store-storefront-bootstrap` | `summary` + `menus` + `banners` + `notices` | **이미 분리가 회귀 lock** — 통합 시 메뉴만 invalidate·SWR 깨짐 |
| 현실적 | `summary`+`menus` **2-RTT 유지**, ban/not deferred | shape 변경 없이 wave만 조정 |

### 위험 파일

- `components/stores/StoreDetailPublic.tsx` — Phase2 워터폴·DO NOT monolith 복귀  
- `lib/stores/store-delivery-api-client.ts`  
- `lib/stores/store-menus-public-server-cache.ts`  
- `app/api/stores/[slug]/menus/route.ts`, `summary/route.ts`  
- `components/stores/StoreSlugStickyBar.tsx`

### 다음 수정 제안

1. `loadSplitDetail` trace 로그로 `summary_fetch_ms` / menus apply 순서 3회 측정.  
2. ban/not를 `requestIdleCallback` wave2로 — CONTRACT 주석·changelog 필수.  
3. sticky bar와 detail이 동시인 라우트만 slug 단일 flight 감사.

---

## 3. `/community-messenger` (메신저 홈)

**진입**: RSC **부트스트랩 없음** (`page.tsx` 주석) — `CommunityMessengerHome` + layout `MessengerBootstrapEarlyWarm`.

### 호출 API 목록 (cold, 캐시 미스)

| 단계 | API | 모드 |
|------|-----|------|
| 0 (선택) | `GET /api/community-messenger/bootstrap?lite=1` | 탭 prewarm / early warm |
| 1 | `GET /api/community-messenger/bootstrap?tier=critical` | 첫 리스트 페인트 |
| 2 (idle) | `GET /api/community-messenger/bootstrap?lite=1` | full 필드 보강 |
| 3 (+250ms) | `GET /api/community-messenger/home-sync` | silent refresh |
| 4 (+1200ms) | `GET /api/community-messenger/bootstrap?callsLog=1` | 통화 로그 deferred |
| 5 (+1800ms) | `GET /api/community-messenger/open-groups` | discoverable groups |
| (탭) | `GET /api/community-messenger/trade-chat-list-meta` | 거래 채팅 탭 idle |

**프로필**: CM bootstrap payload 내 `me` — 별도 `profile?lite`와 **데이터 중복** 가능(필드 subset 다름).

### 중복 호출 횟수

| API | 예상 |
|-----|------|
| `bootstrap?lite=1` | prewarm+critical 경로 **1** (single-flight); 이후 idle lite는 **의도적 2단계** |
| `bootstrap?tier=critical` | 1 / refresh마다 1 |
| `home-sync` | silent TTL·debounce (`cm-home-silent-lists-fetch`) — 연속 0~1 |
| `open-groups` | follow-up 1 |

### pageshow / focus

- `use-community-messenger-home-bootstrap` — stale cache resume, silent refresh, 20s cooldown.  
- `visibility` / room entry — `shouldDeferHomeSyncStart` 등으로 home-sync 억제.  
- layout `CommunityMessengerRoomClientPrefetch` — **방 RSC prefetch** (홈 API와 별도).

### prefetch

- `warmMessengerListBootstrapClient` / BottomNav messenger prewarm.  
- `router.prefetch("/community-messenger")`.

### 느린 API · 순서

**Critical**: `bootstrap?tier=critical` (DB snapshot 1 RTT 목표).  
**느린 defer**: `lite` full merge, `home-sync`, `open-groups`.  
회귀: `docs/perf/cm-bootstrap-regression-lock.md` — lite cold **다중 wave 금지**.

### 제거 가능 요청

- prewarm `lite` + 진입 `critical` **동시 스케줄** — 캐시 히트면 0이나 dev에서 Compiling 2회처럼 보일 수 있음.  
- `callsLog=1` — 통화 탭 미방문 시 skip.  
- `trade-chat-list-meta` — trade 탭 선택 시에만.

### bootstrap 통합 후보

- **이미 존재**: critical → lite → home-sync 파이프라인.  
- 개선: `home-sync` 응답에 open-groups 일부 embed (정책 `docs/messenger-realtime-policy.md`와 정합 필요).  
- **금지**: lite cold에서 rooms+profiles 다파 wave 재도입.

### 위험 파일

- `lib/community-messenger/home/use-community-messenger-home-bootstrap.ts`  
- `lib/community-messenger/cm-bootstrap-client-fetch.ts`  
- `lib/community-messenger/bootstrap-cache.ts`  
- `app/api/community-messenger/bootstrap/route.ts`  
- `lib/community-messenger/cm-home-silent-lists-fetch.ts`  
- `components/community-messenger/MessengerBootstrapEarlyWarm.tsx`

### 다음 수정 제안

1. `window.__dibayBootVerify` + `copy(JSON.stringify(...))` 로 화면별 bootstrap 단계 카운트.  
2. critical-only 첫 방문 UX 검증 후 lite 지연 ms 튜닝.  
3. trade 탭 meta를 bootstrap deferred 필드로 흡수 검토 (shape additive).

---

## 4. `/mypage` (내정보 허브)

**진입**: RSC `loadMypageServerShell` (Suspense 내부) — **hub 숫자는 RSC 생략**, 클라 `useMypageHubModel`.

### 호출 API 목록

| 레이어 | API / 데이터 | 비고 |
|--------|----------------|------|
| RSC | `runMeProfileReadPipeline` (서버 DB) | 브라우저 REST 아님 |
| RSC | Supabase `my_page_banners` / `my_services` / `my_page_sections` | REST 아님 |
| RSC | `loadAddressDefaultsSnapshotServer` | 스냅샷을 props로 전달 |
| Client | `GET /api/me/profile` (via `getMyPageData`→`getMyProfile`) | **초기 data 있으면 생략** |
| Client | `GET /api/me/address-defaults` | RSC 스냅샷 없을 때만 |
| Client | `GET /api/my/trade-counts` | 구매·판매 건수 |
| Client | `GET /api/me/stores` | `hasOwnerStore` 일 때 |
| Client | `GET /api/me/stores/:id/order-counts` | 승인 매장 1곳 targeting |
| Client | `GET /api/me/settings` | `syncUserSettings` (배너 숨김 등) |

**badge**: 전역 `store-owner-hub-badge` (mypage 전용 아님).

### 중복 호출 횟수

| API | 첫 진입 (RSC+client) |
|-----|----------------------|
| `profile` | **0~1** (RSC가 이미 profile; client `getMyPageData` skip) |
| `profile?lite` (boot) | boot와 **dedupe** |
| `address-defaults` | **0** (RSC snapshot seed 시) |
| `trade-counts` | 1 |
| `me/stores` | 0~1 |
| `order-counts` | 0~1 |

### pageshow / focus

- `pageshow` + `persisted` → `load({ silent })` + `loadAddressDefaults` — **bfcache 복귀 시 profile·주소 재요청**.  
- `PROFILE_UPDATED_EVENT` / `SAMARKET_ADDRESSES_UPDATED_EVENT`.

### prefetch

- `prewarmBottomNavMypageTab` → `fetchMeProfileDeduped` (캐시 fresh면 0).

### 느린 API

- `trade-counts` + `me/stores` + `order-counts` **직렬 블록** (`loadCounts` 내부) — 오너일 때 3 RTT.  
- RSC CMS pack 180ms timeout — 느리면 기본값.

### 제거 가능 요청

- `syncUserSettings` — localStorage 히트 후 백그라운드만.  
- `order-counts` — 허브 카드 미노출 시 defer.  
- client `getMyPageData` — RSC shell 충분 시 **영구 제거** 후 이벤트만 partial patch.

### bootstrap 통합 후보

| 후보 | 묶음 |
|------|------|
| `mypage-hub-bootstrap` | `trade-counts` + `me/stores` + `order-counts` + `address-defaults` 스냅샷 |
| (유지) | CMS banners/services/sections — RSC 유지 (관리자 편집 빈도 낮음) |

### 위험 파일

- `lib/my/load-mypage-server.ts` — `loadMypageServerShell` vs `loadMypageServer` 분리 |
- `hooks/use-mypage-hub-model.ts` |
- `lib/my/getMyPageData.ts` |
- `lib/mypage/trade-history-client.ts`

### 다음 수정 제안

1. `hubServerExtras`를 다시 RSC에 넣지 말 것(주석 의도) — 대신 **단일 hub-bootstrap API**.  
2. `loadCounts` 내부 `me/stores`∥`trade-counts` 병렬화 후 order-counts만 조건부.  
3. bfcache `pageshow`는 address만 갱신, full `getMyPageData`는 플래그로 제한.

---

## 5. 메인 홈 (`/home` → `/philife`)

| 경로 | 동작 |
|------|------|
| `app/page.tsx`, `app/(main)/home/page.tsx` | **`redirect("/philife")`** |
| 실질 메인 | **`/philife`** — `PhilifeFeedClientEntry` → `CommunityFeed` |

### 호출 API 목록 (`/philife` cold)

| API | 주체 |
|-----|------|
| (공통) boot + deferred `neighborhood-feed` | App boot scheduler |
| `GET /api/philife/neighborhood-feed?globalFeed=1&...` | Feed load (`fetchNeighborhoodFeedShortTtl`) |
| `GET /api/philife/neighborhood-topic-options` | 칩·카테고리 |
| `GET /api/ads/active?boardKey=plife` | 광고 슬롯 (Feed 내) |
| (선택) `GET /api/community-messenger/rooms/:id/meeting-ensure-participant` | 모임 카드 액션 시 |

**탭 prewarm** (`prewarmBottomNavPhilifeTab`): `neighborhood-feed` × (latest + recommended + 칩 2개) + `neighborhood-topic-options` — **최대 4~5 feed URL**, 12s cooldown.

### 중복 호출 횟수

| API | cold 직접 방문 | 탭 prewarm 후 |
|-----|----------------|---------------|
| `neighborhood-feed` (default sort) | 1 | **0~1** (sessionStorage·single-flight) |
| `neighborhood-feed` (recommended) | 0~1 | prewarm만 |
| `topic-options` | 1 | 0~1 |

### pageshow / focus

- Feed 내부 scroll restore·category change 시 **추가 feed fetch** (페이지네이션).  
- global boot deferred와 **동일 URL**이면 short-TTL replay.

### 느린 API

- `neighborhood-feed` — 목록 전체.  
- `topic-options` — 칩 렌더 blocking 가능.

### 제거 가능 요청

- boot deferred `neighborhood-feed` vs 화면 mount **중복** — startup scheduler에서 philife 탭 미예상 사용자에게는 낭비.  
- prewarm recommended variant — 첫 페인트 불필요 시 1종만.  
- `ads/active` — idle.

### bootstrap 통합 후보

- `philife-home-bootstrap`: `neighborhood-feed` (첫 페이지) + `topic-options` + (선택) ads 메타.  
- trade 홈(`/market`)과 **혼동 금지** — 거래 목록은 `getPostsForHome` / `/api/philife/posts` 별도 (`trade-home-list-invariants`).

### 위험 파일

- `components/community/CommunityFeed.tsx`  
- `lib/philife/fetch-neighborhood-feed-short-ttl.ts`  
- `lib/main-menu/bottom-nav-tap-prewarm-philife.ts`  
- `lib/community/philife-feed-session-cache.ts`

### 다음 수정 제안

1. App boot deferred에서 philife feed **탭 prewarm과 역할 분담** (한 경로만).  
2. `verify:routes`상 `/home`은 redirect 유지 — bootstrap 문서에 **philife=메인** 고정.  
3. HAR로 prewarm 3 feed variant 실측 후 1종으로 축소.

---

## 6. 화면 간 교차 중복 (profile / badge / session)

| 리소스 | 교차 호출 경로 | 완화 |
|--------|----------------|------|
| Profile lite | App boot, Region, mypage prewarm, `getMyProfile` | `fetch-me-profile-deduped` 4s TTL |
| Profile full | Boot background, consent flows | boot bridge 3s |
| Hub badge | Boot background, BottomNav | `owner-hub-badge-store` 5s |
| Address defaults | Stores header, mypage, MandatoryAddressGate | snapshot TTL·RSC seed |
| Session | OAuth `SessionLostRedirect` | 3s TTL, boot와 별도 |

---

## 7. bootstrap 통합 우선순위 (네트워크-only v1 제안)

| 순위 | 대상 | 이유 | 리스크 |
|------|------|------|--------|
| 1 | **Stores home** (`home-feed`+`taxonomy`+optional hub/address) | RTT 3~4 → 1, 계약 검증 스크립트 있음 | region·pull-refresh |
| 2 | **Mypage hub counts** | 오너 3 RTT 직렬 | RSC/클라 이중화 재발 |
| 3 | **Philife first paint** | prewarm·boot·mount 삼중 | feed sort variant |
| 4 | **Store slug ban/not defer** | split 유지, wave만 | menus/summary lock |
| 5 | **CM** | 이미 tier化 — open-groups/home-sync 정리만 | `cm-bootstrap-regression-lock` |

**공통 원칙** (사용자 절대 규칙과 정합):

- 기존 route **삭제·shape 변경 없이** `?bootstrap=1` 또는 신규 aggregate **additive** 필드.  
- 클라는 점진적 소비 + fallback to legacy routes.  
- 변경 시 `docs/trade-perf-hot-path-changelog.md` / domain changelog append.

---

## 8. 측정·검증 명령 (다음 라운드)

```bash
# dev 서버 실행 후
# 브라우저: copy(JSON.stringify(window.__dibayBootVerify))
node scripts/dibay-boot-verify-report.mjs journal.json

npm run verify:stores-home-hub-contract
npm run verify:trade-hot-path-contract   # 거래·CM 경계 작업 시
# hub badge
node scripts/measure-owner-hub-badge-perf.mjs
```

**DevTools Protocol**: 각 URL hard reload 3회 — Initiator chain으로 `profile`·`bootstrap`·`home-feed` 카운트.

---

## 9. 요약 표

| 화면 | 초기 API 수 (cold, dedupe 후) | 최대 중복 위험 | 가장 느린 축 |
|------|------------------------------|----------------|--------------|
| `/stores` | 4~6 | taxonomy/feed prewarm+mount | `home-feed` |
| `/stores/[slug]` | 4 (+legacy 0~2) | sticky `GET /stores/:slug` | `menus` |
| `/community-messenger` | 2~5 (단계적) | lite+critical+home-sync | `bootstrap critical` |
| `/mypage` | 3~5 REST (+RSC DB) | boot profile + bfcache reload | owner `loadCounts` |
| `/philife` (메인) | 2~6 | boot deferred + prewarm + mount | `neighborhood-feed` |

---

## 10. `/stores` 홈 1차 수정 (network-bootstrap-v1, 2026-05-27)

**범위**: `/stores` 홈 클라이언트 fetch 중복만 축소. API shape·DB·UI 디자인·다른 라우트 미변경.

### 수정한 파일

| 파일 | 변경 요약 |
|------|-----------|
| `lib/stores/stores-home-network-guards.ts` | **신규** — hub_summary 재fetch gap·home-feed single-flight 키 |
| `lib/stores/stores-home-route-prewarm.ts` | `hub_summary` prewarm → `requestIdleCallback` (critical path 이후) |
| `lib/stores/store-delivery-api-client.ts` | hub_summary 네트워크 시각 기록·`force` 옵션 |
| `components/stores/StoresHub.tsx` | prewarm에 `language` 전달·fresh hub 캐시 시 mount fetch 생략·skip guard·visibility refetch 끔 |
| `components/stores/home/hub/StoresHomeHub.tsx` | fresh 캐시 시 silent 포함 네트워크 생략·prewarm in-flight 합류·visibility refetch 끔 |
| `components/stores/home/hub/StoresHomeQuickCategories.tsx` | taxonomy TTL fresh 시 mount fetch 생략 |
| `hooks/use-delivery-home-header-address.ts` | address-defaults TTL 캐시 있으면 pathname mount fetch 생략 |

### 제거·완화한 중복 호출

| API | 이전 | 이후 |
|-----|------|------|
| `GET /api/me/store-orders?hub_summary=1` | prewarm(sync) + mount `useEffect` + visibility 복귀 | idle prewarm + **fresh 캐시면 mount 0회** + 10s min-gap + bfcache만 복귀 |
| `GET /api/stores/home-feed` | prewarm ∥ mount(별도 flight 가능) + **fresh여도 silent 재fetch** | **in-flight 합류** + **fresh TTL이면 fetch 생략** + visibility 복귀 끔 |
| `GET /api/stores/taxonomy` | prewarm + QuickCategories effect(캐시 있어도 await) | prewarm·mount **동일 language** + **TTL fresh면 effect 네트워크 생략** |
| `GET /api/me/address-defaults` | pathname마다 `load()` (캐시 hit은 무네트워크였으나 호출 스택 유지) | **peek fresh면 effect 자체 생략** |

**건드리지 않음**: `GET /api/me/profile`·`store-owner-hub-badge`(앱 boot 레이어), `browse-featured-items`(viewport defer 유지).

### 유지한 기능

- Pull-to-refresh·`hub_summary` / feed **force** reload
- 지역 `querySuffix`별 `home-feed` 키·빈 suffix prewarm
- taxonomy pull-refresh 시 `clearStoresTaxonomyClientCache` 후 강제 fetch
- bfcache `pageshow` 복귀 시 feed/hub **silent** 재검증(단 visibility 즉시 재호출은 제거)
- 스토어 홈 CONTRACT(`QuickCategories` 항상 마운트·feed 실패 시 목록 유지 등)

### 건드리지 않은 영역

- `/stores/[slug]`·`StoreDetailPublic`·menus/summary split
- `/community-messenger`·`/mypage`·`/philife`
- API route 구현·응답 JSON shape
- UI 레이아웃·문구·색상

### 1차 보정 (검증 라운드, 동일 브랜치)

- `hub_summary` `fetchMeStoreOrdersHubSummaryDeduped({ force })` — PTR·이벤트 갱신 시 캐시 우회
- `KASAMA_BUYER_STORE_ORDERS_HUB_REFRESH` → `loadBuyerHub({ force: true })`
- idle prewarm `hub_summary` — `shouldSkipStoresHomeHubSummaryFetch()` 통과 시만 네트워크
- bfcache `pageshow` — `fromBfcacheRestore` 로 feed/hub **fresh여도 silent 재검증** (visibility 와 분리)
- `popstate` — address-defaults TTL fresh 시 `load` 생략

### 확인 방법

```bash
npm run build
npm run verify:stores-home-hub-contract
```

1. DevTools → Network, **Disable cache**, hard reload `/stores` 3회.  
2. 동일 필터로 `home-feed`·`taxonomy`·`hub_summary`·`address-defaults` **완료(200) 행 수** 집계.  
3. 다른 탭 갔다가 5초 내 복귀 — `visibilitychange`만으로 위 4 API가 **즉시 재요청되지 않는지** 확인.  
4. Pull-to-refresh — feed·hub가 **의도적으로** 다시 뜨는지 확인.

---

*§1~9는 초기 감사 산출물. §10부터 구현 이력을 append한다.*

## 11. 앱 boot 네트워크 최적화 라운드 마감 점검 (2026-05-27)

### 상태 표기

- 라운드 상태: **PARTIAL PASS** (`/stores` §12 sign-off **PASS**; `/mypage`·`/philife` 수동 Network **PENDING**)
- `npm run build`: **PASS**
- `npx tsc --noEmit`: **PASS**
- 코드 수정 없음: **PASS**
- DevTools Network 수동 확인 (`/stores`): **PASS** (§12)
- 최종 sign-off (`/stores`): **PASS** (§12)

### 완료 항목

- `npx tsc --noEmit` 통과
- `npm run build` 통과
- `/stores`·`/mypage`·`/philife`·hub-badge 관련 계약/가드 코드 경로 재확인 완료

### 유지한 계약

- UI/CSS/기능/API shape 무변경
- `/stores` home feed/taxonomy/hub_summary/address-defaults dedupe/TTL/skip 가드 유지
- `/mypage` buyer order count는 RSC `homeDashboardCounts.storeOrderCount` 우선, list fallback은 RSC 미존재 시만
- `/philife` notification-settings snapshot single-flight + 20s TTL + sessionStorage 유지
- hub-badge `MIN_FETCH_GAP_MS=25000`, `MIN_VISIBILITY_FETCH_GAP_MS=45000`, `OWNER_HUB_BADGE_POLL_INTERVAL_MS=180000` 유지

### 남은 위험

- 수동 브라우저 Network 미측정 상태(환경 제약)에서는 실제 사용자 흐름에서의 burst 체감 여부 최종 확정 불가
- hub-badge는 예약 경로가 다수라 trace 상 호출 시도 로그가 많아 보일 수 있음(HTTP는 gap/single-flight로 수렴 설계)
- notification-settings는 snapshot 경로와 GET 경로가 분리되어 특정 화면 조합에서 DevTools에 2종 호출로 보일 수 있음(계약상 정상)

### 수동 Network 확인 결과

- `/stores` Hard reload: **PASS** — §12 (`ko`, cache off, region 2키·language race 마감)
- `/mypage` Hard reload: **미실측**
- `/philife` Hard reload: **미실측**
- 탭 이동 후 5초 내 복귀: **미실측**
- pull-to-refresh: **미실측**

> `/stores` 네트워크 최적화 라운드는 §12 sign-off **PASS**. `/mypage`·`/philife`·탭 복귀·pull-to-refresh 실측은 별도 라운드.

---

## 12. `/stores` 네트워크 최적화 라운드 최종 마감 (2026-05-28)

**범위**: `/stores` 홈 critical path — language race·region 2키·prewarm/mount 헤더 구분. **코드·UI·CSS·기능 변경 없음**(문서 마감만).

### 완료 항목

| # | 항목 | 상태 |
|---|------|------|
| 1 | `/stores` **language race** 수정 완료 (`peekStoresHomePrewarmLanguage` — hydration 전 `getRuntimeAppLanguage()` FALLBACK(en) 회피) | **완료** |
| 2 | **ko** hard reload (Network cache off) | **PASS** |
| 3 | **region 2키** (기본 `home-feed` + `?region=…`) | **PASS** |

### Network 계약 (hard reload `/stores`, 로그인·프로필/지역 컨텍스트)

| API | 허용 호출 수 | 비고 |
|-----|-------------|------|
| `GET /api/stores/home-feed` | **지역 없음: 1회** | suffix `""` |
| `GET /api/stores/home-feed?region=…` | **지역 있음: 최대 2회** (기본 1 + region 1) | prewarm `""` + mount/region suffix |
| `GET /api/stores/taxonomy` | **1회** | prewarm·mount single-flight 합류 |
| **en fallback** (`Accept-Language` primary `en-US`) | **0회** | |
| **Accept-Language** | **ko-KR 계열** (`ko-KR,ko;q=0.9,…`) | stores browse/home-feed 클라 헤더와 정합 |
| **`x-samarket-client-call-source`** | `stores_home_prewarm` · `stores_home_mount` | home-feed 2키에서 구분 관측; taxonomy는 합류 시 1헤더만 보일 수 있음 |

### 실측 스냅샷 (Playwright, `127.0.0.1:3000`, cache disabled, `samarket_app_language=ko`, hard reload)

- `home-feed`: 2회 — `/api/stores/home-feed?region=Quezon+City` (`stores_home_mount`), `/api/stores/home-feed` (`stores_home_prewarm`)
- `taxonomy`: 1회 — `stores_home_mount`
- `Accept-Language`: 전 요청 `ko-KR,ko;q=0.9,en;q=0.3`
- `en-US` primary: 0

### 최종 상태

| 게이트 | 결과 |
|--------|------|
| CODE | **PASS** |
| BUILD | **PASS** (`npm run build`) |
| TSC | **PASS** (`npx tsc --noEmit`) |
| NETWORK | **PASS** (§12 계약·실측) |
| **`/stores` sign-off** | **PASS** |

### 확인 명령

```bash
npm run build
npx tsc --noEmit
npm run verify:stores-home-hub-contract
```

DevTools: **Disable cache** → hard reload `/stores` (언어 **ko**, 프로필 지역 있는 계정) → `home-feed`·`taxonomy` 행 수·`Accept-Language`·`x-samarket-client-call-source` 집계.
