# DIBAY Delivery Phase 0 — Runtime Structure Audit

> **Phase:** 0 (측정·지도 only · 제품 코드 미수정)  
> **measured_at:** 2026-07-29T17:10:17.989Z  
> **Evidence JSON:** `docs/perf/delivery-phase0-audit-latest.json`  
> **Probe:** `.qa-logs/delivery-phase0-runtime-probe.mjs`  
> **PASS 근거로 사용 금지:** `docs/perf/store-checksheet-audit-latest.json` (2026-06-10)

---

## A. 기준

| 항목 | 결과 |
| --- | --- |
| 시작 HEAD | `db9f079e4346328ab38f6bf8c5a52c77fd970929` (`db9f079e4`) |
| origin/main | 동일 `db9f079e4` |
| working tree | dirty · porcelain ≈ **1322** (기존 untracked/QA 로그 다수 · **이번 Phase 0에서 커밋/삭제하지 않음**) |
| Production | `https://samarket.vercel.app` HTTP 200 (`/stores`) · Vercel sin1 · **배포 SHA는 이번 감사에서 마커로 미확정** |
| 최근 APK | `docs/perf/dibay-responsive-audit-6f8e575.apk` |
| APK SHA-256 | `3633c86427e7000a0a63edbcaaf1f9ef44cd2ec23c9b17043d3987226dad2816` |
| APK commit | `6f8e57578` (**HEAD의 ancestor · HEAD와 불일치 · 6 commits behind**) |
| 기기 | Xiaomi `24076RP19G` (`8b37179f7d94`) · Samsung `SM-M156S` (`RFCY40PY2CA`) · `com.dibay.app` 설치됨 (2026-07-30 업데이트) |
| iOS | **RUNTIME UNVERIFIED** (Phase 0 미실행) |
| Windows | **RUNTIME UNVERIFIED** |
| 실기기 배달 QA | **미실행** → 이 문서만으로 PRODUCT PASS 불가 |
| Playwright | Production · `qqqq@manual.local` · 3 cycles |

---

## B. 구조 지도 (Live SSOT)

| 영역 | Live SSOT | Fetch owner | Cache owner | Writer | Realtime | loading/fallback | 판정 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 소비자 홈 `/stores` | `StoresHub` → `StoresHomeHub` | `fetchStoresHomeFeedDeduped` · `prewarmStoresHomeRoute` | memory Map + session 45s (`store-home-feed-client-cache`) + live store | `StoresHomeHub.loadFeed` | 없음(피드) | `loading.tsx=null` · cold blank `StoresHomeFeedPendingBlank` | **DUP risk** empty suffix×2 |
| 카테고리 | `StoresHomeQuickCategories` | `fetchStoresTaxonomyDeduped` | taxonomy TTL 120s | QuickCategories | 없음 | `StoresHomeCategoriesSkeleton` (sub panel) | pulse 잔존 |
| Browse | `StoresBrowsePrimaryView` | browse deduped / snapshot | browse client cache | browse view | 없음 | featured menu skeleton | LIVE |
| 매장 상세 | `StoreDetailPublic` (`initialApiResponse=null`) | summary+menus split | menus/summary client cache | detail client | 없음 | sheet/menus skeletons | cold 클라 의존 |
| 장바구니 | cart clients | cart APIs | commerce cart store | cart writers | 없음 | route fallback pulse | 미실측 상세 |
| 고객 주문 | store-order pages | buyer snapshots | buyer list snapshot | order client | 주문 채팅 별도 | — | 미실측 상세 |
| 오너 주문 | `OwnerStoreOrdersView` | `fetchStoreOrdersListDeduped` | list snapshot | row-patch | `useOwnerStoreOrdersRealtime` (R2-D1 LOCK) | Suspense text fallback | probe pulse=0 |
| 오너 상품 | `OwnerProductsHubClient` | RSC `loadOwnerProductsHubBootstrap` | RSC bootstrap | products client | 없음 | **`MainFeedRouteLoading` skeleton** | **정책 위반 후보** |
| Business Guard | `StoreBusinessGuard` | `fetchMeStoresListDeduped` | me-stores peek | guard phase | 없음 | **no-cache 시 animate-pulse** | **정책 위반 후보** |

### Route 목록 (consumer + owner)

