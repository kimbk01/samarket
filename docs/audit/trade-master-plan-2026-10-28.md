# 거래 전체 계획안 v2 (2026-10-28) — 단계별 전후 영향 포함 · 승인 대기

- **v1(같은 날, Owner 승인)을 대체한다.** v1 대로 1단계를 진행하다가 두 가지 잘못이 나왔다.
  - 받은 후기 API 만 닫아서, 운영의 「내 거래 › 후기」 탭이 오류 화면으로 남았다(전후 영향 누락).
  - 승인 밖에서 후기 제거를 시작했다(17개 파일, **되돌림 완료**, 운영 미반영).
- 작업 규정: `AGENTS.md` 「설계·구현 작업 규정 (Owner 2026-10-28)」 6개 조항.
  - 계약·대화 먼저.
  - Owner 가 지목한 화면 그대로 재현.
  - 승인 범위 고정.
  - 전후 영향 설계.
  - 사실만 보고.
  - 단계 끝 1회 보고.
- 근거:
  - 영향 조사 3건(코드 추적, 2026-10-28, HEAD `06d54e2b8`).
  - 그중 핵심은 직접 재확인 [코드✓]: 더보기 50개 멈춤, 칩 겹침 원인, 후기 메뉴 DB 행이 화면에 그려지지 않음.
  - 함께 보는 문서: `trade-improvement-design-2026-10-28-v3.md`(결함), `trade-market-filter-search-uiux-design-2026-10-28.md`(화면), `trade-end-to-end-scenario-audit-2026-10-28.md`(감사).

## 0. 거래의 정의 (Owner 확정, 변경 없음)
- **판매자:** 판매완료만 한다. 예약·구매자 지정·구매 확정·**되돌리기 없음** [O 107·108].
- **후기:** 없다. 데이터 `transaction_reviews` 는 보존한다 [O 107].
- **구매자:** 찜·신고 [O 36].
- **성과:** 조회수·찜·신고 [O 107].
- **목록:** 전부 표시, 조건은 순서만, 판매완료 맨 아래 [목록계약].
- **반경:** 10·20·40km·전체, 어드민 지정 [O 106].
- **찾기:** 물품 이름 필터 [O 89·91].
- **판매하기:** 헤더에 두지 않고 「판매」 탭에서 [O 105].

## 1. 지금 운영 상태 (사실)
- 1단계 P0(`edf6ad9f0`) 반영, 실기기 Samsung·태블릿 PASS.
- **깨진 화면 1개:** 「내 거래 › 후기」 탭이 오류 표시다. 받은 후기 API 가 410 이고, 이 탭의 첫 칸이 그 API 를 쓴다(`TradeReviewsManagementView.tsx:156-157,209`). → **A 단계를 가장 먼저** 해서 닫는다.
- **정정:** 마이페이지 메뉴 DB 행 `my_services(code='reviews')` 는 **화면에 그려지지 않는다.** `MyServiceGrid` 를 쓰는 곳이 없고, 서버가 `services: []` 를 넘긴다(`load-mypage-server.ts:159`) [코드✓]. 그래서 DB 변경은 필요 없다(앞서 「승인 필요」라고 한 것은 틀렸다).

---

## 2. 단계별 계획 — 각 단계는 끝났을 때 깨진 화면이 0이어야 한다

