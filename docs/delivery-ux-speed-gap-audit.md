# DIBAY 배달 UX·속도 감사 — 배민·요기요·쿠팡이츠 대비 부족분 재점검

> **목적**: 체감 속도·구조·UX를 **코드·문서 근거**로만 정리하고 **우선순위·진행 순서**를 확정한다.  
> **금지(본 라운드)**: 임의 추측을 ‘사실’처럼 기술, 즉시 다건 수정, 구조 전면 교체, poll 제거, row-patch/KPI owner 훼손, 메신저 R2-M11 재개.  
> **갱신일**: 2026-05-18

---

## 1. 현재 DIBAY 배달 구조 요약

| 영역 | 구현 요약 | 근거 |
|------|-----------|------|
| 라우트 그룹 | `app/(main)/stores/*` — `StoresDeliveryLayoutShell`로 목록↔상세 스크롤·전환 복원 | `app/(main)/stores/layout.tsx`, `StoresDeliveryLayoutShell.tsx` |
| 매장 허브 `/stores` | `StoresHub` 클라 전체 · 카테고리·피드·허브 API | `app/(main)/stores/page.tsx` + `StoresHub.tsx` |
| 로딩 세그먼트 | `/stores` 세그먼트 `loading.tsx` → `MainFeedRouteLoading` 5 rows | `app/(main)/stores/loading.tsx` |
| 검색 `/stores/search` | `DeliverySearchPage` · `/api/stores/search` · 입력 **250ms 디바운스** | `DeliverySearchPage.tsx` L88, L106–111 |
| 매장 상세 `/stores/[slug]` | **의도적** `initialApiResponse=null` — TTFB·서버 선조회로 막지 않음, 클라에서 split API + list seed | `app/(main)/stores/[slug]/page.tsx` L73–77; `dibay-performance-lock.md` §3 Hydration |
| 상세 본체 | `StoreDetailPublic` 대형 클라 컴포넌트 — summary/menus 분리 fetch, perf trace 다수 | `StoreDetailPublic.tsx` |
| 장바구니 | slug cart: 서버 `fetchStorePublicInitialOnServer` + `Suspense` · 글로벌 `/stores/cart` | `app/(main)/stores/[slug]/cart/page.tsx`; `app/(main)/stores/cart/page.tsx` |
| 결제 라벨 `/checkout` | **리다이렉트** → `/{slug}/cart` | `app/(main)/stores/[slug]/checkout/page.tsx` |
| 이미지 | `DeliveryMediaImage` — `next/image` vs native `img` 분기, LCP trace | `DeliveryMediaImage.tsx` |
| 오너 주문 | `OwnerStoreOrdersView` — row-patch + KPI derive + poll · R2-D1 문서 | `OwnerStoreOrdersView.tsx`; `r2-d1-kpi-meta-analysis.md` |

---

## 2. 배민·요기요·쿠팡이츠 기준 비교표 (제품 기대 vs 코드가 허용하는 체감)

| 기대(1줄) | DIBAY 코드상 의미 | 상대 갭 (정성) |
|-----------|-------------------|----------------|
| 탭·필터 **즉시** active + 데이터는 나중 | 허브 검색은 **320ms 디바운스** 후 피드에 전달 | 입력 직후 리스트 반응 **항상 지연** |
| 검색 결과 **즉시** 반영 | 검색 페이지 **250ms 디바운스** 후 `runSearch` | 타이핑 중에는 결과 안 바뀜 |
| 상세 진입 직후 헤더·카테고리 동시에 쓸만 | split fetch + seed-first·trace 있음 | **첫 네트워크 왕복** 전까지는 셸만·부분 데이터 |
| 옵션 시트 즉시 열림 | portal·gate·메모 이슈 과거 수정 (문서) | 회귀 시 **subtree 흔들림** 위험 구조적 가능 |
| 리스트 스크롤 안정 | `delivery-list-scroll-restore` | 상세↔목록 복원은 코드화됨 · **이미지/리렌더**는 별도 |
| 담기 즉시 배지 | cart snapshot 동기 bus (lock 문서) | 측정 전제 **`delivery-flow-perf`** |
| 재연결 시 깜빡임 없음 | `useRefetchOnPageShowRestore` + poll 다수 | **전역 패턴 통일 여부**는 화면별 점검 필요 |

