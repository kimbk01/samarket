# R2-D1 — Owner Orders Realtime / Full Reload 구조 분석

> **트랙**: DELIVERY · **상태**: ANALYSIS ONLY (수정 미적용)  
> **날짜**: 2026-05-17  
> **운영 화면**: `/stores/owner/orders` · `/my/business/store-orders` (re-export)  
> **메신저(R2-M11)**: 미접촉

---

## Executive summary

| 항목 | 결론 |
|------|------|
| **지배 병목 (단일)** | 운영 UI `OwnerStoreOrdersView`가 **row-patch 없이** Realtime·배달 Realtime·폴링·탭 복귀마다 **`load()` 전체 목록 교체** — dead row-patch hook과 **이중 정책** |
| **row-patch** | `useOwnerStoreOrdersRealtime`에 **구현·동작 가능**하나 **`app/**` 라우트 미연결 (dead)** |
| **router.refresh** | owner orders 경로 **없음** |
| **권장 다음 1건** | `OwnerStoreOrdersView`에 `useOwnerStoreOrdersRealtime` **승격** + `useSupabaseStoreOrdersRealtime`의 `onChange → load()` **제거** (폴링은 RT 안정 검증 후 단계적 축소) |

---

## 1. Ownership map

### 1.1 운영 경로 (단일 진입)

| 역할 | Owner (파일 · 함수) | Upstream | Downstream |
|------|---------------------|----------|------------|
| **order list (전체 배열)** | `OwnerStoreOrdersView` · `load()` → `setState({ kind:"ok", orders })` | `GET /api/me/stores` + `GET /api/me/stores/:id/orders` | `filteredOrders` · KPI 카드 · `OwnerOrderCard` 리스트 |
| **order rows (개별 필드)** | 동일 — **항상 `load()`가 배열 전체 교체** | API list JSON | 카드·타임라인·배달 액션 |
| **realtime updates (운영)** | `useSupabaseStoreOrdersRealtime` · `onChange` | Supabase `store_orders` `postgres_changes` | **`OwnerStoreOrdersView.load({ silent })`** |
| **delivery realtime** | `useSupabaseStoreOrderDeliveriesRealtime` · `onChange` | `store_order_deliveries` | **`load({ silent, reason:"realtime_deliveries" })`** |
| **polling** | `OwnerStoreOrdersView` useEffect · `setInterval(45_000)` | timer + `visibilitychange` | `safeSilentLoad` → `load({ silent })` |
| **dashboard hydration** | `load({ reason:"mount" })` on mount | 동일 2 API | `state.kind === "ok"` |
| **row patch (운영)** | **없음** | — | — |
| **row patch (dead)** | `useOwnerStoreOrdersRealtime` · `flushUpdates` / INSERT | Supabase `store_orders` | `OwnerOrdersPageClient.setOrders` (**라우트 0**) |
| **full reload trigger** | `OwnerStoreOrdersView.load` | mount · RT · deliveries RT · poll · visibility · `useRefetchOnPageShowRestore` | 전체 `orders[]` + meta counts |

### 1.2 Dead 경로 (참고만)

| 역할 | Owner | 비고 |
|------|-------|------|
| row-patch list | `OwnerOrdersPageClient` + `useOwnerStoreOrdersRealtime` | `app/**` import **0** · slug 기반 레거시 |
| full reload (수동) | `OwnerOrdersPageClient.load` → `fetchOwnerOrdersRemote` | 미배선 |

### 1.3 부가 소비자 (동일 패턴, 본 트랙 범위 밖)

| 화면 | 패턴 |
|------|------|
| `BusinessAdminDashboard` (매장 KPI) | `useSupabaseStoreOrdersRealtime` → `loadDashboard` + **45s poll** |
| `DeliveryOperationsDashboardPage` (admin) | 45s `load` poll |

---

## 2. Realtime flow (운영)