### A. 후기 전체 제거 (1단계 부작용 해소 포함) — DB 변경 없음
| 구분 | 내용 |
|---|---|
| 바꾸는 것 | **경로:** `/mypage/trade/reviews`·`/mypage/reviews`·`/my/reviews` → `/mypage/trade` 로 리다이렉트. `/philife/reviews` 에서 작성 후기 목록 제거. **탭·메뉴:** `TradeHubTopTabs` 후기 탭, 홈 「거래 이력」 시트 후기 탭(`HomeTradeHistorySheetContent`), 헤더 스택 패널(`TradeHistoryStackPanel`), 마이페이지(`TradeTab`·`MyPageItemScreen`·`mypage-nav`·`mypage-mobile-nav-registry`·`mypage-home-menu-config`·`managed-my-section-ctas-i18n`·`my-page-defaults`·`mypage-section-legacy-redirect`). **작성:** `TradeFlowBanner` 후기 버튼·시트, `TradeReviewWriteSheet`·`can-open-trade-review-sheet`·`trade-review-eligibility`. **보기:** 구매 내역 「후기 기록」 배지·「내 후기 보기」, 판매 내역 「구매자 후기 보기」(`PurchaseHistoryCard`·`SalesHistoryCard`·`SellerTradeRow`·`BuyerReviewReadSheet`). **API 닫기(410):** `written-reviews`·`buyer-review`·`seller-sees-buyer-review`·`submit-review` |
| 함께 처리 | 쓰는 곳이 없는 파일 정리: `MyTradeSection`·`HomeTradeReelsSideRail`·`MySectionList`·`ReviewForm` 의 후기 링크. 상단 제목 경로 규칙(`resolve-main-tier1.ts`·`mobile-top-tier1-rules.ts`)에서 후기 경로 제거 |
| 그대로 두는 것 | `transaction_reviews` 데이터, 어드민 후기 화면(저장된 데이터 열람), 매장 후기(다른 도메인). 신뢰 점수 표시(`resolveProfileTrustScore`)는 후기를 읽지 않아 바뀌지 않는다 |
| 바뀌는 테스트 | `marketplace-cut-d-member-review-ui`, `marketplace-cut-3-review-write-reconnect`, `marketplace-cut-4-mypage-trade-ia-cleanup`, `trade-review-eligibility`, `marketplace-ui-cut-2-surface-role-cleanup:51`, `written-reviews-error`, `r5-trade-list-routes:177-182`, `manner-battery-ssot:214`, `dibay-chrome-title-coverage`, `dibay-chrome-device-evidence-contract:57`, `slice5-activity-route-merge` → 「후기 없음」 계약으로 바꾼다 |
| 반만 하면 | 경로만 지우면 메뉴 8곳이 죽은 링크가 된다. 화면 파일만 지우면 이 화면을 넣은 3곳(TradeTab·이력 시트·스택 패널)에서 빌드가 깨진다. → 위 전부를 한 커밋으로 |
| 실기기 확인 | 내 거래 탭 줄에 「후기」 없음. 마이페이지 메뉴에 후기 없음. 거래 홈 이력 시트에 후기 없음. 옛 주소 `/mypage/trade/reviews` 를 열면 내 거래로 감. 구매·판매 내역 카드에 후기 표시 없음 |