표는 **경쟁사 앱을 직접 측정한 수치가 아님** — 제품 기대 vs **저장소 내 구현** 대조.

---

## 3. route별 체감 속도 측정표

> **원칙**: 아래 **ms·프레임** 칸은 **미측정**이면 “미측정”으로 둔다. (추측 수치 기입 금지)

### 3.1 Phase 1 실측 (2026-05-18) — Playwright headless 3×3

**환경**: `PLAYWRIGHT_BASE_URL=http://localhost:3000`, `DELIVERY_PHASE1_SLUG=aa11`, 산출 `delivery-phase1-ux-measure.json`.

**전제 깨짐(증거)**: 비로그인 요청 시 `/stores` 가 로그인으로 보내짐.

```text
HTTP/1.1 307 Temporary Redirect
location: /login?next=%2Fstores
```

그 결과 브라우저는 배달 허브·검색·상세 **DOM 마커**에 도달하지 못하고, 아래 런 전부 **90s `waitFor` 타임아웃**으로 종료됨.

| Route | Run | shell visible ms | first usable interaction ms | header visible ms | category/tab usable ms | first card/menu visible ms | duplicate fetch (`/api/stores` GET) | layout shift | image delay | full reload |
|-------|-----|------------------|----------------------------|-------------------|------------------------|----------------------------|-------------------------------------|--------------|-------------|-------------|
| `/stores` | 1 | **>90000 (실패)** | **>90000 (실패)** | 미측정 | **>90000 (실패)** `#store-industry-explore` | 미측정 | 0건 | 미측정 | 미측정 | 미측정 |
| `/stores` | 2 | **>90000 (실패)** | **>90000 (실패)** | 미측정 | **>90000 (실패)** | 미측정 | 0건 | 미측정 | 미측정 | 미측정 |
| `/stores` | 3 | **>90000 (실패)** | **>90000 (실패)** | 미측정 | **>90000 (실패)** | 미측정 | 0건 | 미측정 | 미측정 | 미측정 |
| `/stores/search` | 1 | **>90000 (실패)** | **>90000 (실패)** | **>90000 (실패)** `searchbox` | 미측정 | 미측정 | 0건 | 미측정 | 미측정 | 미측정 |
| `/stores/search` | 2 | **>90000 (실패)** | **>90000 (실패)** | **>90000 (실패)** | 미측정 | 미측정 | 0건 | 미측정 | 미측정 | 미측정 |
| `/stores/search` | 3 | **>90000 (실패)** | **>90000 (실패)** | **>90000 (실패)** | 미측정 | 미측정 | 0건 | 미측정 | 미측정 | 미측정 |
| `/stores/aa11` | 1 | **>90000 (실패)** | **>90000 (실패)** | **>90000 (실패)** `메뉴 검색` | 미측정 | 미측정 | 0건 | 미측정 | 미측정 | 미측정 |
| `/stores/aa11` | 2 | **>90000 (실패)** | **>90000 (실패)** | **>90000 (실패)** | 미측정 | 미측정 | 0건 | 미측정 | 미측정 | 미측정 |
| `/stores/aa11` | 3 | **>90000 (실패)** | **>90000 (실패)** | **>90000 (실패)** | 미측정 | 미측정 | 0건 | 미측정 | 미측정 | 미측정 |

**Phase 1에서 확정한 단일 병목(측정 가능 여부)**: **비로그인 상태에서 소비자 배달 핵심 URL이 로그인 리다이렉트에 가로막혀**, 본 라운드 스크립트 기준으로는 shell·first interaction **ms 수치를 산출할 수 없음** (위 307·Playwright 에러 로그).

**Phase 2 제품 병목 후보(프롬프트 가설, 이번 실행으로는 수치 미검증)**: `/stores/[slug]` **first usable interaction** — 코드상 `initialApiResponse=null` + `StoreDetailPublic` 클라 분리 fetch (`page.tsx` 주석·본 문서 §1).

