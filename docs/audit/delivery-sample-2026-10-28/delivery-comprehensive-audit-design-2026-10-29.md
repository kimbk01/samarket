# 배달 홈·매장·배너·노출·UI·성능 종합 감사 + 설계안 (2026-10-29 PHT)

**기준:** Production `36e18e8cd`(코드) · 운영 DB `ckdosyydvgzqwpbwuhon` 읽기만 · 운영 설정·데이터·코드 변경 0.
**확인 조건:** 회원 = Owner 계정(저장 주소 CM KIM FOOD MART, Chrome 1723×1038 — 휴대폰 폭 아님) · 비로그인 = Claude Browser 375×812 · 08:20~08:50 PHT.
**증거 표기:** ✓ = 작업자가 화면·API·DB·코드로 직접 확인 · [코드] = 감사 에이전트가 file:line 으로 확인, 작업자 미재확인 · NOT_PROVEN = 확인 못 함.
**실기기:** NOT_PROVEN (Owner 휴대폰 캡처 1장 외 측정 없음).

---

## 0. 기준 (Owner 지시 = 계약)

| ID | 기준 |
|---|---|
| K1 | 어드민에서 켠 홈 선반 + 고른 데이터 소스 ⇒ 앱에 그 소스의 매장으로 나온다 (제목은 자유) |
| K2 | 선반은 각자 독립 — 같은 소스를 여러 선반이 써도 된다 |
| K3 | 어드민 숫자·숨김 이유·미리보기 = 앱 |
| K4 | **비로그인 = 배달 화면을 보지 못하고 로그인으로 유도** (Owner 2026-10-29 결정 — 이전 「비로그인 최신순」 대체) |
| K5 | 회원 = 접속(저장) 주소에 **배달 가능한 실제 매장만** (범위 밖 제외 = 계약). **주소 없는 회원** = 배달 진입 시 「배달 주소가 없습니다」 배너로 주소 설정 유도 (전체 노출 없음) |
| K6 | 샘플 매장 = 실제 매장과 같은 화면·선반·데이터 처리. 예외 2가지만: ① **배달 범위 판정 무시 — 샘플은 주소와 상관없이 모두 노출** ② 최종 주문 차단. 샘플은 **「샘플 매장」 배지 필수** |
| K10 | 「더 많은 매장」 선반은 있어야 하고, 노출 여부는 어드민 토글이 결정 |
| K11 | 배너 = 3장이 **오른쪽→왼쪽으로 슬라이드** (홈 상단·업종 상단) |
| K7 | 매장 목록 노출 정책·배너 어드민 등록 = 앱 1:1 |
| K8 | 빈 화면·CTA·슬라이드·전환 = DIBAY 공통 UI 하나 |
| K9 | 배달 흐름 누수·누락·병목 없음 |

---

## 1. 작업자 잘못 (먼저 보고) — 영향과 제거 계획