### B. 판매완료만 (되돌리기·예약·구매자 지정·구매 확정 없음) — DB 변경 없음
| 구분 | 내용 |
|---|---|
| 바꾸는 것 | **서버:** `owner-status` 가 `listing: selling` 을 거절(판매완료 → 판매중 금지). `seller-listing-state` 는 판매완료에서 다른 상태로 못 바꾸게 막는다(지금은 `inquiry` 로 되돌릴 수 있음). `seller-complete`·`buyer-confirm`·`trade-status` 는 회원 경로에서 닫는다(410). **화면:** 내 물품 ⋮ 「판매중」·되돌리기 토스트(`MyProductActions`·`MyProductsView:213-219`), 상세 소유자 메뉴 「판매중」(`PostDetailView:884-906`·`PostDetailSellerMoreSheet`), 채팅방 줄은 판매완료 한 방향만(`CommunityMessengerTradeProcessSection:274-357`·`messenger-trade-action-strip`), 구매 내역의 구매 확정·문제 신고 버튼(`PurchaseHistoryCard:181-236`), 예전 채팅 화면의 판매중·문의중·예약중 메뉴와 거래 배너 단계(`ChatDetailView:975-1025,1732-1840`, `TradeFlowBanner`·`TradeSellerListingStepDiagram`) |
| 함께 처리 | **C-1:** 판매완료 글이라도 기존 채팅방이 있으면 상세 CTA 로 그 방에 들어간다(`PostDetailView:791,815`). **C-2:** 어드민 「판매완료 후 채팅 허용」을 상세가 읽는다(찜 화면은 이미 읽음). **C-3:** 채팅 시작 경로에 생성 횟수 제한·가입 완료 검사. **M-2:** 내 물품 ⋮ 에 상태별로 가능한 메뉴만, 거절 사유 그대로 안내. **M-3:** 상세 「물품 판매 취소」(=숨김) 메뉴 제거 |
| 그대로 두는 것 | 판매완료 시 각 채팅방 시스템 메시지·안 읽음·방송(`applySellerListingChangeSideEffectsServer`). 어드민 거래 되돌리기 화면(운영자 권한). 예약 기반 차단 함수는 예약 쓰기가 없어 항상 거짓 → 제거하지 않고 둔다(동작 영향 없음) |
| 바뀌는 테스트 | `messenger-trade-action-strip`(판매완료만), `marketplace-ui-cut-2-surface-role-cleanup:65-71`(배너의 seller-complete·buyer-confirm 요구), `trade-g7-listing-chat-entry-contract:19-28` |
| 반만 하면 | 버튼만 숨기면 되돌아갈 길이 3개 남는다: 서버 `selling`, 되돌리기 토스트, `seller-listing-state` 의 `inquiry`. → 셋 다 같은 커밋 |
| 데이터 사실 | 이미 `seller_marked_done` 인 방 2건은 구매 확정 버튼이 사라지고 상태만 남는다(데이터 그대로) |
| 실기기 확인 | 내 물품·상세·채팅방 세 곳에서 판매완료 → 되돌리기 메뉴 없음. 판매완료 글 상세에서 기존 문의 방으로 들어가기 |

### C. 목록 정확성 — DB 변경 없음(L-7 제외)
| 구분 | 내용 |
|---|---|
| L-1 | 캐시·첫 화면 시드 뒤 더보기 50개 멈춤 [코드✓]. 초기화 효과(`HomeProductList:511-522`)를 조건이 바뀔 때만 돌게 한다. 이어 읽기 세션에 커서도 저장한다(`trade-list-presentation-session.ts` — 지금은 페이지 번호만 저장해 이어 읽기가 순번 방식으로 바뀜). `PostListByCategory` 같은 구조도 같이 |
| L-2 | 홍보 글을 넣을 때 다음 페이지 기준을 **실제로 보여 준 마지막 일반 글**로 한다. 지금은 잘리기 전 50번째라 일반 글 최대 3개가 누락된다. 이를 위해 행마다 정렬 키를 유지한다(`attachTradeListSections` 가 지금은 버림). 1페이지 개수(50)는 그대로 |
| L-3 | 홍보 글 불러오기(`loadPostsByIdsForPromotion`)에 공개 자격 검사(숨김·삭제·관리자 숨김·거래 글) 추가 |
| L-5 | 당겨서 새로고침·새 글 확인 요청은 `cache: "no-store"`(`getPostsForHome.ts:552-558,627-633`) |
| T-1 | 태블릿·폰 공통: 목록 아래 여백이 `<ul>` 에만 있어 「더보기」 칸이 하단 탭 밑에 깔린다. 여백을 목록 묶음 맨 아래(더보기·예시 구역 포함)로 옮긴다. `HomeProductList`·`PostListByCategory` 둘 다 |
| 바뀌는 테스트 | 세션 모양 테스트 2개(`trade-list-presentation-*`), `promotion-feed-contract:142-157`(1페이지 개수 유지라 그대로 통과 예상, 커서 기준 단언 추가), 하단 여백 SSOT 테스트 2개 |
| 제외(결함 기록만) | **L-7 인기순 페이지 건너뜀:** 조회수가 바뀌는 값이라 안정 키가 필요하고 SQL 변경이 든다. 해법을 정하지 못해 이번 계획에서 뺀다(Owner 요청 항목 아님) |
| 실기기 확인 | 앱을 껐다 켠 직후(캐시 첫 화면)에도 더보기를 끝까지 → 182건, 중복 0. 태블릿 가로에서 「더보기」가 탭에 안 가림 |

