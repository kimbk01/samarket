# R2-D1 KPI / Meta Header — Ownership Analysis (NEXT TRACK PREP)

> **목적**: R2-D1 **LOCK** 이후 다음 단일 트랙 후보 **「KPI/meta header realtime ownership」** 의 **측정·분석 전용** 문서.  
> **금지**: KPI 선패치 · summary 전체 reload 추가 · 새 realtime owner · list/KPI owner 분리 · poll 제거 · cache masking.  
> **선행 LOCK**: [r2-d1-owner-orders-analysis.md](./r2-d1-owner-orders-analysis.md) — `store_orders` / `store_order_deliveries` **row-patch PASS**, RT reason full reload **0**.

| 필드 | 값 |
|------|-----|
| Last updated | 2026-05-17 (real-event measurement) |
| R2-D1 상태 | **LOCK** (배민형 owner orders realtime 운영 구조) |
| 다음 트랙 | KPI/meta header realtime ownership — **단일 fix 적용 (2026-05-17)** |
| 실측 로그 | `messenger-r2-d1-kpi-measure.log` · 스크립트 `scripts/perf/r2-d1-kpi-meta-measure.mjs` |

---

## 1. KPI ownership map

| UI / 지표 | 화면·컴포넌트 | State / 계산 | Writer (누가 갱신) | RT row-patch 후 즉시 반영 |
|-----------|---------------|--------------|-------------------|---------------------------|
| **신규 주문** (카드) | `OwnerStoreOrdersView` sticky KPI grid | `summaryCounts.pending` ← `useMemo` on `state.orders` | `setOrdersForRealtime` · `load()` · `enrichOrder` · `patchDeliveryFromRealtime` | **예** (목록 행 `order_status` 기준) |
| **조리중** | 동일 | `summaryCounts.preparing` | 동일 | **예** |
| **배달중** | 동일 | `summaryCounts.delivering` (`delivering` \| `arrived`) | 동일 | **예** |
| **오늘 완료** | 동일 | `summaryCounts.doneToday` (`completed` + `completedAtMs`) | 동일 | **예** (완료 시각 필드 있을 때) |
| **탭 배지** (신규/진행) | 동일 탭 row | `tabBadges` ← `countOrdersMatchingTab(state.orders)` | 동일 | **예** |
| **접수 대기** chip·배너 | 동일, store name 행 | `state.pendingAcceptCount` | **`load()` only** (`oj.meta.pending_accept_count`) | **아니오** |
| **배달 대기** chip·배너·알림 copy | 동일 | `state.pendingDeliveryCount` | **`load()` only** (`oj.meta.pending_delivery_count`) | **아니오** |
| **환불 요청** chip·배너 | 동일 | `state.refundRequestedCount` | **`load()` only** (`oj.meta.refund_requested_count`) | **아니오** |
| **배달 접수 알림음** (meta delta) | `load({ silent })` 내부 | `prevPendingDeliveryRef` vs meta `pending_delivery_count` | poll / pageshow / silent load | **아니오** (RT insert hook은 별도) |
| **허브 주문 배지** | `MyBusinessPage` | `orderAlertsBadge` | `fetchStoreOrderCountsDeduped` + **RT `onChange`→tick** + **30s interval** | **부분** (meta API 재조회, list와 무관) |
| **허브 배지** | `BusinessAdminShell` | shell badge state | `fetchStoreOrderCountsDeduped` (마운트·RT) | **부분** |
| **허브 배지** | `OrdersHubStoreAdminAccess` | 동일 패턴 | `fetchStoreOrderCountsDeduped` | **부분** |
| **대시보드 KPI** (`newOrders` 등) | `BusinessAdminDashboard` | `kpi` useMemo: `newOrders` ← **`meta.pending_accept`**, `inProgress`·`todaySales` ← `orders[]` | **`loadDashboard()`** — RT **`onChange → full list GET`** | **아니오** (별도 트랙·R2-D1 범위 밖) |

**R2-D1 LOCK ownership (건드리지 않음)**:

| 이벤트 | Owner |
|--------|--------|
| `store_orders` RT | `useOwnerStoreOrdersRealtime` → `setOrdersForRealtime` (row patch) |
| `store_order_deliveries` RT | `patchDeliveryFromRealtime` → `order.delivery` row patch |
| poll 45s · visibility · pageshow · manual refresh | `OwnerStoreOrdersView.load` → **fallback recovery** (list + meta 전체) |