| # | 잘못 | 증거 | 영향 | 제거·복구 |
|---|---|---|---|---|
| W1 | 시험 저장이 Owner 의 「더 많은 매장」 OFF(08:12:05)를 6초 뒤(08:12:11) 덮어씀 — 저장 직전 revision 재조회로 409 회피 | ✓ `store_composition_policy_logs` | 현재 ON. Owner 의 같은 저장의 다른 필드는 기록이 없어 복구 불가 | Owner 재저장 또는 승인 후 1칸만 OFF. 규정 8(AGENTS.md)로 재발 방지 |
| W2 | `d2bf436b4` 「지금 주문 가능」에서 샘플 제외 — K6 위반 | ✓ `stores-home-data-source.ts:121-123`, 테스트가 고정 `delivery-sample-home-cards-2026-10-29.test.ts:31-38` | 샘플이 order_now 선반에 못 들어감 | 조건 삭제 + 테스트 반대로 |
| W3 | `a6bbd959c` 생길 수 없는 숨김 사유 「위 선반이 같은 매장을 먼저 노출」 | ✓ `stores-home-shelf-draft-allocation.ts:75-76`, 어드민 화면 dibaY 추천·할인/프로모션 | 실제 원인(범위 밖) 대신 거짓 사유 표시 | 필드·문구 삭제 → §3-H2 |
| W4 | `36e18e8cd` 저장 검증 추가하면서 읽기 보정(coerce*) 유지 — 이중 규칙 | [코드] `stores-home-shelf-product-resolve.ts:94,112`, `draft-allocation.ts:50,57` | 기존 잘못 저장된 행이 어드민·앱에 다른 값으로 보임(dibaY 추천 DB=세로형, 화면=가로) | 잘못 저장된 행 1회 정리(승인) 후 읽기 보정 제거 |
| W5 | `36e18e8cd` 업종 정책 resolve 를 taxonomy 라우트에 3번째로 복제 · 정책 조회 실패 시 전부 노출(fail-open) | [코드] `browse-top-banners/route.ts:32-41`, `taxonomy/route.ts`, `stores-browse-scope-customer-meta.ts` | 같은 규칙 3곳 | 서버 helper 1개로 통합 |
| W6 | 샘플 광고 시드: STORES_CATEGORY_TOP ACTIVE 8건(한도 3) | ✓ DB 8건 · 시드 `seed-sample-ads.ts:31-33` | 업종 상단 경쟁 8건, 모든 업종에 1번만 | 초과 5건 종료(승인) + 작성기 한도 검사 §3-B2 |
| W7 | 샘플 운영값을 관리자 API 아닌 직접 UPDATE(위치·반경·결제수단) | [코드] `seed-sample-ops.ts:81` | 관리자 화면으로 못 고치는 값 | 관리자 샘플 PATCH 에 항목 추가 후 그 경로로 재기록 |
| W8 | 샘플에 운영 신호(리뷰·배달비 할인·추천·프로모션·주문) 0 으로 시드 | ✓ 홈 피드 집계 | 소스 5종 후보 0 → 선반 숨김 | §3-S3 |
| W9 | 거짓 보고(비로그인 1화면으로 「정상」, 테스트 통과로 「완료」, FAIL 을 「계약대로」) | 대화 기록 | Owner 판단 오도 | AGENTS.md 「허위·추측·사기 보고 금지」(a3950336e) |

---

## 2. 결함 (FAIL)

### 2-1. 홈 선반 (K1·K2·K3)

| # | 결함 | 증거 |
|---|---|---|
| H1 | 회원 화면: 켜진 8 중 4만 노출 (dibaY 추천·할인/프로모션·배달팁 할인·추천 숨김) | ✓ 회원 DOM |
| H2 | 어드민 숨김 사유 거짓(W3) · 「같은 데이터 소스 선반 2개」 실제 3개 | ✓ 어드민 화면 |
| H3 | 어드민 후보 수는 범위 밖 미반영(후보1·배정0), 앱 composer 는 범위 밖 제외 — 계산 경로 2개 | [코드] `stores-home-data-source.ts:143-150` vs `stores-home-composer.ts:118,510-555` |
| H4 | 소스 판정 이중 구현: composer `hasDeliveryFeeStrikeEvidence`·`isTopRatedCandidate`·`STORES_HOME_TOP_RATED_MIN_*` vs data-source `HIGH_RATING_MIN_*` | ✓ `stores-home-composer.ts:122-130` |
| H5 | 「할인/프로모션(campaignFood)」·「추천(slot5Food)」은 회원에게 범위 밖 매장 허용 — K5 위반 | ✓ `delivery-list-oor-policy.ts:56` |
| H6 | 미리보기 = 자체 overlay 경로·격자 클래스·혜택 없음·홈피드 별도 fetch, 빈 선반 이유 없음 | ✓ 미리보기 문구 · [코드] `AdminStoresHomeShelfLivePreview.tsx:143-161,208-260` |
| H7 | 기본 부제가 데이터 소스와 무관(「지금 주문 가능」 소스=신규인데 「영업 중·배달 또는 포장…」) | ✓ 회원 DOM |
| H8 | 「전체 보기」가 소스와 무관한 식당 정렬 링크 | ✓ 이전 실측 |
| H9 | legacy composer 경로(선반 간 중복 제외)와 shelf-led 경로 공존 + 죽은 gate·인접 회피 코드 | [코드] `stores-home-composer.ts:62-90,463,509,670-760` |
| H10 | 매장형 선반 카드에 샘플 배지 누락 — 매장→카드 매퍼 4곳 분산 | ✓ `stores-home-store-to-shelf-entry.ts` isSample 0건 |
| H11 | 부제 해석 2단계 함수 | [코드] `stores-home-shelf-product-resolve.ts:75-85,214-219` |