```
Supabase postgres_changes (store_orders)
  → useSupabaseStoreOrdersRealtime (channel: store-orders-rt:{storeId})
  → debounce 400ms
  → onChange()
  → OwnerStoreOrdersView.load({ silent, reason: "realtime_store_orders" })
  → fetchMeStoresListDeduped() + fetchStoreOrdersListDeduped()
  → setState — orders[] 전체 replace

Supabase postgres_changes (store_order_deliveries)
  → useSupabaseStoreOrderDeliveriesRealtime (channel: store-order-deliveries-rt:store:{storeId})
  → debounce 450ms
  → onChange()
  → load({ silent, reason: "realtime_deliveries" })
  → 동일 전체 replace
```

### 2.1 중복·dead

| 이슈 | 상세 |
|------|------|
| **중복 채널 (잠재)** | `useOwnerStoreOrdersRealtime` (`owner-store-orders-rt:`) vs `useSupabaseStoreOrdersRealtime` (`store-orders-rt:`) — **동일 테이블·filter** · 운영 화면에는 **후자만** 마운트 |
| **중복 merge** | 없음 (merge 없이 full reload) |
| **중복 invalidation** | store_orders UPDATE 1건 → orders RT **+** deliveries row UPDATE 시 deliveries RT → **load 최대 2회** (디바운스 창에 따라 합쳐질 수 있음) |
| **dead listener** | `useOwnerStoreOrdersRealtime` — 구현만 존재 |
| **dead row patch** | `mergeRealtimeRecordIntoOwnerOrder` · `mapRealtimeRecordToOwnerOrder` — **OwnerOrdersPageClient 전용** |

### 2.2 Dead 경로 realtime (승격 후보)

```
store_orders INSERT/UPDATE/DELETE
  → useOwnerStoreOrdersRealtime
  → setOrders row patch / sort / enrichOrder(orderId)
  → dibayPerfRecordOwnerOrderRowPatched
```

운영 화면에는 **이 경로가 연결되지 않음**.

---

## 3. Polling flow

| 트리거 | Owner | 간격/조건 | fetch | RT와 겹침 |
|--------|-------|-----------|-------|-----------|
| **45s interval** | `OwnerStoreOrdersView` L756–776 | visible 탭만 · `inFlight` 가드 | `load({ silent, reason:"poll_45s" })` | RT 직후 poll이면 **동일 list GET 중복** (single-flight로 HTTP 1회로 합쳐질 수 있음) |
| **visibility → visible** | `onVisibility` | foreground | `visibility_visible` + interval 재시작 | `useRefetchOnPageShowRestore`와 **이중** (아래) |
| **page show / bfcache** | `useRefetchOnPageShowRestore` | visible · 450ms debounce | `page_show_restore` | visibility handler와 **같은 복귀에 2스케줄 가능** |
| **window focus** | — | owner orders **미사용** | — | — |
| **reconnect** | Supabase auth `onAuthStateChange` | SIGNED_IN 시 채널 재구독 | 이벤트 없으면 load 없음 · 이벤트 burst 시 RT→load |

`fetchStoreOrdersListDeduped` / `fetchMeStoresListDeduped`는 `runSingleFlight` + me/stores **22s TTL**로 **짧은 창 HTTP 중복은 완화** — 그러나 **의미상** reload writer는 여전히 4+ 소스.

---

## 4. Full reload map

| 트리거 | reason (계측) | state 변경 | row-patch 존재? | RT 실패 가림? |
|--------|---------------|------------|-----------------|---------------|
| mount | `mount` | `orders` 전체 | 운영: **no** | — |
| store_orders RT | `realtime_store_orders` | 전체 replace | dead만 yes | **yes** — RT 와도 GET으로 정합 |
| deliveries RT | `realtime_deliveries` | 전체 replace | no | yes |
| 45s poll | `poll_45s` | 전체 replace | no | **yes** — RT 누락 시 최대 45s 내 수렴 |
| tab visible | `visibility_visible` | 전체 replace | no | yes |
| bfcache/복귀 | `page_show_restore` | 전체 replace | no | yes |
| 수동 재시도 | `initial_load` (non-silent) | loading + replace | no | — |
| `router.refresh()` | — | **owner orders 없음** | — | — |
| React Query invalidate | — | **미사용** | — | — |