---

## 2. KPI source of truth

| 지표 | SoT (권위) | 구현 위치 | list에서 derive 가능? | DB 전체 원장 vs list 샘플 |
|------|------------|-----------|----------------------|---------------------------|
| 신규·조리중·배달중·오늘완료 | **클라 `state.orders` (최대 100건)** | `OwnerStoreOrdersView` L661–677 | **이미 derive** | **샘플** — API `.limit(100)` |
| 접수 대기 (`pending_accept_count`) | **Supabase count** `order_status=pending` | `countPendingAcceptForStore` | **가능** (동일 조건으로 `orders` 스캔) | **전체 원장** |
| 배달 대기 (`pending_delivery_count`) | **Supabase count** `pending` + `fulfillment_type=local_delivery` | `countPendingDeliveryAcceptForStore` | **가능** (list + fulfillment 필터) | **전체 원장** |
| 환불 요청 (`refund_requested_count`) | **Supabase count** `order_status=refund_requested` | `countRefundRequestedForStore` | **부분** (100건 밖 누락 가능) | **전체 원장** |
| 대시보드 `newOrders` | **meta** (위 count와 동일) | `BusinessAdminDashboard` L167–168 | 대시보드 `orders`와 **분리** | meta 전체 / list 샘플 혼합 |

**API 번들**:

- `GET /api/me/stores/:storeId/orders` — list + meta 3 counts **항상 동시** (full reload 시).
- `GET …/orders?meta_only=1` — meta만 (`fetch-store-orders-meta-deduped.ts`, **OwnerStoreOrdersView 미사용**).
- `GET /api/me/stores/:storeId/order-counts` — meta 3 counts + **서버 캐시** (`getCachedStoreOrderCounts`) — 허브·쉘 전용.

---

## 3. Realtime 반영 여부

| 경로 | list KPI 카드 (4칸) | meta chip/배너 (3종) | 비고 |
|------|---------------------|----------------------|------|
| `useOwnerStoreOrdersRealtime` row-patch | **반영됨** | **반영 안 됨** | `setOrdersForRealtime`는 `orders`만 갱신 |
| `patchDeliveryFromRealtime` | 배달 행·상태 간접 | **반영 안 됨** | delivery_status ≠ order_status meta |
| RT insert 알림음 | N/A | N/A | `onRealtimeInsert` (local_delivery) — meta count 무관 |
| poll 45s / visibility | 카드·meta 모두 | meta **여기서 동기화** | R2-D1 실측: RT 중 list GET **0**, `poll_fetch` **fallback** |
| pageshow restore | 동일 full `load` | meta 갱신 | |

**결론 (코드 기준, 추정 아님)**: R2-D1 이후 **운영 주문 화면의 “헤더 4칸 KPI”는 list owner와 동일 writer** → RT와 정합. **“접수/배달/환불” meta UI는 별도 SoT** → RT만으로는 **stale**.

---

## 4. Poll 의존 여부

| 소비자 | Poll 주기 | fetch | meta만 / full list |
|--------|-----------|-------|---------------------|
| `OwnerStoreOrdersView` | **45s** + `visibilitychange` | `fetchStoreOrdersListDeduped` | **full list + meta** |
| `MyBusinessPage` (허브) | **30s** + RT debounce 450ms | `fetchStoreOrderCountsDeduped` | **meta only** |
| `BusinessAdminDashboard` | **45s** + RT→`loadDashboard` | `fetchStoreOrdersListDeduped` | **full** (RT마다도 full) |

**LOCK 정책**: poll은 **제거 대상 아님** — reconnect·missed RT·**meta stale 복구** ownership. KPI/meta 트랙에서 poll 삭제 **금지**.

---

## 5. Duplicate summary fetch

| 중복 패턴 | 발생 조건 | 완화 |
|-----------|-----------|------|
| 동일 store **full orders GET** | poll + pageshow + manual + (구) RT reload | `runSingleFlight` `me:store:${sid}:orders` — HTTP 1회 합류 |
| **meta 3-count 쿼리** | full orders GET마다 서버 `Promise.all` 3× count | list GET 1회당 **DB count 3회 고정** (별도 HTTP 없음) |
| **meta-only GET** | 허브 RT/30s + (가능 시) orders 화면 poll과 **동시** | flight key 다름 (`order-counts` vs `orders`) — **동시 열리면 2 HTTP** |
| **대시보드** | RT `onChange` → `loadDashboard` = orders + inquiries | orders 화면과 **독립** 이중 full GET (같은 store, 다른 탭) |