### 2-2. 매장 목록 노출 정책 (K7)

| # | 결함 | 증거 |
|---|---|---|
| C1 | 하위 업종 화면: 헤더 「식당」, 「다른 가게도 둘러보세요」(중식 아닌 매장)가 목록 위 → 실제 중식은 첫 화면 밖 | ✓ 375 화면 |
| C2 | 식당 전체 화면 탐색 선반 설정 ON 인데 안 나옴(같은 업종·현재 목록 제외 → 후보 0) | ✓ API `discoveryShelf=false` |
| C3 | 2차 칩 이미지 빈 원(중식·양식·분식·치킨·세탁·수리) | ✓ 375 화면 |
| C4 | 정책 요약 「노출 간격 = 내용을 불러올 수 없습니다」 | ✓ 어드민 화면 |
| C5 | 미리보기에 상단 배너·탐색 선반·정렬 칩·광고 삽입 없음 | ✓ 어드민 화면 |
| C6 | 식당 2차 6개 「별도 설정 있음」(8월 QA 행, 광고 간격 8 고정) | ✓ 어드민 화면·DB |
| C7 | `36e18e8cd` 수정 6건(일정 PHT·2차 상속·바뀐 2차만 저장·OFF 시 배너·탭 숨김·표시명) 운영 재실측 | NOT_PROVEN |

### 2-3. 배너 (K7)

| # | 결함 | 증거 |
|---|---|---|
| B1 | 업종 상단: 업종별 8건 등록 → 모든 업종에 1번(소담한식)만. 업종 대상 필드·컬럼 없음 | ✓ DB·375 화면(서비스 업종에 식당 배너) · [코드] `browse-top-banners/route.ts:51-57` |
| B2 | 노출 한도 검사가 HERO 만 — 비HERO 무검사 통과, 승인 시 지면을 HERO 로 고정 검사 | ✓ `delivery-ad-admin-first-party-writer.ts:143-155`, `capacity-gate.ts:272-279`, `admin-delivery-ad-writer.ts:~272` |
| B3 | 업종 수용량 1~3 저장해도 1장만 그림 | ✓ `StoresBrowseTopBanner.tsx:60` |
| B4 | 홈 중간 route capacity 1 고정 vs DB 3 | [코드] `home-before-rest-banners/route.ts:28` |
| B5 | 배너 기간 입력이 관리자 브라우저 시간대로 저장 | ✓ `AdminDeliveryAdFirstPartyCreateView.tsx:141-142` |
| B6 | 연결 테이블 priority 미사용, 업종별 순서 없음 | [코드] |
| B7 | 업종 배너 당겨서 새로고침 미반영 | [코드] `StoresBrowseTopBanner.tsx:52` |
| B8 | 미리보기 라벨 「광고」 vs 앱 「샘플 광고」 | [코드] |
| B9 | 배너 대상 샘플 매장이 회원 주소 반경 밖인데 노출(샘플 범위 판정 제외) | ✓ DB 거리 14~15km·반경 ≤5km, 회원 화면 배너 노출 |

### 2-4. 노출 기준 (K4·K5·K6)

