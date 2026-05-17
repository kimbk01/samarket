# DIBAY 상태 소유권 맵 (State Ownership Map)

> **2차 구조 고정** — 2026-05-16. 코드 grep·파일 경로 기준.  
> **원칙**: 런타임 **writer 1개** · 나머지는 **read-only derive** 또는 **명시적 reducer 1개**로만 쓴다.  
> **연동**: [dibay-performance-lock.md](./dibay-performance-lock.md), [dibay-architecture-cleanup.md](./dibay-architecture-cleanup.md).

---

## 0. 용어

| 용어 | 의미 |
|------|------|
| **OWNER** | 유일한 쓰기 권한 (React `setState` / Zustand `set` / 서버 응답 조립) |
| **WRITER 수** | 프로덕션 경로에서 동일 필드를 직접 mutate 하는 독립 모듈 수 |
| **DERIVE** | OWNER 상태에서 `useMemo` 등으로만 계산 — 쓰기 없음 |
| **REDUCER (목표)** | 아직 없음 — 2차 이후 **1개**로 통합할 패치 진입점 |

---

## A. 메신저 ownership map

### A.1 요약 표

| 상태 | 현재 writer 수 | 현재 사실상 owner | 충돌 | 목표 OWNER (1 writer) | CLEAR 책임 |
|------|----------------|-------------------|------|------------------------|------------|
| **room list** (`chats`/`groups`) | **1** | `applyHomeListPatch` (`home-list-patch.ts`) | **해소** | 동일 — R2-M1 | `clearBootstrapCache` + `setData(null)` on logout |
| **unread (방별)** | **2** | `room.unreadCount` in bootstrap **+** `local-read-guard` (reducer) | **부분** | bootstrap row + guard **단일 merge** in reducer | guard TTL 20s lazy; logout `clearLocalReadGuards` |
| **unread (허브 합)** | **2** | `applyCommunityMessengerUnreadOptimistic` + bootstrap recompute | 부분 | reducer 출력 `totalUnread` only | unread bridge on logout |
| **room metadata** (`contextMeta` trade 등) | **4** | home-sync critical_patch, trade-meta hydration, RT summary, server mark_read | **예** | reducer `mergeRoomSummary` (기존 `mergeMessengerRoomSummaryForHomeSyncCriticalPatch` 승격) | server home-sync authoritative on full tier |
| **room list UI derive** | 0 (derive) | `use-community-messenger-home-state` | 없음 | DERIVE only from `data` | — |
| **room patch (말풍선/프리뷰)** | **4** | RT insert patch, bump, bus `cm.room.message_sent`, phase1 | **예** | open room: `messenger-realtime-store` messages; list preview: **reducer only** | room close: activeRoomId null |
| **room detail / messages** | **3** | `room-snapshot-cache`, `messenger-realtime-store.messagesByRoomId`, phase1 bootstrap | **예** | **open room** snapshot cache + RT store messages; list와 **분리** | prune cap 280; leave room dispose |
| **presence** | **2** | `use-community-messenger-presence-runtime` + server snapshot | 낮음 | presence runtime scoped to visible peers | unsubscribe on leave hub/room |
| **participant state** | **2** | bootstrap members + silent delta merge | 낮음 | room snapshot OWNER | — |
| **notification / hub badge** | **3** | `requestMessengerHubBadgeResync`, unread bridge, bus | **예** | `messenger-notification-contract` single resync queue | — |
| **bootstrap payload cache** | **6+ primers** | `bootstrap-cache.ts` sessionStorage | **예** (stale) | **read-through** bootstrap OWNER only writes | `clearBootstrapCache` (`logout-client`, auth) |
| **optimistic read** | **3** | `setLocalReadGuard`, `applyRoomReadEvent`, `cm-read-ui-patch` | **예** | mark_read effect → reducer + guard | guard TTL |
| **mark_read (server)** | **1** | `markCommunityMessengerRoomAsRead` in `service.ts` | 없음 | 유지 | — |
| **home-sync network** | **1** | `GET …/home-sync` route + singleflight | 없음 | 유지 (서버 OWNER) | route process cache TTL |

### A.2 room list — writer 상세 (충돌 핵심)