**OwnerStoreOrdersView `load()` 1회 비용** (서버, `orders/route.ts`):

1. `store_orders` select limit 100  
2. `countRefundRequestedForStore`  
3. `countPendingAcceptForStore`  
4. `countPendingDeliveryAcceptForStore`  
5. `store_order_items` in-query  
6. buyer public labels  

→ **KPI meta는 list와 무관한 count인데 full reload마다 항상 재실행**.

---

## 6. Stale update path

```text
[RT store_orders UPDATE status: pending → preparing]
  → setOrdersForRealtime
  → summaryCounts.preparing ↑, summaryCounts.pending ↓   (즉시)
  → state.pendingAcceptCount unchanged                    (stale until load)

[RT INSERT new pending local_delivery]
  → row patch + onRealtimeInsert alert
  → summaryCounts.pending ↑ (if row in list)
  → pendingDeliveryCount unchanged until poll/load
  → silent load 시 meta delta로 playDeliveryOrderAlertDebounced 가능

[User on orders tab, no poll yet]
  → meta chips show old "접수 대기 N" while KPI card "신규" already dropped

[>100 orders, old pending off list]
  → summaryCounts.pending undercounts
  → meta pending_accept_count still correct (DB count)
```

**이중 표기 혼동** (측정 시 로그 권장):

- 카드 **「신규 주문」** = `summaryCounts.pending` (list sample)  
- chip **「접수 대기」** = `pendingAcceptCount` (DB meta)  
- 조건은 둘 다 `order_status=pending`에 가깝으나 **SoT·상한(100)이 다름**.

---

## 7. Candidate single bottleneck (다음 트랙 1건 후보 — 수정 전 검증 필요)

**단일 병목 후보**: **`OwnerStoreOrdersView`의 KPI 이중 ownership** — header 4칸은 **`state.orders` derive**, 접수/배달/환불 **meta chip·배너·silent 알림**은 **`load()` 번들 meta** 전용. RT row-patch는 **list writer만** 갱신하므로 **meta UI가 poll/load까지 stale**.

**다음 트랙에서 먼저 할 일 (측정)**:

1. `NEXT_PUBLIC_DIBAY_R2_D1_TRACE=1` + status RT 1건 후 **meta vs summaryCounts** 필드 스냅샷 (poll 전·후).  
2. Network: RT burst 중 `GET …/orders` **0** 유지, meta chip stale 재현 시간 ≤45s인지.  
3. 허브(`MyBusinessPage`) vs orders 화면 **order-counts** / **orders** 동시 발생 여부.  

**아직 하지 말 것**: meta를 list derive로 **바로 패치** (측정·owner 합의 전), `meta_only` poll 추가, `BusinessAdminDashboard` RT full reload 제거를 이 트랙에 끼우기.

---

## 8. Risks

| 리스크 | 설명 |
|--------|------|
| list derive로 meta 통일 시 **100건 밖 카운트 누락** | `pending_accept` 전체 원장과 카드 숫자 역전 |
| meta만 derive patch 시 **환불·오프-리스트 pending** 과소/과대 | refund는 전체 원장 기준 유지 필요 |
| 허브·쉘·orders **3 RT 소비자** | `MyBusinessPage` / `BusinessAdminShell` / `OwnerStoreOrdersView` 각각 다른 fetch — owner 분산 재발 |
| `BusinessAdminDashboard` RT→full reload | orders 운영 화면과 **정책 불일치** — KPI 트랙 범위 밖이면 회귀 착시 |
| poll 제거 성급 | meta stale **영구화** + missed RT |
| `summaryCounts.pending` vs `pendingAcceptCount` 라벨 | 운영자 혼동·잘못된 “수정 완료” 판정 |

---

## 9. What must not be touched (ABSOLUTE)

**R2-D1 LOCK**

- RT 이벤트마다 **list full reload** 복구 금지  
- `router.refresh` / invalidate masking / 새 debounce·cache·fallback **금지**  
- `store_orders` / `store_order_deliveries` **row-patch ownership 분산 금지**  
- **poll 제거** (KPI/meta ownership 안정화 전)  

