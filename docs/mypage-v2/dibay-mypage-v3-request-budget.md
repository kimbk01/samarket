# 내정보 화면별 요청 수 기록표 (최종 설계 R7 · Part A §1.7)

- 기준: `docs/mypage-v2/dibay-mypage-v3-final-integrated-spec.md` 제3부 R7 · Part A §1.7(요청 예산) · Part D §3(데이터 SSOT).
- 측정 방법: **코드 판독**(화면 진입 시 실행되는 fetch·single-flight·캐시 경로 추적). 브라우저 실측(네트워크 탭)은 이 작업 환경에서 불가 → 런타임 수치는 **NOT_PROVEN**, Preview/Production 에서 1회 확인 대상.
- 표기: 「첫 진입」 = 캐시 없음, 첫 페인트 후 클라이언트 요청 수(RSC 문서 요청 제외). 「재진입(30초 내)」 = 같은 viewer 로 30초 안에 다시 들어올 때. **차단** = 화면이 스켈레톤으로 가려지는 요청, **배경** = 캐시로 먼저 그리고 조용히 재검증.
- StrictMode(개발) 이중 마운트는 single-flight 로 1요청에 합쳐진다. 합류 호출은 **파싱한 JSON** 을 공유해야 한다(Response 공유 시 두 번째 `res.json()` 실패) — R7 에서 위반 7곳 수정(아래 「R7 수정」).

## 1. 요청 수 표

| 화면 | 주 컴포넌트 | 첫 진입 요청 | 재진입(30초 내) | 재진입 캐시 | 예산(§1.7-3) 판정 |
|---|---|---|---|---|---|
| H0 홈 `/mypage` | `MyPageHomeDashboard` · `use-mypage-home-model` · `mypage-home-summary-client` | ≤4: 프로필(부트 캐시 없을 때만) · 주소 기본값(TTL 스냅샷) · `GET /api/me/mypage-summary` 1 · `/api/admin/access-check` 1 | 차단 0 · 배경 1(관리자 확인 — 권한 회수 즉시 반영 계약상 매 마운트 재확인) | summary 메모리+`sessionStorage` 10분(30초 내 재검증 생략), 주소 기본값 TTL | PASS |
| S01 프로필 편집 | `ProfileEditForm` | 4: 필수 주소 게이트(dedup) · 주소 목록(single-flight) · 프로필 fresh · 전화 인증 설정(single-flight) | 차단 4(편집 원본은 DB 최신 필수 — 의도) | 주소 목록 single-flight | 예산 초과(폼 원본 계약) — 유지, 보고 |
| S02 매너 배터리 `/mypage/trust` | `MypageTrustContent` | 1 `/api/me/profile?fresh=1` | 차단 0 · 배경 1 | viewer 메모리 스냅샷 | PASS (R7: single-flight 추가) |
| S03 계정 `/mypage/account` | `MyAccountContent` | 1 `/api/me/auth-providers` (프로필은 캐시 peek) | 연동 행만 1 | 프로필 캐시 peek | PASS (연동 로그인 캐시는 R6 S53 범위) |
| S05 전화 인증 | `MypageRequiredPhoneClient` · `PhoneVerificationRequestForm` | 2: 프로필 · 전화 인증(single-flight) | 2 | — | PASS (R7: 합류 JSON 공유로 오류 화면 결함 수정) |
| S06 주소 목록 | `AddressManagementClient` | 2: `/api/me/addresses`(single-flight) · 승인 매장 맵 | 1~2 | 목록 복원 훅 | PASS(주소 HARD LOCK — 변경 없음) |
| S10–S19 설정 항목 `section/settings/*` | `MyPageItemRouteClient` (`loadMypageServerShell`, R4) | 정적 항목 0 · 데이터 항목 ≤1(알림 = 설정 1 + 알림 메일 1 + 푸시 상태 1) | 동일 | — | PASS(정적 0) / 알림 3(행별 독립 상태) |
| S14 관심·차단·숨김 | `UserListContent` | 1 `/api/me/relations/{type}` | 1 | single-flight | PASS |
| S16 채팅 설정 | `ChatSettingsContent` | 1 `/api/me/trade-presence` | 1 | single-flight | PASS |
| S20 판매 내역 `/mypage/products` | `MyProductsView` | 3: `/api/my/posts?limit=20` · 홍보 주문 · 판매 거래 행 | 차단 0 · 배경 0(커서 캐시 30초) + 보조 2 | 커서 목록 메모리 5분 | 보조 1개 초과 — UI-6 HARD LOCK 범위라 R7 미변경, 보고 |
| S22 찜 | `FavoritesHubView` · `FavoriteProductsView` | 1 `/api/favorites/list?limit=20&counts=1` | 0 | 커서 목록 메모리 | PASS |
| S23 가격 제안 `/mypage/offers` | `MyOffersView` | 1(탭당) | 0 | 커서 목록 메모리, 받은 탭 재요청 없음 | PASS |
| S24 거래 후기 | `TradeReviewsManagementView` · `MyWrittenReviewsView` | 2: 본 탭 1 + 다른 탭 개수 1 | 0 | 커서 목록 메모리 | PASS(본 1 + 보조 1) |
| S25 최근 본 상품 | `RecentViewedList` | 1 `/api/me/recent-views` | 0 | 커서 목록 메모리 | PASS |
| S26 내가 쓴 글 | `MypageCommunityPostsList` | 2: 본 탭 1 + 다른 탭 개수 1 | 0 | 커서 목록 메모리 | PASS |
| S27 댓글·반응 | `CommunityActivityHubView` | 1(탭당) | 0 | 커서 목록 메모리 | PASS |
| S30 주문 내역 | `MyStoreOrdersView` | 1 `/api/me/store-orders`(dedup) + Realtime 구독 | 차단 0 · 배경 1 | 목록 페이지 캐시 | PASS |
| S31 주문 상세 | `MyStoreOrderDetailView` | 2: 상세 · 이벤트(dedup) | 차단 0(주문 시드 캐시) · 배경 2 | 상세 시드 캐시 | PASS(상세 계약) |
| S34 매장 문의 | `MyStoreInquiriesView` | 1 | 차단 0 · 배경 1 | 목록 페이지 캐시 | PASS |
| S40 포인트 | `points/page.tsx` · `fetchMePoints` | 1 `/api/me/points?filter=&limit=30` (충전 요청 = 같은 응답 `chargeRequests`) | 차단 0 · 배경 1 | `me-points-client` 메모리 5분 | PASS |
| S41 충전 신청 | `points/charge/page.tsx` | 1 `/api/me/point-plans` | 1 | single-flight(파싱 공유) | PASS |
| S42 소멸 예정 | `points/expiring/page.tsx` | 1(포인트 캐시 peek 있으면 차단 0) | 차단 0 · 배경 ≤1 | `peekLatestMePoints` | PASS |
| S43 홍보 이용 `points/promotions` | 페이지 + `useUserPointBalance` · `usePromotionOrderTargets` | 4: 잔액 `/api/me/points` · 홍보 주문 · 대상 글 `/api/my/posts` · 내 매장 | 4 | single-flight만 | 예산 초과 — 보고(잔액 전용 API 없음) |
| S44 쿠폰 · S45 상품권 | `CustomerCommerceHubPage`(배달 허브 공용) | 허브 계약 | 허브 계약 | 허브 캐시 | 배달 허브 범위 — R7 미변경 |
| S46 내 광고 `/mypage/ads` | `MyAdsPageClient` | 2: 게시글 광고 · 피드 광고 신청 | 2 | single-flight(파싱 공유) | PASS(본 1 + 보조 1) |
| S46 신청(포인트 홍보) `ads/apply` | `MyAdsApplyPageClient` | 3: 잔액 · 대상 글 · 내 매장 | 3 | single-flight | 보고 |
| S46 신청(피드 광고) `ads/feed-request` | 페이지 | 3: 잔액 · 광고 상품 · 대상 + 선택 시 내 글 | 3 | — | 보고 |
| S47 회원 혜택 `/mypage/benefits` | `benefits/page.tsx` | 1 `/api/me/benefits` | **차단 0 · 배경 0** | viewer 메모리 5분(30초 후 조용한 재검증) | PASS (R7 신규 캐시 — 이전: 매 진입 스켈레톤 + 1) |
| S50–S65 고객센터·약관 | R6 범위 | — | — | — | R6 보고 참조 |