| # | 결함 | 증거 |
|---|---|---|
| E1 | 비로그인 홈·업종·검색·탐색 선반 모두 최신순 아님. 최종 정렬 = 적격 순위→거리(게스트 null)→**id 문자열**. RPC 가 인기순 48개로 먼저 자름 | ✓ `resolve-discovery-oor-with-service-area.ts:126-142` · ✓ 화면 순서 · [코드] RPC·search |
| E2 | 홈 API 는 범위 밖 행을 그대로 반환 → 회원 배달 가능 0 이어도 홈 빈 안내 안 뜸 | [코드] `home-feed/route.ts:582-605` |
| E3 | 주소·좌표 없는 회원 = 게스트처럼 전체 노출 | [코드] `store-list-delivery-origin.ts:157-164` |
| E4 | 검색만 회원 주소 기준 다름(defaults.master) | [코드] `search-delivery.ts:410-424` |
| E5 | 샘플 범위 판정 제외 → 홈·업종·검색·배너 전부에서 회원에게 범위 밖 샘플 노출 (Owner 주소 기준 반경 안 0곳인데 35곳 노출) | ✓ `delivery-list-oor-policy.ts:37` · ✓ DB 거리 계산 |
| E6 | 샘플 전용 분기(주문 차단 외): order_now 제외(W2)·무료배달 배지 숨김·문의 차단·판매승인 없이 메뉴 공개·광고 이벤트 미기록 | [코드] 위치 목록 = 에이전트 보고 |
| E7 | `legacy_test` 고객 노출 차단이 관리자 PATCH 에만 — 고객 로더 필터 없음 → 맛업는식당(좌표·업종 없음) 노출 | ✓ DB `is_visible=true` · [코드] `store-discovery-candidate.ts` 등 |

### 2-5. 빈 화면·CTA (K8)

| # | 결함 | 증거 |
|---|---|---|
| U1 | 공통 빈 화면 컴포넌트(`MyStateView kind="empty"`)를 주문 목록만 사용, 배달 7곳 각자 마크업 | [코드] |
| U2 | 홈 매장 0 문구 「등록된 매장이 없습니다」 고정 — 주소 배달 불가와 구분 없음 | ✓ `StoresHomeHub.tsx:421-424` |
| U3 | 검색 결과 없음 CTA 없음 | ✓ 375 화면 |
| U4 | 없는 앵커 `/stores#store-industry-explore` 링크 2곳 | ✓ grep |
| U5 | 업종 빈 화면 `dark:` 6건·칩 `rounded-full`, 메뉴 빈 화면 `rounded-[14px]`·neutral, 범위 밖 박스 raw amber | [코드] |
| U6 | 「가게 둘러보기」/「매장 둘러보기」 문구·버튼 클래스 2종, 매장 장바구니 빈 화면 CTA 없음 | [코드] |

### 2-6. 슬라이드·애니메이션 (K8)

| # | 결함 | 증거 |
|---|---|---|
| A1 | 홈 히어로 5초 자동 넘김: 화면 숨김·터치 중·동작 줄이기에도 안 멈춤, 전환 없이 즉시 교체 | ✓ `StoresHomeHeroBanner.tsx:64-68` |
| A2 | 동작 줄이기 처리 = 검색 팝업만. 2차 칩 슬라이드·목록→매장 전환 미처리 | ✓ `delivery-components.css:1766` |
| A3 | 전환 시간 270/440/360/300ms·이징 제각각, 주석 440ms ≠ 실제 360ms | [코드] |
| A4 | 홈 레일 구현 혼재(드래그/일반 div), snap 없음 vs 목록 카드 snap | [코드] |
| A5 | 2차 칩 슬라이드 상태가 해제 안 될 수 있음 | [코드] 런타임 NOT_PROVEN |
| A6 | 상품 이미지 스와이프 없음·즉시 교체, 매장 상세 첫 프레임(동작 줄이기) | [코드] |

### 2-7. 누수·누락·병목 (K9)