### D. 위치 시트·반경 — 어드민 설정값 저장(앱 설정 묶음, 스키마 변경 없음)
| 구분 | 내용 |
|---|---|
| 바꾸는 것 | 위치 화면 3개(`/market/location`·`/search`·`/distance`)를 📍 시트 하나로 합친다. 반경 값을 **어드민 설정 하나**에서 읽는다. 어드민 「지역 정책」에 반경 목록·기본값 칸을 둔다. 저장 위치는 기존 `admin_settings` 행 `app_settings_bundle_v1` 안이라 테이블 변경이 없다. 초깃값은 `10·20·40·전체` |
| 함께 처리 | 반경이 정의된 곳 전부를 한 값으로 바꾼다: `trade-browse-radius.ts`(32/64/96/160·1~500), `MarketFilterSheet`(5/10/30/64), 거리 화면. 옛 주소(`radius=5/32/64…`)는 계속 열려야 한다 → 가장 가까운 목록 값으로 읽는다. 「주변」 64km 는 목록계약 §2 값 그대로 둔다(반경 값과 별개). 3개 화면으로 가는 링크 6곳과 경로 규칙 7곳을 정리하고, 옛 경로는 시트로 리다이렉트한다 |
| 서버·화면 값 일치 | 앱은 설정을 처음 그릴 때 기본값을 쓰고 나중에 받는다(`getAppSettings`, 비반응). 반경 목록은 **서버가 목록과 함께 내려 주는 값**으로 그려 화면과 서버가 같은 값을 쓰게 한다 |
| 그대로 두는 것 | 비로그인 위치 잠금(`location=all`), 대표 주소 → 시, 거리 계산(시 중심점), 「반경은 순서만」 |
| 바뀌는 테스트 | `trade-browse-radius`, `trade-g8-search-filter-contract:30-32`, `marketplace-browse-wiring-contract:124-150`, `marketplace-ui-2-more-browse:24-29`, `trade-browse-location-tiers-contract`, `trade-browse-location-cta-ux`, e2e `trade-location-phase4-runtime:97` |
| 계약 개정 | 목록계약 §2·§3⑤ 의 반경 문구, 브라우즈 단일계약의 「Pasay + 5km」 예시 → 10·20·40 으로 |
| 함께(같은 단계): A-1·W-1 | 도시를 확정 못 한 주소는 저장 전에 막고 안내한다(`AddressPlatformDetailClient.save`·`validatePlacesAddressPayload` 에 시 필수). 파서 테스트(`ph-google-place-parse`)는 그대로 둔다(빈 도시 판정은 맞음). 글쓰기 안내는 새 문구 키(기존 키는 일자리·환전·서비스도 씀) |
| 실기기 확인 | 📍 → 내 위치·다른 지역·나의 지역·반경 10/20/40/전체 적용. 옛 `radius=5` 주소 열기. 도시 없는 주소 저장 시도 → 안내 |