**이번 분석 단계**

- KPI **선패치** · summary **전체 reload 추가** · **새 realtime owner** · list owner ≠ KPI owner **분리 확대**  

**다음 트랙 절차 (항상)**

1. measure → 2. breakdown → 3. identify owner → 4. identify stale path → 5. **ONE fix only**

---

## R2-D1 KPI Real Event Measurement

> **일시**: 2026-05-17 · **환경**: `localhost:3000` · `npm run dev:fast` · `NEXT_PUBLIC_DIBAY_R2_D1_TRACE=1`  
> **계정**: owner `aa11` · buyer `aaaa` · 매장 `19085860-52d2-4183-b033-e71fcb58bcec` (나의 오른손딸방)  
> **3회 반복** · 시나리오: owner orders 진입 → buyer 신규 주문 → `pending→accepted→preparing` (API 전이 규칙) → poll 전 idle 48s → poll 후 스냅샷  
> **계측**: Playwright `scripts/perf/r2-d1-kpi-meta-measure.mjs` + DOM + API `orders` / `orders?meta_only=1`  
> **TEMP trace**: `[dibay-r2d1-kpi]` (`lib/dibay/r2-d1-kpi-meta-trace.ts`) — 본 런에서 콘솔 수집 0건(클라 번들 미탑재). **DOM·API 교차로 판정**.

### 1. 실측 시나리오

| Run | 주문 ID | 결과 |
|-----|---------|------|
| 1 | — | buyer 세션 만료로 주문 생성 실패 |
| 2 | `d46b8b3a-e110-4e70-9b95-4afc929d31d4` | **측정 유효** |
| 3 | `f359551b-0edc-47ce-9806-caae3d3bd986` | **측정 유효** |

### 2. summaryCounts 변화 시점

| 시점 | `pendingCard` (신규 카드) | API `list_pending` | 비고 |
|------|---------------------------|-------------------|------|
| RT insert 직후 (~5s) | **2** | **2** | row-patch로 목록·derive **즉시 반영** |
| accepted→preparing 직후 (~4s, **poll 전**) | **1** | **1** | status RT patch로 **카드·list 동기** |

→ **summaryCounts SoT = `state.orders` (list owner)** — RT 이벤트 직후 갱신 **증명**.

### 3. pendingAcceptCount 변화 시점

| 시점 | `chipAccept` (접수 대기 chip) | API `meta_pending_accept` | 비고 |
|------|------------------------------|---------------------------|------|
| RT insert 직후 | **1** | **2** | **chip stale** (React meta state 미갱신) |
| accepted→preparing 직후 (poll 전) | **1** | **1** | DB/meta 진실값은 1 — chip은 insert 때 갱신 안 된 채 **우연히 일치** |
| 45s poll 구간 후 | **1** | **1** | `GET …/orders` poll 2회 · `order-counts` 2~4회 |

→ **meta chip SoT = `state.pendingAcceptCount` (`load()` 번들만)** — RT insert 시 **API(2) ≠ chip(1)**.

### 4. stale duration

| 구간 | 관측 |
|------|------|
| insert 직후 | **최소 5s+** — `pendingCard=2` vs `chipAccept=1` (API meta=2) |
| poll 전 idle | chip이 insert 시 bump(1→2)를 **거치지 않음** — 상태 전이 후 숫자만 우연 일치 |
| 상한 | **≤45s** — meta React state는 `load()`/`poll_45s`까지 갱신 경로 없음(이번 런 insert 구간) |

**판정**: stale은 **poll 자체가 원인이 아니라**, poll/load가 meta state의 **유일한 writer**이기 때문에 poll 전까지 창이 열림.

### 5. duplicate HTTP 여부

유효 run(2·3) 공통:

| 엔드포인트 | run당 대략 | owner |
|------------|-----------|--------|
| `GET …/orders` (full list+meta) | **5~6** | mount · **45s poll** · (측정 스크립트 probe 제외 시에도 poll 2회 확인) |
| `GET …/order-counts` | **3~4** | `BusinessAdminShell` / 레이아웃 허브 — **orders 화면과 별도 SoT** |
| RT burst 중 list GET | **0** (status patch 직후 `http_delta`에 orders GET 없음) | R2-D1 LOCK 유지 |

→ **duplicate SoT**: list KPI는 RT row-patch · meta chip은 **full/poll load + 허브 order-counts** — 동일 지표에 **2 HTTP 계열**.