**핵심**: row-patch가 맞아도 **운영 경로는 매번 `load()`가 `orders` 배열을 통째로 갈아끼움** → RT 이점이 체감·계측 모두에서 묻힘.

---

## 5. Row-patch validation

| 질문 | 답 |
|------|-----|
| 경로 생존? | 코드 **alive** · 라우트 **dead** |
| partial? | INSERT lite row + `requestOrderEnrich` (단건 GET) — `OwnerOrdersPageClient`만 |
| bypassed? | 운영 UI는 **100% bypass** (`useSupabaseStoreOrdersRealtime` → load) |
| overwritten? | `load()`가 항상 API list로 **전체 덮어쓰기** |
| source of truth | 운영: **HTTP list** · dead: **setOrders + merge** |
| patch 후 reload 생존? | dead path: RT patch 후 **poll/restore 없음** (가벼움) · 운영: RT 직후 곧바로 load |

---

## 6. Duplicate fetch analysis

### 6.1 `load()` 1회 비용

항상 (캐시 miss 시):

1. `GET /api/me/stores` (`fetchMeStoresListDeduped`, TTL 22s)
2. `GET /api/me/stores/:storeId/orders` (`fetchStoreOrdersListDeduped`, single-flight)

### 6.2 겹침 시나리오 (정적)

| 시나리오 | 예상 HTTP list GET |
|----------|-------------------|
| 주문 status 1회 변경 (delivery row 포함) | RT orders + RT deliveries → **최대 2× load** (디바운스에 따라 1×) |
| 동일 변경 + 45s poll | +1 poll |
| 탭 background → foreground | `visibility_visible` + `page_show_restore` → **최대 2×** |
| idle 60s visible | mount 1 + poll 1 (45s) ≈ **2×** (첫 분) |

### 6.3 자동 3회 측정 (2026-05-17)

**파일**: `messenger-r2-d1-perf.log`

| run | auth | dashboard | `[dibay-r2d1]` | `/orders` fetch |
|-----|------|-----------|----------------|-----------------|
| 1–3 | ok | ok (느슨한 텍스트 매치) | **0** | **0** |

**해석**: production `npm run start` 빌드에서 trace 기본 off · Playwright가 **실제 오너 KPI 대시보드 DOM/API에 도달하지 못했을 가능성** (계정/매장 없음, 또는 hydration 전 종료). **구조 결론은 코드 trace 기준**이며, 유효 실측은 아래 재실행 필요.

**재측정 명령** (dev 또는 trace on 빌드):

```bash
# 터미널 1
$env:NEXT_PUBLIC_DIBAY_R2_D1_TRACE='1'; npm run dev

# 터미널 2 (오너 계정·매장 1개 이상 필요)
node scripts/perf/r2-d1-owner-orders-capture-runs.mjs
```

수동 시나리오: 대시보드 open → 신규 주문 → status 변경 → 네트워크 끊었다 복구 → tab bg/fg → idle 60s · DevTools에서 `[dibay-r2d1]` + `/api/me/stores/*/orders` 카운트.

---

## 7. Memory retain analysis (정적)

| 객체 | 위치 | retain 위험 |
|------|------|-------------|
| `state.orders` | `OwnerStoreOrdersView` useState | 목록 크기만큼 · **prune 없음** |
| `pendingUpdatesRef` Map | `useOwnerStoreOrdersRealtime` | unmount clear · **dead path** |
| Realtime channels ×2 | orders + deliveries hooks | cleanup `removeChannel` 있음 |
| `prevPendingDeliveryRef` | alert meta | scalar |
| `highlightTimersRef` | dead client only | — |
| me/stores module cache | 22s TTL | 단일 객체 |

**누수 징후 코드 없음** — 다만 **full list를 주기적으로 다시 받아** heap이 주기적으로 재할당됨 (10MB 수준은 Playwright 측정치·참고만).

---

## 8. 계측 (임시, 분석용)

| 모듈 | 역할 |
|------|------|
| `lib/dibay/r2-d1-owner-orders-trace.ts` | `[dibay-r2d1]` 로그 · duplicate_fetch 2.5s 창 |
| `scripts/perf/r2-d1-owner-orders-capture-runs.mjs` | 3회 Playwright 시나리오 |