### E. 상단 구조·판매 탭 — DB 변경 없음
| 구분 | 내용 |
|---|---|
| 바꾸는 것 | 거래 헤더에서 「판매하기」 제거(`RegionBarMainHubTier1:130-145`). 탭 `판매 · 둘러보기 · 지역 · 카테고리 | 📍` 추가(`TradePrimaryTabs`; 지금은 「전체」 + 어드민 주제 탭). 「판매」 = 판매 허브(`MarketplaceSellHubPage`). 허브에 칩 「알림」과 **성과(조회수·찜·신고)** 추가 |
| 성과 데이터 | `/api/my/posts` 무인자 응답은 「불변」 계약이라 건드리지 않고, 판매 허브 전용 요약 API 를 새로 둔다: 내 글의 `view_count` 합, `favorite_count` 합, `reports(target_type='product')` 건수 |
| 함께 처리 | 판매로 가는 다른 입구는 유지한다(빈 목록 「판매하기」, 내 물품 「판매하기」, 글쓰기 시트). 판매 허브 경로 규칙(`marketplace-seller-hub-slide`, `resolve-main-tier1:421-435`)은 탭에서 들어가는 방식에 맞춘다 |
| 바뀌는 테스트 | `marketplace-ui-1-home-chrome:24-64`(헤더에 판매 CTA 요구 → 「없음」으로), `dibay-chrome-device-evidence-contract:20`, `dibay-global-header-tabs-ssot:104-112`, `marketplace-browse-wiring-contract:218`, `trade-header-location-hint` |
| 계약 개정 | UI-1 잠금 문서의 헤더 판매 CTA 항목 → [O 105] 로 개정 |
| 실기기 확인 | 헤더에 「판매하기」 없음. 탭 4개, 「지역」 = 가까운 순, 「카테고리」 = 주제 6개. 판매 탭 성과 숫자를 DB 값과 대조 |

### F. 필터 — DB 변경 없음
| 구분 | 내용 |
|---|---|
| 바꾸는 것 | 필터 시트에서 지역·거리 칸을 뺀다(📍 로 일원화). **적용할 때 지금 위치 값을 그대로 넘겨야 한다** — 안 그러면 적용하는 순간 위치가 초기화된다(`marketplace-browse-state.ts:289-297`). FT-1·L-6: 판매 의도 자동 선택 제거. 화면(`CompositionAttributeFilterSelects:39-56`)과 서버 기본값(`load-composition-for-filter.ts:79`, `PostListByCategory:172-175`, `SearchView:120`)을 **동시에** 바꾸고 「전체」 선택지를 넣는다. FT-2: 모델 목록을 고른 제조사 것만(`USED_CAR_BRANDS`) |
| 반만 하면 | 화면만 또는 서버만 바꾸면 고른 값과 서버 순서가 어긋나고 캐시 키도 달라진다 |
| 바뀌는 테스트 | `sell-intent-list-ssot:18-51`, `marketplace-browse-wiring-contract:124-150`, `market-filter-sheet-active-filters`, `marketplace-cut-i-category-matrix` |
| 실기기 확인 | 필터 적용 후 📍 위치 유지. 중고차 「전체」 기본. Toyota 선택 → 모델에 Toyota 모델만 |

### G. 찾기 — 운영 DB 마이그레이션 승인 필요
| 구분 | 내용 |
|---|---|
| 바꾸는 것 | 찾기 화면에 인기 카테고리(주제 6개). `trade_list_page` 찾기 구간에 「비슷한 물품」(단어 하나 이상, 맞은 단어 수 순) 추가 — 새 마이그레이션 |
| 함께 처리 | 새 구간 키는 반드시 `q:` 로 시작한다(`q:related`). 그래야 전역 검색이 「일치」로 세지 않는다(`isTradeListSearchMatchSection`). 안내 줄 문구(`TradeListSectionDivider`). 커서 길이(9)는 유지하고 첫 칸 숫자만 늘린다. 클라이언트 캐시 키 버전(`v10` → `v11`)을 올려 옛 커서를 버린다 |
| 바뀌는 테스트 | `list-contract-order:242-309`, `list-section-divider`, `trade-search-paths:54-59`, `trade-list-page-params` |
| 계약 개정 | 목록계약 §3① 찾기 구간 정의 |
| 실기기 확인 | `iphone 17 pro`·`macbook air`·`zzzz` 입력창 직접 입력 → 구간·안내 줄 |