| # | 결함 | 증거 |
|---|---|---|
| P1 | 홈 피드: 새 캐시가 있어도 매번 재요청 (home-feed 2회 경로) | ✓ `StoresHomeHub.tsx:213-218` · ✓ 회원 첫 로드 home-feed 2회 |
| P2 | 히어로·중간 배너 single-flight·캐시 없음, 이벤트마다 재요청 (히어로 2회 측정) | ✓ 회원 첫 로드 2회 · [코드] |
| P3 | 주소 origin 해석을 home-feed·hero·before-rest 가 요청마다 따로 | [코드] |
| P4 | home-feed 서버 직렬 waterfall · 정책 이중 조회 · 상품 limit 없음 · 회원은 매 요청 콜드 | [코드] |
| P5 | browse 카드 보일 때마다 menus·summary·banners 3건 prefetch | [코드] |
| P6 | 대표메뉴 서버 캐시·commerce meta 캐시가 관리자 저장 시 안 비워짐 (정리 함수 호출 0곳) | ✓ `store-public-server-memory-purge.ts:24-33`, `clearBrowseFeaturedItemsServerCacheForStore` 호출 0 |
| P7 | 고객 taxonomy 5분 TTL · browse 스냅샷 TTL·언어키 없음 → 업종 정책 변경 지연 | [코드] |
| P8 | 서버 메모리 캐시 prune 없음·클라이언트 Map 축출 없음·장바구니 쿠폰 요청 debounce 없음·대표메뉴 관찰 reset 버그 | [코드] |

---

## 3. 설계안 — 관심사마다 소유자 1개, 중복·땜빵 제거

### 3-S. 샘플·노출 기준 (먼저 — 모든 화면의 입력)
- **S1 샘플 = 실제 매장 (K6)**: `stores-home-data-source.ts:123` 샘플 제외 삭제, 무료배달 배지 숨김·문의 차단·광고 이벤트 미기록 등 주문 차단 외 예외 삭제. **남기는 것 3개**: ① `delivery-list-oor-policy.ts:37` 샘플 범위 판정 무시(Owner 결정 — 주소 무관 전부 노출) ② 주문 차단(`resolveStoreOrderability` 사유 `sample` + 판매권한 미승인 RPC) ③ 「샘플 매장」 배지 — 모든 카드 종류에 누락 없이(H-g 매퍼 통합).
- **S2 고객 노출 판정 1곳**: `approval_status='approved' AND is_visible AND store_kind<>'legacy_test'` 를 고객 후보 RPC·검색·배너·상세 공통 조건으로. DB CHECK(`legacy_test → is_visible=false`) + 맛업는식당 노출 해제(승인).
- **S3 샘플 운영 데이터**: 관리자 샘플 PATCH 에 위치·반경·결제수단·배달비 할인·추천 지정 추가 → 그 경로로 업종별 일부 샘플에 배달비 할인·추천·리뷰(샘플 표시)·기획 프로모션 1건 기록. 영업시간 실제 운영 형태(승인).
- **S4 비로그인 = 로그인 유도 (K4)**: 배달 진입점(`/stores` 레이아웃 `StoresDeliveryLayoutShell`) 1곳에서 비로그인이면 배달 내용 대신 로그인 유도 화면(공통 빈 화면 SSOT + 「로그인」 CTA, 로그인 후 원래 경로 복귀). 배달 고객 API 는 비로그인 응답 계약을 함께 정함(목록 비노출). 게스트 정렬 RPC 변경은 **불필요**(삭제).
- **S5 회원 = 배달 가능만 (K5)**: 범위 밖 제외를 **API 단계 1곳**(`shouldExcludeOutOfRangeFromNormalList`)으로 — home-feed 도 browse 와 같게 제외, `HOME_DISCOVERY_SHELVES_ALLOW_OOR` 삭제(실제 매장 기준). 검색 origin 을 `resolveStoreListDeliveryOrigin` 으로 통일. **주소 없는 회원**: 배달 진입 시 「배달 주소가 없습니다 · 주소 설정」 배너(공통 UI) — 목록은 샘플만(샘플은 주소 무관 노출), 실제 매장 전체 노출 경로(`store-list-delivery-origin.ts:157-164` 의 none → 전체) 삭제.
- 결과(데이터 기준): Owner 주소 = 반경 안 실제 매장 0곳(실제 매장 자체 0곳) → 회원 화면 = 샘플 35곳(배지) + 배달 가능 실제 매장 0곳. 맛업는식당(legacy_test)은 S2 로 비노출.