**활성화**: dev 기본 on · production `NEXT_PUBLIC_DIBAY_R2_D1_TRACE=1` 또는 `sessionStorage dibay:r2d1:trace=1`

---

## 9. 지배 병목 · 증거 · 다음 1수

### 9.1 Dominant ownership failure

**「운영 owner list의 유일한 갱신 정책이 full `load()`인데, Realtime·폴링·복귀가 같은 배열에 각각 쓰기 권한을 가진다」**

- row-patch는 **이미 구현** (`useOwnerStoreOrdersRealtime`) but **배선 0**
- Realtime은 **이벤트 수신 후에도 patch가 아니라 reload** (`useSupabaseStoreOrdersRealtime` L44–50, `OwnerStoreOrdersView` L742–744)
- 45s poll은 RT 실패·누락을 **사용자에게 보이지 않게** 맞춤 → **구조적으로 reload 정책을 강화**

### 9.2 Proof (코드)

- Full reload on RT: `onChange: () => void load({ silent: true, reason: "realtime_store_orders" })`
- Dead patch hook: `app/**`에 `OwnerOrdersPageClient` **0 imports**
- Full list replace: `setState({ … orders: (oj.orders ?? []) })`

### 9.3 ONE recommended next fix

**`OwnerStoreOrdersView`에서 `useOwnerStoreOrdersRealtime` 승격** — `setOrders` 대신 동일 `state.orders`를 patch하는 adapter 작성, `useSupabaseStoreOrdersRealtime`의 **`onChange → load` 제거** (INSERT 알림음만 유지 또는 hook 통합). deliveries는 `merge` into row.delivery 또는 단건 enrich.

**하지 말 것 (1라운드)**: 45s poll 즉시 삭제, 메신저, 새 cache layer, `BusinessAdminDashboard` 동시 대수술.

### 9.4 Risks

| 리스크 | 완화 |
|--------|------|
| list row에 없는 필드 RT 누락 | 기존 `requestOrderEnrich` 패턴 유지 |
| deliveries만 변경 시 | delivery hook → row.delivery patch |
| meta counts (`pending_*`) drift | patch 시 meta reducer 또는 소규모 HEAD endpoint |
| 이중 hook 전환 중 regression | feature flag / reason별 계측 유지 |

### 9.5 Must NOT touch

- **R2-M11 / community-messenger** 전부
- `useSupabaseStoreOrdersRealtime` **다른 소비자** (dashboard) — 별 PR
- debounce 추가로 증상만 가리기
- poll 제거를 RT 승격 **전에** 단독 수행

---

## 10. 관련 파일

| 파일 | 역할 |
|------|------|
| `components/business/owner/OwnerStoreOrdersView.tsx` | **운영 OWNER** |
| `hooks/useSupabaseStoreOrdersRealtime.ts` | RT → reload |
| `hooks/useSupabaseStoreOrderDeliveriesRealtime.ts` | delivery RT → reload |
| `hooks/stores/useOwnerStoreOrdersRealtime.ts` | **row-patch (운영 승격됨)** |
| `lib/business/owner-store-order-list-row-bridge.ts` | OrderRow ↔ OwnerOrder 브리지 |
| `components/stores/owner/OwnerOrdersPageClient.tsx` | dead UI |
| `lib/stores/fetch-store-orders-list-deduped.ts` | list GET dedupe |
| `lib/me/fetch-me-stores-deduped.ts` | stores GET + TTL |
| `lib/ui/use-refetch-on-page-show.ts` | 복귀 refetch |
| `lib/store-owner/map-realtime-store-order-to-owner.ts` | patch mapper |
| `app/(main)/stores/owner/orders/page.tsx` | 운영 route |

---

---

## R2-D1 1-Fix Result (2026-05-17)

### 변경 파일