## 2. R7 수정 (같은 데이터 중복 요청·합류 결함)

| 위치 | 결함 | 수정 |
|---|---|---|
| `lib/mypage/load-phone-verification-state.ts` + `PhoneVerificationRequestForm` · `ProfileEditForm` · `RequiredInfoFlowClient` | 같은 키 `me:phone-verification:get` 로 Response 를 공유하고 일부는 원본 `res.json()` 을 소비 → 합류한 두 번째 호출이 본문 읽기 실패(전화 인증 화면 「불러오지 못함」, 설정 누락) | `fetchPhoneVerificationJson()` 단일 경로 — 비행 안에서 1회 파싱, 4곳이 같은 함수 사용 |
| `components/my/settings/NativePushSettingsRow.tsx` | `me:devices:status:get` Response 공유 + `res.json()` → 재마운트 시 상태 `{ok:false}` | 비행 안에서 파싱·판정 |
| `components/mypage/tabs/CommunityTab.tsx` | `me:community-posts:limit=6` 동일 결함 → 빈 목록 | 비행 안에서 파싱 |
| `hooks/usePromotionOrderTargets.ts` (S43·S46 신청) | `me:promotion-targets` 에서 글 목록 Response 공유 → 두 번째 호출 대상 목록 비어 보임 | 글 목록 본문을 비행 안에서 파싱 |
| `components/offers/OfferStatusBuyer.tsx` · `useMyPriceOffersForProduct.ts` | `offers:mine:*` Response 공유 | 비행 안에서 파싱 |
| `components/mypage/trust/MypageTrustContent.tsx` | 같은 진입 중복 요청(single-flight 없음) | viewer 키 single-flight |
| `app/(main)/mypage/benefits/page.tsx` | 재진입마다 스켈레톤 + 요청 1(캐시 없음) | viewer 메모리 캐시 5분 + single-flight |

## 3. 남은 항목 (설계 범위 확인 후 미변경)

- S40 충전 목록 커서: Part C S40 은 「같은 응답 `chargeRequests` 사용, 20건 상한 — 더 보기 없음」으로 정의 → 커서 API 추가하지 않음.
- `hooks/useUserPointBalance.ts`: 홈 자산 행은 summary(A1)로 대체 확인(홈 사용처 0). 남은 사용처 = S43·S46 신청·고객센터 허브(R6)·상품권 상세·Philife 글쓰기.
- S20(3요청)·S43(4요청)·S46 신청(3요청)은 §1.7 T1/자산 예산(본 1 + 보조 ≤1) 초과 — 잔액 전용 경량 API 또는 대상 목록 통합이 필요해 API 계약 변경 사안. S20 은 마켓 UI-6 HARD LOCK 범위.
- 홈 관리자 확인(`/api/admin/access-check`)은 「권한 회수 즉시 반영」 계약으로 매 마운트 재확인 — 캐시하지 않음(의도).