### 3.2 기타 라우트 (아직 미측정)

| Route | shell visible ms | first usable interaction ms | 비고 (코드) |
|-------|------------------|-----------------------------|-------------|
| `/stores/owner/orders` | 미측정 | 미측정 | R2-D1 trace `[dibay-r2d1]` |
| `/stores/cart` | 미측정 | 미측정 | `Suspense` + 서버 fetch |
| `/stores/[slug]/checkout` | N/A | N/A | 즉시 `redirect` to cart |

**권장 측정(재시도)**: 로그인 세션(`storageState`) 또는 E2E와 동일한 인증 플로우 후 동일 스크립트 재실행; 보조로 브라우저 Performance + `lib/dibay/delivery-flow-perf.ts` / `delivery-perf-trace.ts` 로그.

---

## Phase 2 Store Detail First Menu Usable Result

**실행일**: 2026-05-18 · **환경**: `PLAYWRIGHT_BASE_URL=http://localhost:3000`, `DELIVERY_PHASE1_STORAGE=tests/e2e/.auth/cm-storage.json`, slug `aa11`. 산출: 수정 전 `delivery-phase1-ux-measure-aa11-auth.json`, 수정 후 `delivery-phase2-store-detail-after.json`.

### 1. 수정 전 수치 (`/stores/aa11`, 3회)

| Run | header (메뉴 검색) ms | category/tab ms | first menu card ms | `/api/stores` GET |
|-----|----------------------|-----------------|-------------------|-------------------|
| 1 | 18909 | 26514 | 26522 | 5 (dup 0) |
| 2 | 6259 | 10381 | 10401 | 5 (dup 0) |
| 3 | 10784 | 19896 | 20097 | 5 (dup 0) |

### 2. Breakdown·단일 원인 분류

- **분류: B** — `loadSplitDetail` 안에서 `fetchStoreMenusDeduped` 가 **`setSummaryLoading(true)` / `setMenusLoading(true)` 뒤**에 호출되어, 동일 태스크에서 React 상태 갱신·후속 동작이 먼저 진행된 뒤에야 메뉴 GET 이 큐에 올라갈 수 있었음. summary가 menus 응답을 **await** 하지는 않지만(D 아님), **요청 시작 시점**이 한 박자 늦을 수 있음.
- **보조 트레이스**: 콘솔 `[dibay-delivery-detail-phase2]` — `waterfall.menus_fetch_scheduled_before_loading_flags` → `summary_fetch_start` → `menus_fetch_response` / `menus_apply_complete` 순으로 API 워터폴·마운트 상대 시각 확인. `StoreDetailDeferredInfoSection` 에서 `reviews_summary_fetch_*` 는 critical path 밖(E 아님). 옵션 시트는 `option_sheet_open_request` + 기존 seed-first(`prefetchedListRow`) 유지.

### 3. 수정 파일

- `components/stores/StoreDetailPublic.tsx`
- `components/stores/store-detail/StoreDetailDeferredInfoSection.tsx` (reviews-summary 트레이스만)
- `lib/dibay/delivery-detail-phase2-trace.ts` (신규)

### 4. 수정 내용

1. **`fetchStoreMenusDeduped(slug)` 를 로딩 플래그 `setState` 보다 앞**에서 호출(동일 `runSingleFlight` 키·중복 GET 없음). `loadSplitDetail` / `loadSplitDetailSilent` 동일 패턴.
2. **`[dibay-delivery-detail-phase2]`** 로그: mount, summary/menus/reviews fetch 경계, `first_menu_card_data_ready`, `first_category_sections_ready`, 옵션 시트 오픈 요청 등.

### 5. 수정 후 수치 (`/stores/aa11`, 3회)

| Run | header ms | category/tab ms | first card ms | `/api/stores` GET |
|-----|-----------|-----------------|---------------|-------------------|
| 1 | 1081 | 13235 | 13262 | 5 (dup 0) |
| 2 | 3777 | 7006 | 7015 | 5 (dup 0) |
| 3 | 4253 | 7557 | 7577 | 5 (dup 0) |