| 파일 | 변경 |
|------|------|
| `components/business/owner/OwnerStoreOrdersView.tsx` | `useOwnerStoreOrdersRealtime` 승격 · `useSupabaseStoreOrdersRealtime` 제거 |
| `lib/business/owner-store-order-list-row-bridge.ts` | **신규** — list row ↔ OwnerOrder 브리지 |
| `hooks/stores/useOwnerStoreOrdersRealtime.ts` | `row_patch_*` · `full_reload_blocked` 계측 |
| `lib/dibay/r2-d1-owner-orders-trace.ts` | trace kind 확장 |
| `scripts/perf/r2-d1-owner-orders-capture-runs.mjs` | After 지표 집계 |
| `components/stores/owner/OwnerOrdersPageClient.tsx` | (dead) onRealtimeInsert 시그니처 정합 |

### 제거한 full reload 경로

- `OwnerStoreOrdersView`에서 `useSupabaseStoreOrdersRealtime({ onChange: () => load() })` **삭제**
- `store_orders` INSERT/UPDATE/DELETE 시 **list GET 없음** (`full_reload_blocked` 로그)

### 승격한 row-patch 경로

```
store_orders RT → useOwnerStoreOrdersRealtime
  → setOrdersForRealtime (브리지)
  → OwnerStoreOrdersView state.orders patch
  → requestOrderEnrich(orderId) 단건 GET (품목·delivery)
```

- INSERT: `row_patch_insert` + enrich
- UPDATE: 디바운스 배치 `row_patch_update`
- DELETE: `row_patch_remove`

### 유지 (이번 PR)

- `load()` mount / poll_45s / visibility / pageshow / manual(card)
- ~~`useSupabaseStoreOrderDeliveriesRealtime` → `load({ reason: "realtime_deliveries" })`~~ → **Delivery RT row-patch로 대체** (아래 절)
- 45s poll · pageshow restore

### 3회 자동 측정 (`messenger-r2-d1-perf.log`)

| run | dashboard | list GET | `[dibay-r2d1]` | 비고 |
|-----|-----------|----------|----------------|------|
| 1–3 | **fail** (KPI DOM timeout) | 0 | 0 | E2E 계정 `aaaa` — 오너 매장/KPI 미도달 추정 |

**수동 재측정** (매장 보유 오너 계정):

```powershell
$env:NEXT_PUBLIC_DIBAY_R2_D1_TRACE='1'; npm run dev
node scripts/perf/r2-d1-owner-orders-capture-runs.mjs
```

**After 목표 (수동/RT 이벤트 시)**:

| 지표 | Before | After (목표) |
|------|--------|--------------|
| orders RT → `load()` | 1+/event | **0** |
| `full_reload_blocked` | 0 | **≥1**/RT patch |
| `row_patch_update` | 0 (dead) | **≥1**/status change |
| poll/pageshow `load` | 유지 | 유지 (`poll_fetch` / `pageshow_fetch`) |
| delivery RT `load` | 1+/event | **0** (`delivery_full_reload_blocked`) |

### 검증

| 명령 | 결과 |
|------|------|
| `npx tsc --noEmit` | pass |
| `npm run build` | pass |
| `npm run lint` | **fail** — repo 기존 143건 (본 PR 변경 파일 IDE lint 0) |

### 남은 문제

- **KPI/meta** (`pending_accept_count` 등) — row-patch만으로는 갱신 안 됨 · poll이 보정
- **E2E** — 오너 매장 시드 계정 필요

### 다음 후보 1개 (완료됨 → Delivery RT 절 참고)

~~`store_order_deliveries` RT → `order.delivery` row patch~~ — **2026-05-17 적용**

### 건드리지 않은 것

- 메신저 R2-M11 전부
- 45s poll / pageshow 제거
- `BusinessAdminDashboard` RT→reload
- `OwnerOrdersPageClient` 라우트 배선
- 새 cache / debounce / router.refresh

---

## R2-D1 Delivery RT Row-Patch Result (2026-05-17)

### 변경 파일