### 3-H. 홈 선반
- **H-a 소스 판정 1함수**: `storeMatchesHomeDataSource` 만 남기고 composer 의 소스별 필터·상수 삭제(H4). 범위 밖 제외는 S5 에서 이미 끝난 풀만 받는다.
- **H-b 배정 1함수 + 진단**: `allocateShelf(pool, spec) → { items, funnel }` — 앱 composer·어드민 목록·미리보기가 모두 이 결과만 사용. 「위 선반이…」·별도 후보 계산 삭제(H2·H3·W3). 사유 = 소스 불일치 n / 대표 상품 없음 n / 최대 0 / 기간 / OFF.
- **H-c legacy composer 삭제**: 선반 설정이 없으면 기본 선반 설정으로 같은 경로(H9). 죽은 gate·인접 회피·deprioritize 삭제.
- **H-d 미리보기 = 앱 렌더**: 미리보기는 `StoresHomeCompositionSlotSection` 렌더 함수를 그대로 쓰고 `applyHomeShelfDrafts` 결과만 받음, fetch 1회. 청중 선택(비로그인 / 이 주소) 추가(H6).
- **H-e 읽기 보정 제거**: 잘못 저장된 행 1회 정리(승인) → coerce* 삭제, UI 는 불가 조합 비활성(W4).
- **H-f 부제·전체 보기**: 기본 부제·전체 보기 대상을 데이터 소스에서 파생, 부제 해석 1함수(H7·H8·H11). 전체 보기 = 같은 소스 필터 목록(browse `source=` 파라미터 신설).
- **H-g 카드 매퍼 1개**: 매장→카드 entry 매퍼 4곳 통합(isSample·프로필 이미지 누락 재발 방지, H10).

### 3-C. 매장 목록 노출 정책
- 업종 정책 resolve 서버 helper 1개(W5), fail-closed.
- 하위 업종 화면 헤더·칩 = 2차 이름(C1), 탐색 선반 기본 위치 = 목록 N개 뒤, 「현재 1차」 출처 정의 재설정(C2).
- 2차 칩 이미지 누락 데이터 보완(C3 — 데이터, 승인), 「노출 간격」 번역 변수(C4).
- 미리보기 = 앱 목록 컴포넌트 + 배너·탐색 선반·칩·광고 삽입(C5).
- 식당 2차 6개 상속 복귀(C6 — 데이터, 승인). `36e18e8cd` 6건 운영 재실측(C7 — 시험 저장 승인).

### 3-B. 배너
- 대상 업종 컬럼(1차·선택 2차) 신설 → 작성기 입력 → 로더 필터, 없으면 「전체 업종」(B1 — DB, 승인).
- 노출 한도 검사 1곳: `capacity-gate` 를 지면별 SSOT 최대값(`banner-placement-capacity-ssot.ts`)으로 일반화, 작성·승인·기간 수정·예약 전환 모두 캠페인 실제 지면으로 검사(B2). 초과 5건 종료(W6 — 승인).
- **배너 캐러셀 1개 (K11)**: 홈 상단·업종 상단이 같은 캐러셀 컴포넌트 — 최대 3장, 오른쪽→왼쪽 슬라이드 전환(transform, 모션 토큰), 자동 넘김은 화면 숨김·터치 중 정지, 동작 줄이기 시 전환 없음. 업종 수용량 1~3 이 장수를 결정(B3). 홈 중간은 현재 1장 지면 — 같은 컴포넌트, 수용량 정책값 사용(B4).
- 기간 PHT 함수 공용(B5), 순서 = 업종 단위 sort_order 1개(priority 삭제, B6), 당겨서 새로고침 반영(B7), 미리보기 라벨 = 앱(B8). 범위 밖 판정은 S1·S5 로 자동 해결(B9).