### 6. 개선률 (first menu card ms, 3회 **중앙값** 기준)

- 수정 전 중앙값 **20097 ms** → 수정 후 **7577 ms** → 약 **62% 감소** (동일 스크립트·동일 slug·인증 세션).

### 7. 남은 병목

- Run 1에서 카테고리~카드 ~13 s — 네트워크/콜드 캐시/서버 menus 지연(A) 여지. Playwright 마커는 **배너 등 `a…/p/`** 도 잡을 수 있어 런마다 의미가 약간 흔들릴 수 있음.
- 헤더~메뉴 갭은 여전히 **menus 응답·정규화·렌더**에 좌우.

### 8. 다음 단일 후보 (Phase 2 종료)

- **Phase 3 라운드 1** 아래 참조.

---

## Phase 3 이미지 체감 (라운드 1)

**목표**: 목록 가로 타일에서 `DeliveryMediaImage`와 불일치하던 raw `img` 제거 — 동일 `aspect-[4/5]`·플레이스홀더 유지, 최적화 가능 URL은 `next/image` 경로.

### 1. 단일 원인

- **이미지 파이프라인 혼재(P2)**: `StoreHorizontalStoreTile` 만 native `<img>` → 최적화·`decoding`·`delivery-image-pipeline` 트레이스와 어긋남.

### 2. 수정 파일

- `components/stores/home/StoreHorizontalStoreTile.tsx`

### 3. 수정 내용

- `DeliveryMediaImage` `fill`, `sizes="148px"`, `surface="store-hub-horizontal-tile"`. 부모 `relative aspect-[4/5]` 그대로.

### 4. 측정

- Playwright Phase1 스크립트는 이미지 전용 지표 없음 — 필요 시 Performance 패널 LCP/CLS·`surface` 로그.

### 5. PASS / 남은 work

- **PASS(범위 내)**: 단일 컴포넌트 정책 정렬, 전역 `next/image` 강제 전환 없음.
- **남은 후보**: `StoreDetailStickyTopRow` 프로필 `img`, `StoreProductAddSheet`/리뷰 등 raw `img` (grep `components/stores`).

### 6. Phase 4 다음 단일 후보

- **라운드 1** 아래 `## Phase 4` 참조. 이후: `StoreVerticalDiscoveryCard` 동일 패턴·메뉴 가상 리스트 경계.

---

## Phase 4 리스트 스크롤·행 리렌더 (라운드 1)

**범위**: `/stores` 피드·`StoresBrowsePrimaryView` 가 공통 사용하는 **세로 행 카드**.

### 1. 단일 원인

- `StoreDeliveryRowCard`는 `memo()`만 적용되어 **기본 얕은 비교** → 부모가 `<StoreDeliveryRowCard data={homeFeedToRowCard(s)} />` 처럼 **매 렌더 새 `data` 객체**를 넘기면 **행 전부가 매번 리렌더**되어 스크롤 중 프레임·뱃지 깜빡임에 불리함.

### 2. 수정 파일

- `components/stores/home/StoreDeliveryRowCard.tsx`

### 3. 수정 내용

- 이미 존재하던 **`storeRowCardDataEqual`** 을 `memo` **두 번째 인자**로 연결 — 표시 필드 기준 동일하면 해당 행 커밋 생략.

### 4. 측정

- React Profiler / 스크롤 시 행 개수·시간 (자동 스크립트 없음).

### 5. PASS / 남은 work

- **PASS(범위 내)**: API·키 구조 변경 없음, 오너 주문 row-patch 미접촉.
- **남은 후보**: `StoreVerticalDiscoveryCard`(`homeFeedItemToVerticalModel` 매번 새 참조), `/stores/search` 목록, `VirtualizedMenuRows` overscan 조정.

### 6. Phase 5 다음 단일 후보

- **Cart / Checkout 체감** — 담기·배지·체크아웃 버튼 반응(마스터 Phase 5).

---

## 4. 부족한 부분 TOP 10 (코드·문서 근거)