| 파일 | 변경 |
|------|------|
| `components/business/owner/OwnerStoreOrdersView.tsx` | `patchDeliveryFromRealtime` · `onDeliveryEvent` |
| `hooks/useSupabaseStoreOrderDeliveriesRealtime.ts` | `onDeliveryEvent` · `delivery_realtime_event` trace |
| `lib/business/owner-store-order-delivery-row-rt.ts` | **신규** — delivery snapshot map/merge |
| `lib/dibay/r2-d1-owner-orders-trace.ts` | delivery trace kind 확장 |
| `scripts/perf/r2-d1-owner-orders-capture-runs.mjs` | delivery 집계 필드 |

### 제거한 delivery full reload 경로

- `useSupabaseStoreOrderDeliveriesRealtime({ onChange: () => load({ reason: "realtime_deliveries" }) })` **삭제**
- delivery RT 시 `delivery_reload` / list GET **0회** (목표)

### 추가한 delivery row patch 경로

```
store_order_deliveries RT
  → useSupabaseStoreOrderDeliveriesRealtime.onDeliveryEvent
  → OwnerStoreOrdersView.patchDeliveryFromRealtime
  → orders[idx].delivery only (list length·정렬·탭 유지)
```

| 이벤트 | 정책 |
|--------|------|
| INSERT | `order.delivery` = mapped row |
| UPDATE | merge into existing `delivery` |
| DELETE | `delivery` = null |
| order 미존재 | `delivery_row_patch_miss` · **reload 금지** |

### 3회 자동 측정

이전과 동일 — **오너 매장 E2E 계정** 필요 (`messenger-r2-d1-perf.log`). 수동 시 delivery 상태 변경 후:

| 지표 | 목표 |
|------|------|
| `delivery_realtime_event` | ≥1 |
| `delivery_row_patch_update` | ≥1 |
| `delivery_reload` + `realtime_deliveries` load | **0** |
| `delivery_full_reload_blocked` | ≥1 |
| `poll_fetch` / `pageshow_fetch` | 유지 |

### 남은 reload 경로 (운영 UI)

| reason | 유지 |
|--------|------|
| `mount` | initial load |
| `poll_45s` / `visibility_visible` | poll |
| `page_show_restore` | pageshow |
| manual / card `onUpdated` | full load |
| `order_enrich_get` | 단건 GET (orders RT INSERT) |

### 다음 후보 1개

**KPI/meta** (`pending_delivery_count` 등) — row-patch만으로 meta 미갱신 · poll이 보정. meta 전용 소형 patch 또는 poll 간격 검토(별 트랙).

### 건드리지 않은 것

- `useOwnerStoreOrdersRealtime` / store_orders patch
- poll / pageshow / visibility 제거
- `BusinessAdminDashboard` · 메신저 · `OwnerOrdersPageClient` 라우트

---

## R2-D1 Real Event Verification

**판정: FAIL** (store_orders row-patch는 실측 성공 · delivery RT·무 reload 완전 PASS는 미충족)

### 테스트 환경

| 항목 | 값 |
|------|-----|
| dev 서버 | `NEXT_PUBLIC_DIBAY_R2_D1_TRACE=1` · `npm run dev` · `http://127.0.0.1:3000` |
| 오너 계정 | `aa11` / `1234` |
| 구매자 계정 | `aaaa` / `1234` (오너 본인 주문 불가 — `cannot_order_own_store`) |
| 매장 | 나의 오른손딸방 (`19085860-52d2-4183-b033-e71fcb58bcec`) |
| 계측 | `node scripts/perf/r2-d1-real-event-verify.mjs` · 산출 `messenger-r2-d1-verify.log` |
| 캡처 시각 (UTC) | 2026-05-17T13:25:00Z |

### 주문·배달 타임라인

| 시각 (UTC) | 이벤트 |
|------------|--------|
| 2026-05-17T13:25:21Z | 구매자 `POST /api/me/store-orders` — 주문 `acc860ea-659e-48bd-a078-7addf236314e` 생성 |
| +~10s | 오너 `accepted` → `preparing` → `ready_for_pickup` → `delivering` (API PATCH) |
| +~18s | delivery PATCH `pickup_in_progress` / `delivering` / `delivered` — **전부 400** `schema_missing_store_order_deliveries` |

### 발생한 `[dibay-r2d1]` 로그 (집계)