### 6. poll 전 stale 여부

**예 (증명됨)** — Run 2·3 insert 직후:

- `summaryCounts.pending` / 카드: **2**
- `pendingAcceptCount` chip: **1**
- API DB count: **2**

poll(45s) **이전**에 이미 chip/banner owner stale.

### 7. RT 이후 즉시 반영 여부

| 대상 | RT 직후 |
|------|---------|
| 신규/조리중/배달중 카드 (`summaryCounts`) | **즉시** |
| 탭 배지 (`tabBadges`) | **즉시** (동일 list derive) |
| 접수/배달/환불 chip·배너 (`pendingAcceptCount` 등) | **아니오** |

### 8. 실제 단일 bottleneck

**「list는 realtime owner · meta chip/banner는 load/poll owner」ownership split** — 추정이 아니라 insert 직후 **카드=2 · chip=1 · API meta=2**로 증명.

부가:

- `summaryCounts.pending` vs `pendingAcceptCount`는 조건이 유사해도 **SoT 다름** (list 100건 vs DB count).
- 허브 `order-counts`는 orders 화면 meta state와 **동기화되지 않음** (중복 fetch만 발생).

### 9. 다음 fix 후보 1개 (아직 미구현)

**`OwnerStoreOrdersView`에서 meta chip/banner 숫자를 `state.orders`에서 derive** (또는 `setOrdersForRealtime` 시 동일 reducer로 meta 3종 재계산) — **list owner와 KPI owner 단일화**.  

- 금지: `meta_only` poll 추가 · summary full reload · 새 RT channel · poll 제거.

### 10. 절대 건드리면 안 되는 것

- R2-D1 row-patch (`useOwnerStoreOrdersRealtime` · `patchDeliveryFromRealtime`)
- 45s poll / pageshow fallback
- `BusinessAdminDashboard` · `MyBusinessPage` · `order-counts` API (본 트랙 범위 밖)
- `router.refresh` · invalidate masking · cache/debounce 추가

### 측정 PASS/FAIL (본 단계)

| 기준 | 결과 |
|------|------|
| stale window 측정 | **PASS** (insert 직후 card≠chip, API meta 정합) |
| ownership split 증명 | **PASS** |
| duplicate fetch 증명 | **PASS** (`orders` + `order-counts`) |
| single bottleneck | **PASS** (meta `load()` owner) |
| `[dibay-r2d1-kpi]` 콘솔 trace | **미수집** (번들/수집기 — DOM·API로 대체) |

---

## R2-D1 KPI Ownership Unification Result

> **일시**: 2026-05-17 · **단일 fix**: `OwnerStoreOrdersView` meta chip/banner → `state.orders` derive

### 1. 변경 파일

| 파일 | 변경 |
|------|------|
| `lib/stores/derive-owner-store-order-meta-counts.ts` | **신규** — 서버 count 조건과 동일 derive |
| `tests/unit/derive-owner-store-order-meta-counts.test.ts` | **신규** — 단위 검증 |
| `components/business/owner/OwnerStoreOrdersView.tsx` | meta 3종 state 제거 · `metaCounts` useMemo · 알림 `useEffect` |
| `lib/dibay/r2-d1-kpi-meta-trace.ts` | `kpi_derive_update` · `summary_render` · `stale_window_closed` |
| `scripts/perf/r2-d1-kpi-meta-measure.mjs` | PASS 조건: insert 직후 `pendingCard === chipAccept` |

### 2. 제거한 stale meta owner

- `state` ok 분기에서 **`pendingAcceptCount` / `pendingDeliveryCount` / `refundRequestedCount` 필드 제거**
- `load()` 내 `oj.meta.*` → `setState` 경로 **제거** (list `orders`만 갱신)
- chip/banner/silent 배달 알림 기준 → **`metaCounts` derive**

### 3. state.orders derive 구조

```text
state.orders
  ├─ summaryCounts (pending / preparing / delivering / doneToday)
  ├─ tabBadges
  └─ metaCounts ← deriveOwnerStoreOrderMetaCounts(orders)
        ├─ pendingAcceptCount     (= order_status === "pending")
        ├─ pendingDeliveryCount   (= pending && fulfillment_type === "local_delivery")
        └─ refundRequestedCount   (= order_status === "refund_requested")
```