| # | 항목 | 우선순위 | 근거 |
|---|------|----------|------|
| 1 | **매장 상세 첫 유효 UI**가 네트워크·클라 hydrate에 강하게 묶임 | **P0/P1** | `initialApiResponse=null` + 다수 `fetch*Deduped`; `dibay-performance-lock` 명시 |
| 2 | **`StoreDetailPublic` 단일 파일 과대** + **load 경로 이중**(`loadSplitDetail` / `silent`) | **P1** | `dibay-architecture-cleanup.md`, `dibay-state-ownership-map` D-OWN-2 |
| 3 | **허브 검색 → 피드 320ms 디바운스** — 타이핑 직후 목록 미변경 | **P0** | `StoresHub.tsx` L138–141 |
| 4 | **검색 페이지 250ms 디바운스** | **P1** | `DeliverySearchPage.tsx` L88 |
| 5 | `/stores` **Suspense fallback=null** — 경계는 있으나 **즉시 스켈레톤 없음** | **P1** | `app/(main)/stores/page.tsx` L14–15 |
| 6 | **가로 타일 `img` 직접** — `DeliveryMediaImage`와 불일치 | **P2** | ~~`StoreHorizontalStoreTile.tsx`~~ → **라운드 1에서 `DeliveryMediaImage` 적용** · 남은 raw `img`는 §Phase 3 |
| 7 | **`/checkout` 무의미 리다이렉트** — “결제 단계” 체감 분리 없음 | **P2/P3** | `checkout/page.tsx` |
| 8 | **slug `/cart` 서버 선조회 Suspense** — 첫 페인트 전 서버 대기 가능 | **P1** | `cart/page.tsx` + `fetchStorePublicInitialOnServer` |
| 9 | **카테고리/정렬 클릭 → 즉시 active vs 데이터** | **미확인** | `StoreCategoryExploreSection` 등 **개별 읽기 필요** |
| 10 | **오너 화면 시각 피드백** (배민 사장님앱 대비) | **P2/P3** | KPI 숫자·row UI는 있으나 **전용 micro-feedback** 미정량 |

---

## 5. 코드 기준 원인 (TOP 5만 상세)

1. **상세 `initialApiResponse=null`** — 의도적으로 서버에서 묶지 않음 → **클라 첫 페인트**는 list seed·summary/menus 응답 시점에 좌우 (`page.tsx` 주석, `dibay-performance-lock.md`).
2. **허브·검색 디바운스** — 네트워크 스팸 방지용으로 **입력과 UI 반응 사이에 고정 지연** (320ms / 250ms).
3. **D-OWN-2** — 상세 load 변형 2종 → 유지보수·회귀 시 **중복 fetch·불필요 대기** 위험 (`dibay-architecture-cleanup.md`).
4. **이미지 파이프라인 혼재** — `DeliveryMediaImage` vs raw `img` → **CLS·캐시·우선순위** 정책이 타일마다 다를 수 있음.
5. **checkout 라우트** — 제품적으로 “한 화면”이 아니라 **리다이렉트만** → 체감 플로우 비교 시 불리.

---

## 6. 추측 영역 / 미측정 영역

**추측 금지로 분리한 항목:**

- 실제 **LCP·FID·스크롤 FPS** (라우트별 숫자).
- 카테고리 탭·정렬 변경 시 **낙관적 UI 여부** (컴포넌트 미정독).
- `StoreNearbyFeedSection` 내부 **full reload vs 클라 필터** 여부.
- 오프라인·Realtime **재연결 시 깜빡임** (화면별 `useRefetchOnPageShowRestore` 조합만 부분 확인).

**문서·lock에 이미 있는 정량:**

- DS1: `menu_fetch_ms` 개선 기록 (`samarket-performance-track-state.md` 인용).
- R2-D1: row-patch·KPI derive (E2E는 별도 게이트).

---

## 7. 즉시 수정 금지 항목