`app/(main)/stores/{page,search,browse/[primary],cart,[slug],…,owner/*}` — `(stores)` remount 제거됨 · `(main)` 유지.

### Orphan 분류 (static+dynamic · barrel · verify · doc)

| 파일 | 분류 | 근거 |
| --- | --- | --- |
| `StoreNearbyFeedSection.tsx` | **LEGACY DUPLICATE** | product import 없음 · live=`StoresHomeHub` · 자체 home-feed fetch |
| `StoresHomeSkeleton.tsx` | **ORPHAN** | verify/doc only |
| `StorePromoHeroBanner.tsx` | **ORPHAN** | self only |
| `StoreHubMyZoneSection.tsx` | **ORPHAN** | self only |
| `StoreHorizontalRail.tsx` | **ORPHAN** | self only |
| `StoreCategoryExploreSection.tsx` | **ORPHAN** | TabBar만 참조 · TabBar도 orphan |
| `StoreCategoryTabBar.tsx` | **ORPHAN** | self only · @deprecated |
| `StorePrimaryIndustrySwitcher.tsx` | **ORPHAN** | TabBar만 |
| `StoresHomeBuyerMyZone.tsx` | **ORPHAN** | self only |
| `StoreVerticalDiscoveryCard.tsx` | **LIVE** | `StoresHomeStoreDiscoveryRail` |
| `StoreHorizontalStoreTile.tsx` | **INDIRECT / verify** | thumbnail verify · 제품 mount 미확인 → Phase 1에서 추가 그래프 후 처리 |

---

## C. 중복·누수 (Production 3회)

| 항목 | 수정 전 (Phase 0 실측) | 증거 | 판정 |
| --- | ---: | --- | --- |
| `/api/stores/home-feed` (empty) | **2 / cycle** | JSON cycles 1–3 | **FAIL** |
| `/api/stores/home-feed?region=Manila` | 1–2 | 지역 키 ≠ hub `region+district` | **FAIL (키 분열)** |
| `/api/stores/home-feed?region=Manila&district=1234` | 1 | hub mount | OK 단독 |
| taxonomy | 3 / cycle (시장 왕복 포함) | top_dupes | 조사 필요 |
| `/api/me/stores` | **5 / cycle** | market leave/return remount fan-out | **FAIL 후보** |
| 목록 동시 hub mount | max **1** (재측정) | duplicateHub | OK (1차 2는 측정 노이즈) |
| 상세 동일 요청 | 미확보 | food card가 `/stores/{slug}/p/{id}` 라 detailHref 미추출 | **RUNTIME PARTIAL** |
| 소비자↔오너 누수 | 미확보 | Phase 0 시나리오 미완 | **UNVERIFIED** |

**코드 원인 후보 (Phase 0 확정용 가설 → Phase 3에서 단일 원인 확정):**

1. `prewarmStoresHomeRoute` 가 **항상 `""` + region suffix** 를 데움 (`stores-home-route-prewarm.ts`).
2. hub는 `?region=&district=` 키로 mount fetch.
3. empty `home-feed` 가 cycle마다 **2회** → prewarm 이중 호출자(언어 ready 스케줄 + layout prewarm) 또는 Strict/remount — **wrapper 추가 금지, 호출자 확정 후 제거**.

---

## D. 스켈레톤·배치

| 화면 | Cold | Warm | Cache hit | CLS/점프 | 판정 |
| --- | --- | --- | --- | --- | --- |
| 배달 홈 | blank **707–1812ms** · pulse **38–41** · first card **821 / 1858 / 1920** (median **1858**) | first card **0ms** · blank frames **0** · pulse still **35–41** | warm 카드 즉시 | 미계측 CLS | **FAIL** (pulse·blank 정책) |
| 카테고리 | 칩 표시 shell~100ms | — | taxonomy TTL | — | pulse 경로 잔존 |
| 매장 목록 | primary/food 표시 | warm 0ms | session/memory | — | pulse=이미지 placeholder 가능 |
| 매장 상세 | Phase 0 미확보 | — | — | — | **UNVERIFIED** |
| 오너 주문 | pulse **0** (probe) | — | — | — | 제한적 OK |
| 오너 상품 | 코드상 `MainFeedRouteLoading` | — | RSC bootstrap | — | **코드 FAIL 후보** |

---

