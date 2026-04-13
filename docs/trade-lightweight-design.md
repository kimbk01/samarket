# 거래(Trade) 영역 — 가벼운 설계 원칙

목표: **체감 속도**와 **유지 비용**을 우선. 기능은 “필요한 만큼만”, 데이터는 **한 번에·예측 가능하게**.

## 1. 비목표 (의도적으로 하지 않음)

- 거래 전 도메인을 한 번에 리라이트하지 않는다. **점진적(strangler)** 교체만 한다.
- 클라이언트에 “모든 상태”를 두지 않는다. **URL·서버 응답**이 진실의 원천이 되게 한다.

## 2. 페이지·번들 (JS 줄이기)

| 원칙 | 실천 |
|------|------|
| **RSC 우선** | 목록 껍데기·첫 화면 데이터는 Server Component에서 조회 후, **최소 단위만** `use client` 섬으로 분리한다. |
| **클라이언트 페이지 축소** | `app/(main)/market/[slug]/page.tsx`처럼 전체가 `"use client"`인 패턴은 새 기능에서는 피하고, 레이아웃·첫 페이로드는 서버로 올린다. |
| **무거운 UI는 지연 로드** | 신고 모달·바텀시트 등은 `dynamic(..., { ssr: false })`로 분리(기존 `HomeProductList`의 `ReportReasonModal` 패턴 유지). |
| **목록 행은 가볍게** | 카드 한 장에 들어가는 훅·컨텍스트를 줄인다. 인터랙션(찜 등)만 작은 클라이언트 조각으로 둔다. |

## 3. 데이터 (서버에서 한 번에)

| 원칙 | 실천 |
|------|------|
| **라우트당 로더 1개** | 같은 화면에서 `getHomeChipCategories` + `getPostsForHome`처럼 **출처가 갈라지면**, 서버에서 `{ chips, posts, favoriteMap }` 형태로 **한 번에** 내려주는 API/RSC를 우선한다. |
| **적용됨 (`/home`)** | `app/(main)/home/page.tsx`(RSC)가 `resolveHomePostsGetData`로 첫 피드를 채우고, `HomeProductList`에 넘겨 **마운트 직후 `getPostsForHome` 재호출을 생략**한다. `primeHomePostsCache`로 클라이언트 캐시와 키를 맞춤. |
| **중복 요청 방지** | 클라이언트 `useEffect` + fetch 여러 개보다, **서버 단일 fetch** 또는 **명시적 단일 키**의 `runSingleFlight`만 사용한다. |
| **캐시 키 단순화** | `getPostsForHome`의 캐시 키처럼 **의미 있는 소수의 축**(page, sort, tradeMarketParent 등)만 쓰고, 버전 접미사(`:v3`)로 정책 변경 시 일괄 무효화한다. |

## 4. 클라이언트 상태 (줄이기)

- **필터·탭·정렬**은 가능하면 **searchParams**에 두어 새로고침·공유·뒤로가기와 동작을 맞춘다.
- 서버에서 내려준 목록은 **`useState`로 복제하지 않는다.** 갱신이 필요하면 **router.refresh()** 또는 **한 번의 재요청**으로 맞춘다.
- 찜 동기화처럼 **전역 이벤트**가 필요하면, 범위를 카드/리스트로 한정하고 불필요한 상위 리렌더를 막는다.

## 5. 쿼리·API (단순화)

- 홈 “전체” 피드처럼 정책이 복잡하면 **환경 변수 한 개**(`HOME_POSTS_CONFIGURED_TRADE_UNION` 등)로 스위치하고, **주석으로 정책 이름**을 남긴다.
- **N+1 제거**: 카테고리 확장·닉네임 보강은 서버 레이어에서 배치 처리한다.
- **응답 필드 최소화**: 목록 API는 카드에 필요한 컬럼만(기존 `PostWithMeta` 스키마 유지·남용만 금지).

## 6. 캐싱 계층

1. **HTTP**: `Cache-Control` / `Vary`는 `app/api/home/posts` 등 기존 패턴을 따른다.
2. **앱 메모리**: 짧은 TTL(수십 초) + 키 단순. **탭 복귀 시 무분별 refetch 금지** — 최소 간격(기존 `MIN_SILENT_REFRESH_GAP_MS` 같은 정책) 유지.
3. **DB**: 거래 루트·`trade_category_id` 조합에 맞는 **인덱스**를 쿼리와 함께 검토한다.

## 7. 이행 순서 (리스크 낮게)

1. **읽기 전용** 경로부터: 홈 `/home` 또는 `/market/[slug]` 중 하나만 RSC 첫 페이로드 도입.
2. **중복 클라이언트 fetch 제거**만으로도 체감이 난다.
3. 그다음 **목록 클라이언트 컴포넌트 분할**(카드 단위 인터랙션).

## 8. 관련 기존 코드 (참고만)

- 홈 피드: `components/home/HomeProductList.tsx`, `lib/posts/getPostsForHome.ts`, `app/api/home/posts/route.ts`
- 마켓: `app/(main)/market/[slug]/page.tsx`, `components/market/MarketCategoryFeed.tsx`
- 칩/탭: `lib/trade/tabs/use-trade-tabs.ts`, `lib/categories/getHomeChipCategories.ts`

이 문서는 **새로 짜는 거래 관련 코드**의 기본 준수 사항으로 삼고, 기존 파일은 점진적으로 맞춘다.