### 3-U. 빈 화면·CTA·슬라이드
- 빈 화면 SSOT = `MyStateView kind="empty"` + CTA 1종(「가게 둘러보기」 → `/stores` 업종 영역 실제 앵커). 배달 7곳 교체, `dark:`·pill·raw amber·14px 제거(U1~U6). 홈 빈 문구는 「이 주소로 배달 가능한 매장이 없어요 · 주소 변경」/비로그인 「등록된 매장이 없습니다」 분기(U2).
- 모션 토큰 1세트(시간·이징)를 `app/design-tokens.css` 에 두고 전환·시트·칩·히어로가 사용, `prefers-reduced-motion` 전역 처리(A2·A3). 히어로: 숨김·터치 중 정지 + 슬라이드 전환(A1). 레일: 공통 컴포넌트 1개 + snap(A4). 칩 슬라이드 해제 보장(A5). 상품 이미지 스와이프(A6).

### 3-P. 누수·누락·병목
- 홈 피드 fresh 캐시 재검증 최소 간격(P1), 배너 single-flight + 짧은 TTL 또는 home-feed 응답에 포함(P2·P3), home-feed 서버 Promise.all·정책 1회·상품 limit·매장 집합 캐시와 회원 거리 계산 분리(P4), browse prefetch 는 menus 만+동시 상한(P5).
- purge 목록에 대표메뉴·commerce meta·배달 설정 추가(P6), taxonomy·browse 스냅샷에 서버 세대값 비교(P7), 캐시 prune·Map 상한·장바구니 debounce·관찰 reset 수정(P8).

---

## 4. Owner 결정 (2026-10-29 확정) · 남은 승인

**확정:** K4 비로그인 = 로그인 유도 · K5 주소 없는 회원 = 주소 설정 배너 · K6 샘플 = 주소 무관 전부 노출 + 「샘플 매장」 배지 + 주문 차단, 나머지는 실제 매장과 같게 · K10 「더 많은 매장」 유지, 노출은 어드민 토글 · K11 배너 3장 우→좌 슬라이드. (이전 D1~D6 해소 — D1 은 현재 ON 유지, 어드민 토글 정상 동작이 기준)

**남은 승인 (DB·운영 데이터):**

| # | 항목 | 종류 |
|---|---|---|
| D7 | 배너 대상 업종 컬럼 · legacy_test 노출 금지 CHECK | 마이그레이션 |
| D8 | 맛업는식당 노출 해제 · 업종 상단 초과 5건 종료 · 잘못 저장된 선반 행 정리 · 식당 2차 6개 상속 · 샘플 운영 데이터(리뷰·할인·추천·프로모션) · 2차 칩 이미지 | 운영 데이터 |
| D9 | 매장 목록 수정 6건 운영 재실측 시험 저장 (규정 8 절차) | 운영 설정 |

## 5. 실행 순서·검증 (승인 후)

1. S1·S2·S5(노출 기준) → 2. H-a~H-g(홈) → 3. 3-C → 4. 3-B → 5. 3-U → 6. 3-P. 단계마다 단독 커밋·main 1회.
2. 각 단계 검증: 코드 PASS(typecheck·vitest·eslint) → Production SHA 확인 → **Owner 계정(저장 주소) 휴대폰 폭 화면 + 비로그인 375×812** 에서 항목별 캡처·API·DB 증거 → 표로 PASS/FAIL/NOT_PROVEN. 실기기 = Owner 지시 시.
3. 제거 확인: 삭제한 중복 함수·상수·분기가 저장소에 0건(grep 결과 첨부).