| # | Writer 모듈 | API | 충돌 내용 |
|---|-------------|-----|-----------|
| 1 | `home/use-community-messenger-home-bootstrap.ts` | `setData`, `mergeHomeSyncIntoBootstrap` | **주 OWNER** — critical/full/lite |
| 2 | `home/use-community-messenger-home-realtime-bootstrap-list.ts` | `setData`, `applyRoomSummaryPatched`, `patchBootstrapRoomList*` | RT와 React state **이중** |
| 3 | `CommunityMessengerHome.tsx` | `setData` ×**16** | 수동 merge·trade enrich |
| 4 | `merge-discoverable-open-groups-client.ts` | `setData` | open groups |
| 5 | `use-trade-chat-list-meta-hydration.ts` | `setData` | trade meta patches |
| 6 | `dev/cm-raf-home-list-patch.ts` | `setData` | dev RAF batch |
| 7 | `stores/messenger-realtime-store.ts` | `seedBootstrap`, `applyRoomSummaryPatched` | **Zustand parallel truth** |

**multi-tab-bus** (`cm.home.merge_room_summary`, `cm.room.read`, …): 이벤트는 **7번 hook/listener**에서 다시 `setData` / `applyRoomSummaryPatched` 호출 → **사실상 8번째 writer**.

### A.3 unread — writer 상세

| # | Writer | 필드 |
|---|--------|------|
| 1 | bootstrap `room.unreadCount` | list row |
| 2 | `messenger-realtime-store` | `unreadByRoomId`, `totalUnread` |
| 3 | `local-read-guard.ts` | suppress stale |
| 4 | `cm-read-ui-patch` | optimistic 0 |
| 5 | `use-community-messenger-realtime.ts` | bump local unread activity ref |

**목표**: unread 표시는 **`resolveUnreadWithLocalReadGuard` 단일 함수**만 — 호출은 reducer 내부 exclusively.

### A.4 Realtime (메신저) lifecycle

```
등록: subscribeWithRetry (10+ call sites) / room-bump pool / home channels bind
유지: grace 4s (home), retry backoff, auth bridge
pause: room entry priority mode, visibility
cleanup: stop() on unmount — 누락 시 roomBumpEntries·dev 5s interval 잔류
```

| 측정 항목 | 현재 | 목표 |
|-----------|------|------|
| subscribe scopes (파일 수) | **30+ files** import subscribe/realtime | registry refcount |
| duplicate channel name | 관측만 (`duplicate_instance_same_name`) | registry dedupe |
| cleanup miss | bump Map, dev timers | assert on route leave |
| auth refresh race | session route vs bootstrap | **LOCKED** dedup refresh |

**Realtime Registry 필요 여부**: **예** — 홈 meta+room bundle+trade listing+presence+friend+call이 **각자 stop**; coordinator 없음.

### A.5 Hydration · Fetch · Cache (메신저)

| 계층 | OWNER | WRITER | CLEAR |
|------|-------|--------|-------|
| Hydration (홈 목록) | `home-bootstrap` `data` | bootstrap API, home-sync merge | logout |
| Fetch bootstrap | `cm-bootstrap-client-fetch` single-flight | network | abort on refresh |
| Fetch home-sync | `cm-home-silent-lists-fetch` | silent tier | reentry TTL 800ms |
| Cache bootstrap | `bootstrap-cache.ts` | `prime*` on success only | `clearBootstrapCache` |
| Room snapshot | `room-snapshot-cache.ts` | bootstrap refresh, mark_read patch | TTL / reentry |

---

## B. 배달 ownership map

| 상태 | writer 수 | 현재 owner | 충돌 | 목표 OWNER | CLEAR |
|------|-----------|------------|------|------------|-------|
| **store detail public** | **2 API paths** | `StoreDetailPublic` split + legacy monolith | **예** | split APIs; monolith **cart SSR only** | slug change `loadGeneration` |
| **menu list** | **2** | `menusPromise` apply + legacy merge products | **예** | `menus` state in detail only | slug change |
| **product options** | **1** | `StoreProductAddSheet` + sheet store | 없음 | 유지 | sheet close |
| **cart lines** | **1** | `StoreCommerceCartContext` | 없음 | **LOCKED** | logout / `clearCart` |
| **cart snapshot bus** | **1** | `publishCommerceCartSnapshot` sync | 없음 | 유지 | — |
| **order summary (cart page)** | **2** | SSR seed + `fetchStorePublicBySlugDeduped` | 부분 | cart entry SSR OWNER | — |
| **owner order list** | **3** | `load()` + `useSupabaseStoreOrdersRealtime` + **45s poll** | **예** | **단일**: row-patch hook OR reload, not both | unmount |
| **owner order row-patch (dead)** | 0 used | `useOwnerStoreOrdersRealtime` | N/A | **삭제 또는 승격** | — |
| **settlement / SLA / alerts** | 분산 | admin + owner APIs | 미정 | 별도 라운드 | — |
| **recommendation sections** | **1** | derived from menus payload in detail | 없음 | derive | — |
| **store API cache** | **1 module** | `store-delivery-api-client` Map | drift if key mismatch | **LOCKED** dedupe keys | TTL expiry |