## E. 속도 (원시 3회)

| 구간 | values (ms) | median | max | 판정 |
| --- | --- | ---: | ---: | --- |
| cold 셸 | 101 / 103 / ~125 | ~103 | ~125 | OK |
| cold → 첫 카드 | 821 / 1858 / 1920 | **1858** | **1920** | 병목 후보 |
| warm → 첫 카드 | 0 / 0 / 0 | **0** | 0 | cache paint OK |
| warm nav wall | 284 / 342 / 301 | 301 | 342 | — |
| 목록→첫 메뉴 | — | — | — | **UNVERIFIED** |
| 오너→주문 목록 wall | 5113 (1회 probe) | — | — | 참고만 |

---

## F. 삭제·격리 (Phase 1 완료)

| 파일 | 기존 상태 | 근거 | 처리 | 재도입 방지 |
| --- | --- | --- | --- | --- |
| `StoreNearbyFeedSection.tsx` | LEGACY DUPLICATE | product import 없음 · 자체 home-feed | **deleted** | `verify:delivery-dead-home-files` + hub contract `assertFileAbsent` |
| `StoresHomeSkeleton.tsx` | ORPHAN | verify/doc only | **deleted** | 동일 |
| `StorePromoHeroBanner.tsx` | ORPHAN | self only | **deleted** | 동일 |
| `StoreHubMyZoneSection.tsx` | ORPHAN | self only | **deleted** | 동일 |
| `StoreHorizontalRail.tsx` | ORPHAN | self only | **deleted** | 동일 |
| `StoreCategoryExploreSection.tsx` | ORPHAN | TabBar cluster | **deleted** | 동일 |
| `StoreCategoryTabBar.tsx` | ORPHAN | self only | **deleted** | 동일 |
| `StorePrimaryIndustrySwitcher.tsx` | ORPHAN | TabBar only | **deleted** | 동일 |
| `StoresHomeBuyerMyZone.tsx` | ORPHAN | self only | **deleted** | 동일 |

Live SSOT unchanged: `app/(main)/stores/page.tsx` → `StoresHub` → `StoresHomeHub`.

**Phase 1 verify:** `verify:delivery-dead-home-files` · `verify:stores-home-hub-contract` · `verify:no-tab-skeleton-blocking` · `verify:trade-primary-tab-transition` → **PASS** (2026-07-30).


---

## G. 플랫폼

| 시나리오 | Xiaomi | Samsung | iOS | Windows | Playwright Prod |
| --- | --- | --- | --- | --- | --- |
| Cold | UNVERIFIED | UNVERIFIED | BLOCKED | UNVERIFIED | **실행** |
| Warm | UNVERIFIED | UNVERIFIED | — | — | **실행** |
| Resume | UNVERIFIED | UNVERIFIED | — | — | 미실행 |
| 키보드 | UNVERIFIED | UNVERIFIED | — | — | 미실행 |
| 어드민 | UNVERIFIED | UNVERIFIED | — | — | 주문 path만 |

---

## H. Phase 0 최종 판정

```text
DELIVERY RUNTIME PARTIAL
```

근거:

- Production Playwright 3회 증거 확보 · HEAD 기록.
- **home-feed 동일 URL 중복 · warm/cold pulse · region 키 분열** 확인.
- Xiaomi/Samsung 배달 시나리오·iOS·Windows·상세 메뉴·매장 전환 누수 **미실측**.
- APK ≠ HEAD → 기기 PRODUCT PASS 불가.
- 기존 STORE-AUDIT-1 JSON은 PASS 근거로 사용하지 않음.

### Phase 1 진입 조건

충족: orphan 그래프 확정 · live SSOT=`StoresHomeHub` · 제품 경로에서 orphan mount 없음.

### Phase 2+ 우선 후보 (아직 수정하지 않음)

1. **P0** home-feed empty×2 + region key 분열 (단일 호출자/키 정규화)
2. **P0** 리스트 pulse 정책 (카드 이미지 placeholder 포함 여부 확정 후)
3. **P1** 오너 products `MainFeedRouteLoading` · BusinessGuard pulse
4. cold blank 707–1812ms → 배치(Phase 4)

---

## 다음 단계

**Phase 1** — 확정 orphan/legacy duplicate hard delete + verify 재도입 금지. Live 경로 변경 없음.