### H. 찜·신고 — 운영 DB 마이그레이션 승인 필요(신고 유니크)
| 구분 | 내용 |
|---|---|
| F-1 | 하트 토글 응답의 `favoriteCount` 로 목록 두 곳의 글 수를 갱신한다(새 객체로 — `HomeProductList:133` 비교). 토글 API 는 이미 수를 돌려준다 |
| F-2 | 하트 4개 구현은 모두 `toggleFavorite` 한 곳을 쓴다. 상세 하트에만 처리 중 잠금을 넣는다. 구현 통합은 하지 않는다(테스트가 각 위치를 고정, 실제 충돌은 상세 연타뿐) |
| F-3 | 토글 API 의 횟수 제한 적용(`route.ts:70`), 숨김·없는 글 찜 거절 |
| RP-1 | 거래 글 신고 부분 유니크 인덱스(`target_type='product'`). **먼저 운영 중복 행을 조회해 정리 방법을 승인받는다.** 중복이면 200 `already`(409 금지 테스트 계약) |
| RP-2 | 「신고한 글」을 서버에서 읽는다(`reports` 테이블로 충분, 새 테이블 없음, 읽기 API 1개). 목록 두 곳 + 찾기·찜에 적용한다. 신고 버튼은 추가하지 않는다(테스트 계약) |
| 실기기 확인 | 목록에서 찜 → 「관심 N」 즉시 변경. 같은 글 신고 두 번. 다른 기기에서 신고한 글 가림 |

### I. 글쓰기·수정 — DB 변경 없음
| 구분 | 내용 |
|---|---|
| W-2 | 사진 필수 주제(중고거래·중고차·부동산·렌터카)에 화면 검사 + 서버 검사(`create`·`owner-trade-update`). 일자리·환전은 제외(구성상 사진 칸 없음) |
| E-1 | 수정 모드에서 위치가 고정이면 위치 검사를 건너뛰고, 대표 주소로 덮어쓰지 않는다(`TradeDefaultLocationBlock` `editPostId`). 주소 잠금 테스트 조항은 유지한다 |
| P-5 | 글쓰기 통일(W1~W7)은 범위가 커서 별도 설계 승인 후 진행한다(이번 단계는 W-2·E-1 만) |
| 실기기 확인 | 사진 0장 등록 막힘. 대표 주소가 없는 판매자가 판매중 글 수정·저장 |

### J. 홍보·상세·내 매물 칩 — 운영 DB 함수 변경 승인 필요(PR-2)
| 구분 | 내용 |
|---|---|
| H-2 (Owner 지적) | 「내 매물」 칩 줄에서 「포인트 홍보」가 「숨김」을 가린다 [코드✓]. 원인: 「포인트 홍보」가 스크롤 칸 밖의 줄어들지 않는 버튼이라, 칩 4개가 든 칸이 좁아져 끝이 잘림. 공용 칸 CSS 를 바꾸면 같은 칸을 쓰는 8개 화면이 다 바뀌므로, **`MyProductFilter` 안에서만** 「포인트 홍보」를 스크롤 칸의 마지막 칩으로 옮긴다. `promoted=1` 주소 계약은 유지 |
| PR-1 | 모르는 상품 id 결제 거절. 단, `MyAdsApplyPageClient` 가 상품 id 없이 보내는지 먼저 확인하고 그 경로를 맞춘다 |
| PR-2 | 구매 RPC 가 `seller_listing_state` 도 본다(같은 서명으로 `CREATE OR REPLACE`, 권한 재부여) |
| D-2 | 가격 없는 글 상세 가격 줄에 「가격 문의」 |
| 실기기 확인 | 384px 폰에서 칩 5개 모두 보임·가로 스크롤. 판매완료 글 홍보 구매 불가 |

---