서버 `countPendingAcceptForStore` · `countPendingDeliveryAcceptForStore` · `countRefundRequestedForStore` 와 **동일 조건** (목록 샘플 100건 한도는 기존 KPI 카드와 동일).

**불변식**: `summaryCounts.pending === metaCounts.pendingAcceptCount` (동일 루프 조건).

### 4. stale window 제거 여부

| 구간 | fix 전 (실측) | fix 후 (구조) |
|------|---------------|---------------|
| RT insert 직후 | 카드 2 · chip 1 | **카드 === chip** (동일 derive) |
| poll 전 | meta state stale | **RT row-patch만으로 chip 동기** |
| poll | meta 갱신 | list fallback **유지** (orders[] refresh) |

### 5. RT 직후 카드/chip 비교

- **설계상**: insert/status RT 후 즉시 `pendingCard === chipAccept` (둘 다 `pending` 건수).
- **E2E 재검증** (본 세션): dev 재기동 후 login timeout — `messenger-r2-d1-kpi-measure.log` (2026-05-17T16:11Z) 미완. 로컬에서 dev 안정 후:

```powershell
$env:PLAYWRIGHT_BASE_URL='http://localhost:3000'
$env:NEXT_PUBLIC_DIBAY_R2_D1_TRACE='1'
node scripts/perf/r2-d1-kpi-meta-measure.mjs
```

### 6. duplicate fetch 변화

- **의도적 무변경**: 45s `load()` poll · `order-counts` (허브 쉘) 유지.
- RT burst 중 list GET **0** 정책 유지 (R2-D1 LOCK).

### 7. poll 역할 유지 여부

**유지** — `load()`는 `orders[]` fallback recovery 전용. meta chip은 poll 없이도 derive로 동기.

### 8. 남은 stale 영역

| 영역 | 설명 |
|------|------|
| 목록 100건 밖 refund/pending | derive는 `state.orders` 샘플만 — DB 전체 meta와 다를 수 있음 (기존 신규 카드와 동일 한도) |
| `MyBusinessPage` / `BusinessAdminDashboard` | **미수정** — 별도 `order-counts` / full reload SoT |
| 허브 배지 vs orders 화면 | 화면 간 숫자 불일치 가능 (의도적 범위 밖) |

### 9. 다음 단일 후보

- **허브 `order-counts` RT**와 orders 화면 derive 정합 (본 fix 범위 밖) — 또는
- **BusinessAdminDashboard** RT full reload → row-patch 승격 (별도 트랙)

### 10. 건드리지 않은 것

- poll 45s · pageshow · row-patch hooks
- `order-counts` API · MyBusinessPage · BusinessAdminDashboard
- cache/debounce/additional full reload on RT

---

## R2-D1 FINAL LOCK VERIFICATION

> **일시**: 2026-05-17 · **환경**: `localhost:3000` · `npm run dev:fast` · `NEXT_PUBLIC_DIBAY_R2_D1_TRACE=1`  
> **명령**: `node scripts/perf/r2-d1-kpi-meta-measure.mjs` (3 runs) · `node scripts/perf/r2-d1-real-event-verify.mjs` (1 run)  
> **로그**: `messenger-r2-d1-kpi-final-verify.log` · `messenger-r2-d1-final-rt-verify.log`

### 1. 3회 run 결과

| Run | KPI measure | RT real-event | 비고 |
|-----|-------------|---------------|------|
| 1 | **FAIL** | — | owner login `waitForURL` 90s timeout |
| 2 | **FAIL** | — | 동일 |
| 3 | **FAIL** | — | 동일 |
| RT verify (별도 1회) | — | **FAIL** | 동일 login timeout |

**공통 오류**: Playwright가 `/login`에서 벗어나지 못함. 수동 probe에서 `POST resolve-identifier` 는 200 (`aa11` → email resolve OK)이나 **password 로그인 후 401·페이지 체류** — 현재 DB/비밀번호로 E2E 세션 확보 불가.

### 2. card/chip equality

| 항목 | 결과 |
|------|------|
| RT insert 직후 `pendingCard === chipAccept` | **미측정** (주문 시나리오 미실행) |
| poll 전 동일 유지 | **미측정** |

**구조적 불변식** (코드): `summaryCounts.pending === metaCounts.pendingAcceptCount` — `deriveOwnerStoreOrderMetaCounts` 단위 테스트 **PASS**.