### B.1 monolith vs split 충돌

| 소비자 | monolith `fetchStorePublicBySlugDeduped` | split `summary/menus/...` |
|--------|------------------------------------------|---------------------------|
| `StoreDetailPublic` | fallback on error | **primary** |
| `StoreCommerceCartPageClient` | yes | no |
| `StoreCartEntrySwitch` | yes | no |
| `StoreDetailInfoPublic`, sticky bar | yes | no |

**목표**: consumer detail = **split only**; monolith = **cart SSR + documented fallback once**.

### B.2 Dead path — 배달

| Path | 파일 | 왜 dead |
|------|------|---------|
| Row-patch owner RT | `hooks/stores/useOwnerStoreOrdersRealtime.ts`, `OwnerOrdersPageClient.tsx` | **app 라우트 미연결** — 운영은 `OwnerStoreOrdersView` only |
| `loadSplitDetailSilent` | `StoreDetailPublic.tsx` | `loadSplitDetail` 과 **~180줄 중복** — silent은 page show restore 전용 |

---

## C. 거래/커뮤니티 ownership map

| 상태 | writer 수 | 현재 owner | 충돌 | 목표 OWNER | CLEAR |
|------|-----------|------------|------|------------|-------|
| **trade home feed** | **2** | `getPostsForHome` cache + RSC `primeHomePostsCache` | 키 align 시 없음 | **`getPostsForHome` Map + sessionStorage** | `invalidateHomePostsCache` |
| **market category feed** | **2** | `MarketCategoryFeed` → `getPostsForHome` vs `/api/trade/feed` | **예** API 이원화 | 단일 API or explicit dual contract | — |
| **philife feed** | **3** | `CommunityFeed` `posts` + server 1200ms TTL + RSC seed | 부분 | `CommunityFeed` state + `fetchNeighborhoodFeedShortTtl` only | topic change reset |
| **infinite scroll** | **1** | Philife IO only; market **없음** | — | product decision per surface | unmount |
| **feed cache** | **2 layers** | server `neighborhood-feed-short-ttl` + client TTL | 의도적 | document keys | TTL |
| **comments/reactions** | per-post | post detail client | — | — | — |
| **image list** | DOM | Feed cards | retain | virtualize (순서 5) | unmount |
| **search state** | local | per-page `useState` | — | — | — |
| **notification** | 별도 | `/notifications` routes | — | — | — |

**feed source 단일화**: **아니오** — `GET /api/philife/posts`(trade home) ≠ `GET /api/community/neighborhood-feed`(philife) ≠ `GET /api/trade/feed`(category).

---

## D. 관리자 ownership map

| 상태 | writer 수 | 현재 owner | 충돌 | 목표 OWNER | CLEAR |
|------|-----------|------------|------|------------|-------|
| **dashboard payload** | **2** | RSC seed + `AdminDashboardPage` `setPayload` | poll merge | `fetchAdminDashboardStatsDeduped` → `setPayload` only | unmount |
| **ops console** | **3+** | `AdminOpsConsolePage` local state + 15s×2 intervals | **예** | page state + **one** poll coordinator | visibility |
| **monitoring metrics** | 분산 | perf pages, env | — | — | — |
| **table data** | per-page | each admin page `useState` | full DOM | pagination mandatory | route leave |
| **polling** | **10+ intervals** | each page owns `setInterval` | **storm** | `AdminLivePollCoordinator` (미구현) | visibility + unmount |
| **realtime (admin)** | sparse | `AdminCommunityMessengerPage`, stores | — | — | — |

**poll vs realtime 충돌**: owner orders = **Realtime onChange → full `load()`** + poll — **같은 OWNER `orders[]`에 이중 writer**.

---

## E. Memory ownership (retain 분류)

| Retain | 분류 | OWNER | CLEAR 책임 |
|--------|------|-------|------------|
| `service.ts` server Maps | intentional + **uncapped** | Node process | instance recycle / future cap |
| `bootstrap-cache` sessionStorage | intentional | prime on API success | `clearBootstrapCache` logout |
| `messenger-realtime-store` 280 rooms | intentional cap | Zustand prune | activeRoomId + cap |
| `roomBumpEntries` | **accidental if stop miss** | bump subscription hook | **last listener stop()** |
| `local-read-guard` Map | intentional 20s | read guard module | TTL on read |
| `CommunityFeed` posts[] | intentional + **unbounded scroll** | CommunityFeed | reset on filter change only |
| `StoreCommerceCartContext` localStorage | intentional | cart provider | user clear cart |
| `store-delivery-api-client` Map | intentional uncapped keys | dedupe client | TTL |
| `delivery-perf-trace` dedupeAt | intentional | trace module | `dedupeAt.clear()` test |
| admin poll timers | intentional | each page effect | **visibility stop** (owner만 있음) |
| Next dev HMR | dev-only | — | restart |