## 3. 순서와 규칙
| 순서 | 단계 | 운영 DB | 상태 |
|---|---|---|---|
| 1 | P0 보안 | — | 완료 `edf6ad9f0` |
| 2 | A 후기 전체 제거 | 없음 | 대기 |
| 3 | B 판매완료만 | 없음 | 대기 |
| 4 | C 목록 정확성 | 없음 | 대기 |
| 5 | J 중 H-2 칩 겹침 · D-2 | 없음 | 대기 |
| 6 | E 상단 구조·판매 탭 | 없음 | 대기 |
| 7 | D 위치 시트·반경·주소 | 앱 설정값 저장만 | 대기 |
| 8 | F 필터 | 없음 | 대기 |
| 9 | G 찾기 | 마이그레이션 승인 | 대기 |
| 10 | H 찜·신고 | 인덱스 승인(중복 정리 포함) | 대기 |
| 11 | I 글쓰기·수정 | 없음 | 대기 |
| 12 | J 중 PR-1·PR-2 | 함수 변경 승인 | 대기 |

- **단계 진행 규칙:**
  1. 실기기 재현.
  2. 그 단계 전부를 한 커밋으로 → 로컬 검증 → main → Production 확인.
  3. 기기 3대 확인.
  4. 이 표 갱신.
  5. 단계 끝 1회 보고.
- 단계가 끝났을 때 깨진 화면이 있으면 다음 단계로 가지 않는다.
- 계획에 없는 결함은 고치지 않고 이 문서 §4 에 기록한다.
- 계약 문서 개정이 있는 단계(D·E·G)는 같은 커밋에 계약 문서를 고친다.

## 4. 계획 밖 결함 기록 (고치지 않음)
- L-7 인기순 페이지 건너뜀(안정 키·SQL 필요).
- 예약 기반 차단 함수 잔존(동작 영향 없음).
- 공용 칩 줄 CSS(`dibay-chrome-ssot.css`)가 레이어 밖이라 `px-0` 이 안 먹음(8개 화면 공통, 지금 보이는 결함 없음).


---

## 5. 단계별 기록

### 1단계 P0 보안 — 2026-10-28 PHT
- 커밋 `edf6ad9f0` · Production `dpl_6C12GuNj2WbBrRaJY7jpeWHoZvtC` READY.
- 로컬: 타입 검사 PASS · 관련 vitest 12파일 219건 PASS · eslint 오류 0.
- 수정 전 재현(Samsung, 계정 `9259ab7d…`):
  - 관리자 숨김 글 `2561385b…`(남의 글) 상세가 열리고 「메시지 보내기」까지 보였다.
  - 「내 물품 › 숨김」에 삭제한 글 3건이 「숨김」으로 보였다.
- 수정 후:

| 확인 | Samsung | 태블릿 | iPhone |
|---|---|---|---|
| 관리자 숨김(남의 글) 상세 → 404 | PASS | PASS(크롬) | NOT_PROVEN |
| 내 숨김 글 상세 → 작성자는 보임 | PASS | — | NOT_PROVEN |
| 공개 글 상세 → 보임 | PASS | — | NOT_PROVEN |
| 내 물품 숨김: 삭제 글 0 · 숨김 글 5 | PASS | — | NOT_PROVEN |
| 받은 후기 API → 410 | PASS | — | NOT_PROVEN |

- 남은 영향: 3단계에서 후기 화면을 빼기 전까지 「내 거래 › 후기 › 받은 후기」 칸은 목록 오류 표시가 난다(받은 후기 API 닫힘).
- 재현 못 함:
  - H-1 익명 후기 노출: Samsung 계정의 받은 후기 6건에 익명 부정 후기가 없다. 코드·DB(2건)로만 확인했다.
  - M-1 「다시 보이기」 버튼 경로: 삭제 글이 목록에서 빠져 버튼이 보이지 않는다. 서버 거절은 테스트로만 확인했다.