| kind | count | 비고 |
|------|------:|------|
| `listener_attach` | 6 | React Strict Mode·탭 전환으로 채널 재구독 다회 |
| `realtime_event` | 3 | `store_orders` RT 수신 |
| `row_patch_insert` | 2 | 신규 주문 행 삽입 |
| `row_patch_update` | 4 | 주문 상태 UPDATE 패치 |
| `full_reload_blocked` | 6 | RT 경로에서 list `load()` 차단 |
| `full_reload` | 6 | **`mount` / 초기·재마운트 list GET** (RT reason 아님) |
| `delivery_realtime_event` | 0 | delivery 행 미생성 |
| `delivery_row_patch_*` | 0 | — |
| `delivery_reload` | 0 | ✓ |
| `delivery_full_reload_blocked` | 0 | delivery RT 미발생 |

`realtime_store_orders` / `realtime_deliveries` reason의 list GET: **0회** (PASS 조건 해당 항목).

### store_orders RT 후 full reload 여부

- **RT 직후 `load({ reason: "realtime_store_orders" })`**: 없음 · `full_reload_blocked` 6회로 차단 확인.
- **부수 list GET**: 주문 생성 직후 **0회** (`list_fetches_after_order_create: 0`). 오너 상태 PATCH 중 `preparing`·`delivering` 단계에서 list GET **각 1회** (총 3회 타임라인 — mount 1 + 이벤트 중 2). 원인 후보: `order_enrich_get` 단건 보강·컴포넌트 재마운트 `mount`, RT debounce와 무관.
- **`full_reload` trace 6회**: 대부분 초기 `mount` / Strict Mode 이중 마운트로 분류. **RT-triggered full list reload는 관측되지 않음.**

### store_order_deliveries RT 후 full reload 여부

- **검증 불가**: 로컬 dev DB에 `store_order_deliveries` 스키마 미적용 (`schema_missing_store_order_deliveries`). delivery PATCH·RT 이벤트·`delivery_row_patch_*` 미발생.

### row-patch 성공 여부

| 대상 | 결과 |
|------|------|
| `store_orders` | **성공** — INSERT 시 `row_patch_insert`, 상태 변경 시 `row_patch_update` + `full_reload_blocked` |
| `store_order_deliveries` | **미검증** — 스키마 부재로 delivery 행·RT 없음 |

### 남은 문제

1. **delivery RT 실측**: Supabase에 `store_order_deliveries` 마이그레이션 적용 후 동일 시나리오 재실행 필요.
2. **오너 상태 PATCH 부수 list GET**: `preparing` 등 전환 시 list GET 1회씩 — `order_enrich_get` vs `mount` 원인 분리 계측(다음 라운드).
3. **`full_reload` trace 노이즈**: `mount`도 `full_reload` kind로 집계됨 — PASS 판정용 필터는 `fetchReason` 기준(`realtime_*` 제외)으로 해석.

### 다음 단일 후보

1. **우선**: dev/staging에 `store_order_deliveries` 스키마 반영 후 R2-D1 delivery 실측 재실행.
2. **이후**: **KPI/meta patch** (`pending` / `preparing` 카운트) — row-patch만으로 헤더 숫자 미동기 가능성(기존 분석 후보 유지).

---

## R2-D1 Delivery DB + Real Event Verification

**판정: PASS** (실이벤트 3회 중 run 3 기준 · DB catch-up SQL은 미적용 · 서비스 BASE 컬럼 read 호환으로 PATCH·RT 검증)

> 2026-05-17 후속: 원격 DB에 `failure_reason` 등 후속 컬럼이 없어 `schema_missing_store_order_deliveries` 가 났음.  
> `lib/stores/store-order-delivery-service.ts` 에 **20260509110000 베이스 컬럼 SELECT 폴백** 추가 후 `next build --webpack` · `npm run start` 로 재검증.

### 작업 1 — 기존 스키마 확인 (repo)