| 항목 | 이유 |
|------|------|
| `useOwnerStoreOrdersRealtime` / delivery row-patch / KPI derive | R2-D1 ownership |
| poll 제거 | fallback ownership 명시 |
| 상세에 임의 **서버 묶음 `initialApiResponse`** 추가 | `dibay-performance-lock` **의도적 null** — 변경은 제품·계약 합의 후 |
| 메신저 R2-M11 | 종료 트랙 |
| 신규 **cache/debounce/fallback** 남발 | `fundamental-fixes-only` 정신과 충돌 |

---

## 8. 우선순위 진행 순서 (필수 8 Phase)

| Phase | 내용 | 산출 |
|-------|------|------|
| **1** | **측정/증명 only** — §3 표 채움, 기존 trace 로그 수집 | route별 수치·로그 캡처 |
| **2** | **usable shell first** — `/stores`·search에서 **빈 화면**·**첫 입력 지연** 최소화 | fallback·즉시 active 정책 합의 후 단일 병목 |
| **3** | **store detail interaction-first** — 헤더/카테고리/첫 카드·옵션 시트 **체감** | `StoreDetailPublic` 단일 병목만 |
| **4** | **image pipeline polish** — `StoreHorizontalStoreTile` 등 **공통 컴포넌트** | `DeliveryMediaImage` 정책 정렬 |
| **5** | **list scroll/render stability** — 긴 리스트 row 단위 갱신 | 워터폴·memo·이미지 로딩 |
| **6** | **cart/checkout perceived speed** | slug cart suspense·redirect UX |
| **7** | **owner order visual feedback** | micro-interaction (row-patch 유지) |
| **8** | **network recovery polish** | tab visible·poll·refetch 일관성 |

---

## 9. 1차 단일 작업 후보

**권장: Phase 1만 먼저 고정**

- **작업**: `/stores`, `/stores/search`, `/stores/[slug]` 에 대해 `delivery-flow-perf` · `delivery-perf-trace` · (가능 시) Performance 패널로 **§3 표를 실측으로 채우기**.
- **이유**: P0/P1 후보가 여러 개라도, **수치 없이 파일을 고르면 금지 규칙(단일 병목)** 과 충돌.

Phase 1 이후 **첫 코드 병목 1개** 후보(예측 아닌 증거 기반):

- **증거가 “지연 고정”으로 확정되면**: `StoresHub` **320ms** 또는 `DeliverySearchPage` **250ms** — **한 곳만** 낙관적 UI/즉시 반영 실험.

---

## 10. 검증 명령

```powershell
npm run verify:routes
npx tsc --noEmit
npx vitest run tests/unit/delivery-menu-visible-trace.test.ts
# (로그인 가능 환경에서) E2E/Playwright
# node scripts/perf/r2-d1-kpi-meta-measure.mjs  # 오너 화면
```

배달 소비자 경로 전용 트레이스가 이미 치고 있다면: 콘솔 `[delivery-*]` · `dibayPerf*` 필터.

---

## 부록 — 관련 문서

- `docs/dibay-performance-lock.md` — Hydration·fetch lock
- `docs/dibay-architecture-cleanup.md` — `loadSplitDetail` 중복
- `docs/dibay-state-ownership-map.md` — D-OWN-2
- `docs/r2-d1-kpi-meta-analysis.md` — 오너 KPI·E2E 게이트

---

## (보류) R2-D1 FINAL COMPLETE LOCK

E2E 로그인 게이트 **green** 전에는 본 문서만으로 **R2-D1 COMPLETE** 선언하지 않음 (`r2-d1-kpi-meta-analysis.md` 참조).

---

## 마무리 — 다음 Cursor 프롬프트용 한 줄

> **Phase 1 재실행(수치 확보)**: Playwright에 **로그인 `storageState`**(또는 E2E 동일 플로우)를 넣고 `delivery-phase1-ux-measure.mjs` 3×3 재실행 → §3.1 표를 **ms 숫자**로 치환한 뒤, `header_visible_ms` vs `first_menu_card_ms` 갭이 가장 큰 라우트를 **단일 병목**으로 확정.
>
> **Phase 2(코드, 단일 파일)**: 그 병목이 상세면 `components/stores/StoreDetailPublic.tsx`만 — `initialApiResponse` 서버 묶음·구조 대개편 금지(`dibay-performance-lock` 준수).