### 3. stale window 존재 여부

| 항목 | 결과 |
|------|------|
| 이번 3회 E2E | **판정 불가** |
| fix 전 실측 (2026-05-17) | insert 직후 카드 2 · chip 1 (**stale 확인**) |
| fix 후 E2E | **미완** |

### 4. RT 직후 list GET 여부

**미측정** (시나리오 미실행). R2-D1 이전 실측: RT burst 중 list GET **0** 유지.

### 5. delivery RT patch 여부

**미측정**. 이전 `r2-d1-real-event-verify` PASS 기록(동일 대화) 참고 — 본 최종 런은 login 실패.

### 6. duplicate fetch 여부

**미측정** (owner orders 미진입).

### 7. poll fallback 역할 유지 여부

**코드 유지 확인** — `load({ reason: "poll_45s" })` · 45s interval **삭제 없음**.

### 8. PASS/FAIL

| 게이트 | 판정 |
|--------|------|
| **E2E 3회 (본 단계)** | **FAIL** — login/환경 |
| **코드·구조 (row-patch + KPI derive)** | **PASS** (구현·단위 테스트) |
| **R2-D1 COMPLETE 공식 선언** | **보류** — E2E green 3회 후 LOCK |

### 9. 공식 LOCK 항목 (코드 기준 · E2E 보류)

아래는 **구현·이전 실측** 기준 lock 후보. **최종 E2E green 전**에는 `COMPLETE` 선언하지 않음.

| 항목 | 상태 |
|------|------|
| `store_orders` realtime row-patch | LOCK (이전 실측 PASS) |
| `store_order_deliveries` realtime row-patch | LOCK (이전 실측 PASS) |
| RT reason full reload 제거 | LOCK |
| list owner 단일화 | LOCK |
| KPI/meta chip **derive** 단일화 | LOCK (코드) · E2E **대기** |
| poll fallback ownership | LOCK (유지) |

### 10. 다음 트랙 후보 (시작 금지)

1. `MyBusinessPage` `order-counts` ownership audit  
2. `BusinessAdminDashboard` RT full reload audit  
3. delivery consumer latency polish  
4. cart/checkout polish  

**E2E 재시도 조건**: owner `aa11` 로그인 성공 확인 후 동일 명령 3회.

```powershell
$env:PLAYWRIGHT_BASE_URL='http://localhost:3000'
$env:E2E_OWNER_USERNAME='aa11'
$env:E2E_OWNER_PASSWORD='1234'
$env:E2E_BUYER_USERNAME='aaaa'
$env:E2E_BUYER_PASSWORD='1234'
$env:NEXT_PUBLIC_DIBAY_R2_D1_TRACE='1'
node scripts/perf/r2-d1-kpi-meta-measure.mjs
node scripts/perf/r2-d1-real-event-verify.mjs
```

---

## 부록 A — 핵심 코드 앵커

| 항목 | 경로 |
|------|------|
| KPI 카드 derive | `components/business/owner/OwnerStoreOrdersView.tsx` — `summaryCounts`, `tabBadges` |
| meta state | 동일 — `load()` → `pendingAcceptCount` 등 |
| row-patch writer | 동일 — `setOrdersForRealtime`, `useOwnerStoreOrdersRealtime` |
| 서버 meta counts | `app/api/me/stores/[storeId]/orders/route.ts` L95–99 |
| count helpers | `lib/stores/owner-store-pending-counts.ts`, `owner-store-refund-count.ts` |
| meta-only API | `?meta_only=1` 동일 route; `lib/business/fetch-store-orders-meta-deduped.ts` |
| 허브 counts | `app/api/me/stores/[storeId]/order-counts/route.ts`, `MyBusinessPage.tsx` L188–250 |
| 대시보드 (별도 정책) | `BusinessAdminDashboard.tsx` — RT→`loadDashboard` |

## 부록 B — R2-D1 LOCK 판정 (참조)

| 항목 | 결과 |
|------|------|
| store_orders row-patch | PASS |
| store_order_deliveries row-patch | PASS |
| RT reason full reload | PASS (0) |
| delivery_reload / realtime_deliveries load | 0 |
| ownership | 배민형 owner orders realtime 운영 구조 |

실측·스크립트: `docs/r2-d1-owner-orders-analysis.md`, `scripts/perf/r2-d1-real-event-verify.mjs`.