| 항목 | 결과 |
|------|------|
| 정식 마이그레이션 | **있음** — 새 테이블 추측 생성 **하지 않음** |
| 베이스 | `supabase/migrations/20260509110000_delivery_riders_and_order_deliveries.sql` |
| 후속 ALTER | `20260517120000` (failure_reason·riders admin), `20260518120000` (rider_accepted_at 등), `20260519120000` (POD), `20260520120000` (proof path), `20260522120000` (realtime publication 컬럼 제외) |
| PK / FK | `order_id uuid primary key` → `store_orders(id)` · `store_id` · `buyer_user_id` · `rider_id` |
| status | `delivery_status text` — 값 목록은 `lib/stores/store-order-delivery-status.ts` |
| RT publication | `20260509110000` + `20260522120000` |

**원격 DB 실측 (service role, 2026-05-17):**

- `store_order_deliveries` **테이블 존재**
- `DELIVERY_ROW_SELECT` 전체 조회 시 **`failure_reason` 등 컬럼 없음** → API `ensureDeliveryRow` 가 `schema_missing_store_order_deliveries` 반환 (메시지에 `does not exist` 포함)

### 작업 2 — 적용 준비 (신규 스키마 없음)

| 산출물 | 용도 |
|--------|------|
| `supabase/scripts/r2-d1-store-order-deliveries-schema-catchup.sql` | 위 **기존 마이그레이션 ALTER/RLS/publication만** idempotent 묶음 |
| `scripts/apply-r2-d1-delivery-schema-catchup.mjs` | Postgres 직접 적용 (`SUPABASE_DB_PASSWORD` 또는 `DATABASE_URL`) |
| `npm run sql:copy:r2-d1-delivery-catchup` | SQL Editor 수동 붙여넣기 |
| `npm run apply:r2-d1-delivery-schema` | CLI 적용 (DB 비밀번호 필요) |

**적용 명령 (로컬, 비밀번호 1회):**

```powershell
$env:SUPABASE_DB_PASSWORD='<Supabase Dashboard → Database password>'
npm run apply:r2-d1-delivery-schema
```

또는 `npx supabase login` 후 `npx supabase db push --linked` (전체 migrations 동기화).

**DDL 원격 적용**: DB 비밀번호·`SUPABASE_ACCESS_TOKEN` 없어 `npm run apply:r2-d1-delivery-schema` **미실행**.  
**대안**: `lib/stores/store-order-delivery-service.ts` — `STORE_ORDER_DELIVERY_ROW_SELECT_BASE`(20260509110000) 폴백 후 `npx next build --webpack` · `npm run start`.

### 작업 3 — API 검증 (compat + production 재빌드 후)

| 검사 | 결과 |
|------|------|
| delivery PATCH `schema_missing` | **해소** |
| delivery 상태 전이 | `rider_assigned` → `pickup_in_progress` → `delivering` → `delivered` OK |
| 전체 `DELIVERY_ROW_SELECT` | catch-up 미적용 시 여전히 **컬럼 없음** |

### 작업 4 — 실이벤트 3회 (`http://localhost:3000`)

| run | order_id | delivery PATCH | delivery_RT | delivery_row_patch | delivery_reload | verdict |
|-----|----------|----------------|-------------|--------------------|-----------------|--------|
| 1 | `18569f80-…` | OK | 5 | insert 1 / update 4 | 0 | FAIL (flaky) |
| 2 | — | — | — | — | — | FAIL (로그인) |
| 3 | `64ac05a9-…` | OK | 5 | insert 1 / update 4 | 0 | **PASS** |

run 3: `delivery_full_reload_blocked` 5 · orders `full_reload_blocked` 5 · RT 중 list GET **0** · `poll_fetch` 1(45s).

### PASS/FAIL (run 3)

| 기준 | 상태 |
|------|------|
| delivery PATCH 400 해소 | **PASS** |
| delivery_realtime_event | **PASS** |
| delivery_row_patch_* | **PASS** |
| realtime_deliveries load | **0 PASS** |
| RT 직후 full reload | **PASS** |

### 다음 단일 후보

1. 원격 **catch-up SQL** 적용(`npm run apply:r2-d1-delivery-schema`) — POD 컬럼 정식화.  
2. **KPI/meta patch** — 별 트랙.