---

## F. Gigantic file — ownership 절단 계획 (즉시 분리 금지)

| 파일 | LOC | compile | heap | hydration | ownership 혼란 | 1차 절단 (OWNER 기준) |
|------|-----|---------|------|-----------|------------------|------------------------|
| `service.ts` | **~15,246** | high | home-sync route | — | bootstrap+HS+trade+messages | `bootstrap-service`, `home-sync-list`, `room-messages`, `trade-enrich` |
| `CommunityFeed.tsx` | **~1,442** | medium | client bundle | philife shell | feed+swipe+IO+topic | `usePhilifeFeedController`, `PhilifeFeedList`, `PhilifeFeedChrome` |
| `AdminOpsConsolePage.tsx` | **~1,364** | medium | admin | — | ops+poll+modals | tabs as lazy chunks + poll coordinator |
| `StoreDetailPublic.tsx` | **~1,196** | medium | detail | client-first | load×2+menus+cart | `useStoreDetailLoad`, `StoreDetailMenus`, `StoreDetailChrome` |
| `CommunityMessengerHome.tsx` | large | high | messenger | — | **16× setData** | thin shell → hooks only |

**절대 지금 하지 않음**: 파일 split without **reducer OWNER** 먼저 — split만 하면 writer 수 증가.

---

## G. Double Check (2차)

| 1차 주장 | 재검증 |
|----------|--------|
| room list writer 7+ | **확인** — bus listener 포함 시 8+ |
| useChatStore dead | **확인** — `useChatStore(` 호출 **0**; `chat-store-from-server` **0 import** |
| Owner row-patch dead | **확인** — `OwnerOrdersPageClient` **라우트 0** |
| messenger-realtime-store parallel truth | **확인** — `seedBootstrap` + list `setData` 동시 |
| feed 단일화 됨 | **부정** — 3 API |
| fake fast | shell 2–3ms ≠ composer_wall 1.5–5s — **별 OWNER metric** |

**보이는 속도 vs 실제 비용**

| 표면 | 실제 비용 |
|------|-----------|
| PASS0 shell 2ms | home-sync 2s, full bootstrap MISS 200–500ms still scheduled |
| DS2 option 0ms | menu_fetch network; cart DS3 unmeasured |
| `/market` warm 55ms | `/post` cold 1617ms |
| owner “Realtime” | **full reload** on every change |

---

## H. 이번 라운드 구조 수정 후보 (원인 1개씩만)

| 순서 | 원인 1개 | 구조 수정 1개 | 측정 | lock |
|------|----------|---------------|------|------|
| **R2-M1** | ~~room list writer 7+~~ | **완료** — `verify:messenger-home-list-owner` | 브라우저 3회 측정 대기 | performance-lock M-OWN-1 |
| **R2-M2** | ~~Zustand parallel list~~ | **완료** — RT store hub list write 0; `verify:messenger-realtime-store-scope` | 브라우저 3회 측정 대기 | M-OWN-2 |
| **R2-M3** | ~~deprecated hub fields + dead store~~ | **완료** — hub 필드/export 삭제, `useChatStore` 삭제, snapshot-runtime 분리 | 브라우저 3회 측정 대기 | M-OWN-2 lock |
| **R2-D1** | owner reload + dead patch | **승격** `useOwnerStoreOrdersRealtime` **or** delete dead | RT patch without full GET | D-OWN-1 |
| **R2-D2** | loadSplitDetail duplicate | single `loadStoreDetail({silent})` | line count, behavior | D-OWN-2 |
| **R2-T1** | feed API dual (market category) | document or unify **one** round | duplicate fetch 0 | T-OWN-1 |
| **R2-A1** | admin poll storm | visibility-gated shared poll **or** remove duplicate 15s | request count/min | A-OWN-1 |

**금지**: 위 순서를 한 PR에 합치기.

---

## I. 문서 유지

본 파일이 **ownership 단일 진실**이다. 라운드 종료 시 writer 수가 줄었는지 여기서만 갱신한다.
