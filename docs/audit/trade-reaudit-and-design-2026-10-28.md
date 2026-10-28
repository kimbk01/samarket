# 거래 재감사·설계안 (2026-10-28) — Owner 승인 대기

- 작업 트리 `samarket-wt-trade`, 기준 `origin/main` `c3ccec49a`. 이 문서 작성 중 코드·DB·배포 변경은 **0건**이다.
- 감사 수단: 코드, 운영 DB 읽기 전용(`ckdosyydvgzqwpbwuhon`), Owner 대화 원문, git 이력.
  - 실기기: Samsung 에서 X-3 만 재현했다. 그 뒤 Owner 지시(「코드만 확인」)에 따라 기기를 쓰지 않았다.
- 진행 방식 (Owner 지시):
  1. 이 설계안
  2. Owner 승인
  3. 승인 범위 **전체 구현**
  4. 로컬 검사 1회
  5. main 반영·Production 1회
  6. 실기기 시나리오 확인
  7. 실패를 모아 보완 1회 → 같은 시나리오로 재확인
- 단계마다 배포하지 않는다. 보고는 끝에 1회.
- 승인된 계획안 v2(`trade-master-plan-2026-10-28.md`)를 바꾸지 않는다. 이 문서는 v2 항목마다 「지금 코드에서 정확히 무엇이 틀렸는지」를 근거와 함께 확정한 것이다. v2 와 다른 점은 §6 에 모았다.

---

## 1. Owner 가 원하는 것 — 원문 근거

시각은 PHT 다. 원문 파일은 `f181421a-….jsonl` 이다.

| 항목 | 원하는 것 | 원문 |
|---|---|---|
| 기준 | Facebook Marketplace 구조를 DIBAY 에 적용. UI·UX·CTA·SSOT 기기별 이탈 없음 | 10-27 16:38 「처음 부터 ui ux cta ssot…」, 10-28 02:21 「마켓 플레스 형식의…」 |
| 판매자 | 판매중·판매완료만 | 10-27 18:25 「단지 판매자의 판매중 판매 완료 부분만」 |
| 판매자 | 되돌리기 없음 | 10-28 02:47 「되돌리기는 없애고(판매완료만)」 |
| 후기 | 없음 | 10-28 02:43 「후기 부분은 없고, 판매자는 판매 완료만」 |
| 구매자 | 신고(중요)·찜 | 10-27 18:25 「구매자의 신고 부분이 중요한 부분이고 찜」 |
| 성과 | 신고·찜·조회수 | 10-28 02:43 「성과 부분은 신고 찜의 조회수」 |
| 목록 | 전부 나온다. 조건은 순서만. 주소 회원은 지정 주소 우선, 미지정 회원은 최신순 | 10-27 20:37, 21:10, 21:19, 21:34 |
| 물품 조건 | 해당 물품 → 유사 물품 → 전체 | 10-27 21:10 |
| 판매완료 | 숨기지 않고 **하단**, 얼마에 거래됐는지 본다 | 10-28 01:59 「판매 완료는 숨김이 아니라 하단으로 내리고…」 |
| 반경 | 계약값, **어드민 지정**, 10·20·40km | 10-28 01:59 「어드민에서 지정」, 10-28 02:37 「10km 20km 40km 순」 |
| 찾기 | 거래 전용 입력, 거래만. 같은 → 유사 → 나머지(필터 개념). 다른 도메인 돋보기는 그대로 | 10-27 22:37, 10-28 01:08, 01:22 |
| 필터 | 주제 피드(6개)별 세부. 근거 없는 칸(물품 상태·액세서리) 금지 | 10-28 01:59, 02:37 |
| 판매하기 | 헤더에 두지 않는다(Marketplace 형태) | 10-28 02:32 「판매 하기부분을 넣으면 안되는 부분」 |
| 홍보 | 목록 중간 광고 배너 + 판매자 상위 노출 | 10-28 01:22 |
| 샘플 | 초기라 샘플로 화면을 채움, 어드민에서 적용 | 10-27 11:23 원지시, 18:25 |
| 배지 | 주제 배지 아이콘 없이 색만 | 10-27 18:39 |
| 채팅 시스템 메시지 | 문장·날짜 행 구분, 상태 강조 | 10-27 17:05 |

---

## 2. 계약 — 10-27 거래 수정 전과 지금

기준 = 10-27 거래 첫 수정(`75282fd2e` G1) 직전 `185574bce`. 거래 계약 문서 중 바뀐 것은 아래 2개다. 나머지 계약(guest 위치 잠금, UI-3~6 잠금, 구성 SSOT, 홍보 2종, 경량 §9, 거래 채팅 프로세스)은 **변경 없음**이다.

### 2-1. `docs/dibay-marketplace-list-ssot-target.md`

| 항목 | 10-27 전 (Owner 08-20 확정, 10-16 개정) | 지금 (Owner 10-27 확정 A·B·C·D, `9871070e8`·`f3fd77109`) | Owner 요구와 대조 |
|---|---|---|---|
| 카테고리 선택 | **M-HARD**: 고른 카테고리만(벽) | 고른 것 → 유사 → 나머지 전체 | 일치(10-27 21:10) |
| 지역 | L-SOFT: 내 시 → 주변 64km → 전국 | 내 동네 → 내 시 → 주변 64km → 전국. 주소 없음 = 전국 최신 | 일치 |
| 반경 숫자 | **반경 밖 제외(벽)** | 반경 안 → 주변 → 그 외(전부 표시) | 일치 |
| 검색 | T1~T5, 같은 ROOT 밖 제외(T5-B) | 일치 → 같은 주제 → 나머지 전체 | **부분 불일치**: Owner 는 「같은 → **유사** → 나머지」. 지금 「유사」 구간이 단어 유사가 아니라 「같은 주제」뿐이다 → G 단계(DB 승인) |
| 판매 의도 규칙(CUT B) | 적용(중고차 「삽니다」 등 제외) | 적용 안 함(13건도 표시) | Owner 10-27 22:56 새 설계안 승인에 포함 |
| 판매완료 | 규정 없음 | 순서 ④ 「거래 상태」: 판매중 → 판매완료 | **확인 필요(§8 Q1)**: 조건(검색어·물품·옵션·가격) 구간마다 그 안의 아래로 간다. 조건이 없으면 전체 맨 아래 |
| 반경 값 | 문서에 값 없음(코드 5/10/30/64, 32/64/96/160) | 문서에 값 없음 | **불일치**: Owner 10·20·40·전체, 어드민 지정 → D 단계에서 문서에 명시 |

### 2-2. `.cursor/rules/dibay-marketplace-browse-single-contract.mdc`
- §1·§2(반경 벽, 검색 relatedOut)를 폐기했다. 순서 계약은 2-1 문서로 위임했다.
- 「Pasay + 5km」 예시가 남아 있다 → D 단계에서 10·20·40 으로 개정한다.

### 2-3. 계약 문서가 없는 항목
- UI-1 잠금 문서는 저장소에 **없다**. `docs/` 에는 ui-3~6 만 있다.
- 헤더 판매 CTA 를 고정하는 것은 테스트 `lib/trade/__tests__/marketplace-ui-1-home-chrome.test.ts:37-39` 뿐이다.
- E 단계는 이 테스트를 「헤더 판매 CTA 없음」으로 바꾸고, Owner 결정(10-28 02:32)을 목록 계약 §5 에 적는다.

---

## 3. 운영 DB 사실 (읽기 전용 조회, 2026-10-28)

| 항목 | 값 |
|---|---|
| 공개 거래 글 | 182 (판매완료 65) |
| 관리자 숨김 거래 글 | 20 |
| 가격 없는 글(나눔 제외, 숨김 제외) | 13 |
| 주제 | 6개: 중고거래 111 · 중고차 31 · 부동산 21 · 환전거래 9 · 일자리 10 · 렌터카 0 |
| 하위 카테고리 | **0개** → 순서 ②의 「고른 하위 → 같은 상위」 구간은 지금 데이터로 생기지 않는다 |
| 주제 배지 색 `categories.badge_color` | **6개 모두 null** → 모든 주제가 같은 색으로 보인다 |
| 예약·문의중 글 | 0 |
| `seller_marked_done` 방 | 2 |
| 판매중인데 구매자 값이 남은 글 | 1 |
| `seller_listing_state=completed` 인데 `status≠sold` | 2 |
| 거래 글 신고 | 4건, 같은 사람·같은 글 중복 **0쌍** → RP-1 인덱스는 정리 없이 만들 수 있다 |
| 샘플 테이블 `trade_showcase_items` | 0행 |
| `admin_settings` `app_settings_bundle_v1` 행 | **없음** → 앱은 기본값을 쓴다(`allowChatAfterSold=false`, `homeRadiusKm=5` 미사용) |

---

## 4. 지금 운영에서 깨진 것 — 먼저 고친다

| # | 결함 | 확정 원인 (근거) | 수정 |
|---|---|---|---|
| X-1 | main CI 실패 | 후기 화면 파일 삭제 후 `scripts/verify-samarket-thumbnail-contract.cjs:89-90` 이 그 파일을 읽음 | 두 줄 삭제(작업 트리에 이미 있음) |
| X-2 | `c3a1d32ac` CI 실패 | 테스트는 통과. vitest 작업자 시간 초과(`onTaskUpdate`) | 코드 결함 아님. 다음 푸시 CI 결과로 판단하고, 재발하면 보고만 한다 |
| X-3 | `/mypage/trade/reviews` 직접 열기 → 「Application error」(React #310). 「판매 내역」 화면 오류도 같은 원인 | **Samsung 재현.** 깨지는 프레임은 Next App Router `Router`(`node_modules/next/dist/client/components/use-action-queue.js:93` 조건부 `use()`). 우리 컴포넌트가 아니다. 서버 `redirect()` 3연쇄(`reviews → /mypage/trade → /mypage/trade/sales → /mypage/products`)가 `app/(main)/mypage/loading.tsx` 스트리밍 뒤 클라이언트 전환으로 처리되며 발생 | 선례 `39c836258` 과 같이 `next.config.js` HTTP 307 로 **최종 목적지 한 번에**: `/mypage/trade`·`/mypage/trade/sales`·`/mypage/trade/reviews`·`/mypage/sales`·`/mypage/reviews`·`/my/reviews` → `/mypage/products`. 해당 page.tsx 폴백도 `/mypage/products` 로 한 번만 보낸다 |

---

## 5. 단계별 재감사 결과와 설계

판정 표기:
- 「고침」 = 계획대로 고치면 됨
- 「다름」 = 계획과 다름(근거 있음)
- 「됨」 = 이미 됨

### B. 판매완료만 — DB 변경 없음

| 대상 | 지금 코드 (근거) | 판정 | 수정 |
|---|---|---|---|
| 서버 되돌리기 | `app/api/posts/[postId]/owner-status/route.ts:54-57` `listing: selling` 허용 → `inquiry`/`active` 로 되돌림 | 고침 | `selling` 은 400(`sold_is_final`). `sold` 만 처리. 이미 판매완료면 그대로 성공(부작용 재발행 없음) |
| `seller-listing-state` 판매완료 이후 변경 | `lib/trade/seller-listing-chat-transitions.ts` `canSellerListingTransition` 에서 `from === "completed"` 이면 false | **됨** | 없음 |
| `seller-listing-state` 예약 | 같은 route `ALLOWED` 에 `reserved` 있음. `reservedBuyerId` 와 함께 예약 저장 가능 | **다름**: v2 는 「예약 쓰기 없음」을 전제로 함 | 예약 요청 400(`reserved_not_supported`). Owner 정의 「예약 없음」 |
| 회원 경로 닫기 | `seller-complete`·`buyer-confirm`·`chat/rooms/[roomId]/trade-status` 살아 있음 | 고침 | 410(`trade_sold_only`). 기존 데이터·어드민 경로(`/api/admin/trade-flow/*`)는 그대로 |
| 내 물품 ⋮ | `components/mypage/products/MyProductActions.tsx:73-80` 판매완료 글에 「판매중으로」. `MyProductsView.tsx:213-219` 되돌리기 토스트 | 고침 | 판매중 글에만 「판매완료」. 토스트 되돌리기 삭제. 거절 시 서버 사유 표시(M-2) |
| 상세 소유자 메뉴 | `components/post/PostDetailSellerMoreSheet.tsx` `soldToggle` 양방향, 「물품 판매 취소」(=숨김) 버튼 | 고침 | 판매중일 때만 「판매완료」. 「물품 판매 취소」 제거(M-3) |
| **메신저 거래방 줄**(실제로 쓰는 거래방) | `components/community-messenger/CommunityMessengerTradeProcessSection.tsx:274-357` 판매완료면 「판매중으로」 버튼 | 고침 | 판매중일 때만 「판매완료」 버튼. 판매완료면 상태만 표시. **메신저 파일 → 별도 커밋** |
| 구매 내역 구매 확정·문제 신고 | `components/mypage/purchases/PurchaseHistoryCard.tsx` 에 버튼 있음 | **다름**: 이 컴포넌트를 import 하는 곳이 **없다**(화면에 그려지지 않음) | 화면 영향 없음. 지시서(10-27 11:49)의 「운영 영향 없는 사문 코드 정리 제외」에 따라 수정하지 않고 기록만 한다 |
| 예전 채팅 화면 메뉴·거래 배너 단계 | `components/chats/ChatDetailView.tsx:1798-1840`(판매중·문의중·예약중·거래완료), `TradeFlowBanner`·`TradeSellerListingStepDiagram` | **다름**: `app/(main)/chats/[roomId]/page.tsx:75-79` 가 거래 방을 항상 메신저로 redirect 한다. 메신저 거래방은 `variant="actionStrip"` 만 쓰고 `TradeFlowBanner` 를 그리지 않는다 | 화면 영향 없음 → 수정하지 않고 기록. 서버 경로는 위 410·400 으로 막힌다 |
| C-1 판매완료 글 기존 방 | `PostDetailView.tsx:791,816` `chatBlockedByCompleted` 가 기존 방 확인보다 먼저 막음 | 고침 | 기존 방이 있으면 들어간다. 서버 `item-trade-chat-start-core.ts:296` 은 이미 기존 방을 이어 준다 |
| C-2 어드민 「판매 후 채팅 허용」 | 상세 CTA 차단(`:791`)이 `allowChatAfterSold` 를 안 읽음. 미리 불러오기(`:1011`)만 읽음 | 고침 | 차단 조건에 포함. 서버(`item-trade-chat-start-core.ts:321-326`)와 같은 기준 |
| C-3 채팅 시작 제한 | `create-room` 만 가입 완료 검사·생성 제한 있음. `entry/resolve`·`item/start` 는 없음(공용 코어 `runItemTradeChatStartCore`) | 고침 | 공용 코어의 **새 방 생성 직전**에 `requireSignupCompleteForUser` + 새 방 생성 횟수 제한(분당 25, 새 키). 기존 방 재진입·미리 불러오기는 세지 않는다 |
| 계약 문서 | `docs/trade-chat-buyer-seller-process.md:13-70` 예약·구매자 확인·후기·trust 표 | 고침 | 같은 커밋에서 「판매중 → 판매완료만, 예약·구매 확정·후기 없음」으로 개정 |

- 바뀌는 테스트(v2 그대로): `messenger-trade-action-strip`, `marketplace-ui-cut-2-surface-role-cleanup:65-71`, `trade-g7-listing-chat-entry-contract:19-28`, `marketplace-cut-d-member-review-ui:49-75`(410 본문으로 알림 블록 없음), `manner-battery-ssot:208-221`, `trade-notification-deep-link-namespace-root-fix:23-24`, `member-p0-mutation-classification.csv`(3행 유지, 410 도 회원 mutation 분류 그대로).
- 데이터: `seller_marked_done` 방 2건은 구매 확정 버튼이 화면에 없으므로 상태만 남는다.

### C. 목록 정확성 — DB 변경 없음

| 항목 | 지금 코드 (근거) | 판정 | 수정 |
|---|---|---|---|
| L-1 더보기 50개 멈춤 | `components/home/HomeProductList.tsx:511-523` passive effect 가 같은 커밋의 layout effect(캐시 시드 `:599-626`) 뒤에 실행된다. 그래서 `serverNextCursorRef=null`, `setServerHasMore(false)` 로 지운다. 세션(`lib/trade/marketplace/trade-list-presentation-session.ts:35-48`)은 커서 없이 `serverPage` 만 저장한다 | 고침 | passive effect 삭제(초기화는 layout effect 한 곳). 세션에 `serverNextCursor` 저장·복원. `PostListByCategory.tsx:593·703-714` 도 같이 |
| L-2 홍보 뒤 커서 | `lib/trade/marketplace/list-contract/trade-list-page.server.ts:142-176` 다음 커서 = 순위 50번째 행. 1페이지 홍보 투영(`lib/promotion/feed-promotion-projection.ts:116-169`)이 일반 글 뒤쪽을 자른다 → 잘린 글이 다음 페이지에도 없음 | 고침 | 투영 결과에서 「보여 준 마지막 일반 글」의 `sort_key` 로 커서를 다시 정한다. 잘린 행이 있으면 `hasMore=true`. `home-posts-route-core.ts` 두 경로(:263-310, :849-863). 1페이지 50개 유지 |
| L-3 홍보 글 자격 | `feed-promotion-projection.ts:171-208` 이 `status`·`seller_listing_state` 만 본다. `moderation_state`·`owner_state`·`is_deleted`·거래 글 여부 검사 없음 | 고침 | 일반 목록 SQL(`20270705120000_trade_list_page.sql:183-187`)과 같은 공개 자격 검사 추가 |
| L-5 새로고침 캐시 | `lib/posts/getPostsForHome.ts:552-558,627-633` fetch 에 `cache` 옵션 없음. 서버 응답 `private, max-age=15` | 고침 | `forceFreshRankedWindow` 요청은 `cache: "no-store"`. 당겨서 새로고침·「새 매물 N개」 적용은 이 플래그로 보낸다 |
| T-1 더보기 가림 | 하단 탭 여백 `MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS` 가 `<ul>`(`TRADE_FEED_LIST_WRAP_CLASS`, `lib/philife/philife-flat-ui-classes.ts:80`)에만 있다. `TradeListLoadMoreFooter`·`TradeShowcaseSection` 은 그 밖 | 고침 | 여백을 목록 묶음 맨 아래 래퍼로 옮긴다(`HomeProductList`·`PostListByCategory` 둘 다). 거래 목록 전용 상수만 바꾼다 |
| L-7 인기순 페이지 건너뜀 | v2 에서 제외 | — | 기록만 |

- 바뀌는 테스트: `trade-list-presentation-session`, `trade-list-presentation-retain-final-contracts`, `promotion-feed-contract`(커서 단언 추가), 커서 재계산 단위 테스트 신규.

### J 일부. H-2 칩 겹침 · D-2 가격 문의 — DB 변경 없음

| 항목 | 지금 코드 | 판정 | 수정 |
|---|---|---|---|
| H-2 | `components/mypage/products/MyProductFilter.tsx:69-81` 「포인트 홍보」가 `trailing`(스크롤 칸 밖, `shrink-0`). `DibaySecondaryTabRow.tsx:70-84` 구조상 4칩 스크롤 칸이 좁아져 「숨김」이 잘린다 | 고침 (코드 원인 확정. Owner 지목 화면의 기기 재현은 구현 전 1회) | `MyProductFilter` 안에서만 「포인트 홍보」를 스크롤 칸 마지막 칩으로 옮긴다. 공용 `DibaySecondaryTabRow` 는 그대로. `promoted=1` 주소 그대로 |
| D-2 | `PostDetailView.tsx:1388-1395` 가격 없으면 빈 문자열(가격 줄 태그는 렌더). 해당 글 13건 | 고침 | `t("trade_detail_price_inquiry")`(「가격 문의」, 키 있음 `lib/i18n/catalog/trade.ts:261`) |

### E. 상단 구조·판매 탭 — DB 변경 없음

| 항목 | 지금 코드 | 판정 | 수정 |
|---|---|---|---|
| 헤더 판매 버튼 | `components/layout/RegionBarMainHubTier1.tsx:130-146` Plus 버튼 → `/market/sell` | 고침 | 제거. 돋보기·알림은 그대로 |
| 탭 줄 | `components/trade/TradePrimaryTabs.tsx:156-283` 은 탭 버튼을 그리지 **않는다**: 📍·주제 칩·검색 칩·↺·필터만. `use-trade-tabs.ts:100-121` 의 「전체+주제」는 인덱스 계산용 | **다름**(v2 는 「지금 전체+주제 탭」이라 적음) | 탭 4개 + 📍 를 새로 그린다: 「판매」 → `/market/sell`, 「둘러보기」 → `/market`(지금 조건, 최신순), 「지역」 → `sort=near`(이미 있는 거리순 `marketplace-browse-state.ts:31,141`), 「카테고리」 → 주제 6개 시트(기존 `MarketplaceMoreBrowseSheet`). ↺·필터는 그대로 |
| 판매 허브 | `components/trade/MarketplaceSellHubPage.tsx:170-221` 칩 2개(내 매물·받은 메시지). 개요는 판매중 수·답장할 채팅 수 | 고침 | 칩 「알림」 → `/notifications?tab=trade`(이미 있는 거래 알림 탭, `MyNotificationsView.tsx:136`). 성과 3칸 = 내 글 `view_count` 합 · `favorite_count` 합 · `reports(target_type='product')` 건수 |
| 성과 API | `/api/my/posts` 무인자 응답 불변(`app/api/my/__tests__/r5-trade-list-routes.test.ts:57-67`) | 고침 | 새 읽기 전용 `GET /api/my/trade-performance`. 기존 API 는 그대로 |

- 바뀌는 테스트: `marketplace-ui-1-home-chrome:28-44`, `dibay-global-header-tabs-ssot:102-118`, `marketplace-browse-wiring-contract:217-221`(핀 버튼 유지라 그대로 통과 예상), `trade-header-location-hint`(D 반경 값과 함께).
- 판매로 가는 다른 입구 3곳(`TradeSellCta`·`TradeShowcaseSection`·`MyProductsView`)은 그대로 둔다.

### D. 위치 시트·반경·도시 필수 — 앱 설정값 저장만 (스키마 변경 없음)

| 항목 | 지금 코드 | 판정 | 수정 |
|---|---|---|---|
| 반경 값 | `lib/trade/location/trade-browse-radius.ts:19` 32/64/96/160 · 1~500. `MarketFilterSheet.tsx:679-685` 5/10/30/64. 거리 화면 `TradeBrowseLocationDistancePage.tsx:48-51,282-298` 프리셋+슬라이더 | 고침 | 한 값 `tradeRadiusOptionsKm`(초깃값 `[10,20,40]`, 「전체」 별도) + `tradeDefaultRadius`(초깃값 「전체」) 을 `AppSettings` 에 추가. 어드민 「지역 정책」(`RegionPolicyForm.tsx`)에 칸을 만든다. 저장 위치는 `admin_settings.app_settings_bundle_v1`(**지금 행 없음** → 첫 저장 때 생성, 테이블 변경 없음). 기존 `homeRadiusKm`(값 5, 사용처 없음)은 건드리지 않는다 |
| 옛 주소 | `parseTradeBrowseRadiusKmFromSearchParams` 1~500 그대로 받음 | 고침 | `radius=5/32/64…` 는 목록 값 중 가장 가까운 값으로 읽는다(열림 유지) |
| 화면·서버 값 일치 | `getAppSettings()` 비반응. 목록 응답 `HomePostsOpenResult`(`home-posts-route-core.ts:163-171`)에 반경 목록 없음 | 고침 | 서버가 목록 응답에 `radiusOptionsKm` 를 실어 보내고, 📍 시트는 그 값으로 그린다 |
| 위치 화면 3개 | `/market/location`·`/location/distance`·`/location/search`. 링크 6곳(`TradeHeaderLocationPinButton:192-204`, `MarketFilterSheet:941`, `HomeProductList:1126`, 화면끼리 3곳), 경로 규칙 7곳(`mobile-top-tier1-rules`, `conditional-app-shell-flags`, `main-bottom-nav-hub-clearance`, `resolve-main-hub-ptr-domain`, `trade-market-feed-href`, `trade-market-list-scroll-restore`, `AppStickyHeader`) | 고침 | 📍 시트 하나(내 위치·다른 지역 찾기·나의 지역·반경). 링크는 시트 열기로. 옛 3경로는 `next.config` 307 → `/market?locSheet=1`(시트 열림). 테스트 `trade-browse-location-cta-ux`(시트 금지 조항)는 v2 대로 「시트 사용」으로 바꾼다 |
| 「주변」 64km | `TRADE_BROWSE_NEARBY_TIER_RADIUS_KM`, 목록 계약 §2 | 그대로 | 반경 목록과 별개로 유지 |
| A-1·W-1 도시 필수 | `AddressPlatformDetailClient.tsx:298-321` save 에 `cityMunicipality` 검사 없음. `lib/addresses/address-api-validation.ts:117-135` 에도 없음 | 고침 | 둘 다 시 필수. 글쓰기 안내는 새 문구 키 |
| 계약 개정 | 목록 계약 §2·§3⑤, 브라우즈 계약 §4.2·TEST 3·6·14·16 「5km」 | 고침 | 10·20·40·전체, 어드민 지정으로 |

### F. 필터 — DB 변경 없음

| 항목 | 지금 코드 | 판정 | 수정 |
|---|---|---|---|
| 지역·거리 칸 | `MarketFilterSheet.tsx:913-974` | 고침 | 시트에서 제거(📍 로 일원화). 적용할 때 지금 위치 값을 그대로 넘긴다. 이유: `marketplace-browse-state.ts:280-313` 는 draft 위치가 없으면 committed 를 쓰지만, 시트가 draft 위치를 초기값으로 덮어 보내면 초기화된다 |
| FT-1·L-6 판매 의도 자동 선택 | 화면 `CompositionAttributeFilterSelects.tsx:39-56`(「전체」 option 없음), 서버 `load-composition-for-filter.ts:79`, `PostListByCategory.tsx:172-175`, `SearchView.tsx:120` | 고침 | 4곳 동시에: 자동 기본값 제거 + 「전체」 선택지 |
| FT-2 모델 | `option-catalogs.ts:44-60` 모든 제조사 모델 합침. 필터 select 가 `selection.make` 로 좁히지 않음 | 고침 | 고른 제조사의 `USED_CAR_BRANDS[].models` 만. 제조사를 바꾸면 모델 선택 해제 |

- 바뀌는 테스트: `sell-intent-list-ssot`, `market-filter-sheet-active-filters`, `marketplace-cut-i-category-matrix`, `marketplace-browse-wiring-contract:124-150`.

### I. 글쓰기·수정 — DB 변경 없음

| 항목 | 지금 코드 | 판정 | 수정 |
|---|---|---|---|
| W-2 사진 필수 | 구성 seed 에서 `images` required = 중고거래·중고차·부동산·렌터카 true, 일자리·환전 false(`composition-seeds.ts:25,41,61,86,120,128`). 화면 `TradeWriteForm.tsx:1409-1540` validate 에 사진 검사 없음. `GenericTradeWriteFields.tsx:19` `SHELL_SKIP` 이 images 를 건너뜀. 서버 `create/route.ts:186-190`, `owner-trade-update/route.ts:156-169` 최소 장수 없음 | 고침 | 사진 필수 주제에서 화면·서버 둘 다 1장 이상. 중고차 「삽니다」(`behavior-adapters.ts:41-43` effectiveRequired=false)는 제외 |
| E-1 수정 모드 위치 | `TradeDefaultLocationBlock.tsx:122,143` `editPostId` 받기만 하고 미사용. load 가 대표 주소로 region/city 를 덮어씀(`TradeWriteForm.tsx:736-739,1332-1339`). validate(`:1448-1456`)가 수정에도 대표 주소를 요구 | 고침 | 수정 모드에서 위치가 고정이면 load 를 건너뛰고 글의 기존 위치로 검사 통과. 주소 잠금 테스트 조항 유지 |

### H. 찜·신고 중 DB 없는 것

| 항목 | 지금 코드 | 판정 | 수정 |
|---|---|---|---|
| F-1 | 토글 응답에 `favoriteCount` 있음(`app/api/favorites/toggle/route.ts:135,154`). 목록은 `favoriteMap` 만 바꿈(`HomeProductList.tsx:1044-1046,970-984`). 카드 「관심 N」 = `post.favorite_count`(`PostCard.tsx:176-177`) | 고침 | 이벤트의 `favoriteCount` 로 해당 행을 새 객체로 교체(목록 2곳) |
| F-2 | 상세 `handleFavorite`(`PostDetailView.tsx:744-759`) 처리 중 잠금 없음 | 고침 | 상세에만 잠금 |
| F-3 | `route.ts:70` `favRl` 결과를 검사하지 않음(한도 무력). 글은 `user_id` 만 조회, 없는 글도 upsert | 고침 | `if (!favRl.ok) return favRl.response`. 없는 글 404, 숨김·삭제·관리자 숨김 글 찜 거절(해제는 허용) |
| RP-2 | 「신고한 글」 = 기기 저장소만(`lib/reports/reported-posts-store.ts`, localStorage) | 고침 | 읽기 API 1개(`reports` 에서 내가 신고한 product id). 목록 2곳·찾기·찜에 적용. 신고 버튼 추가 없음 |

### J 나머지. PR-1

| 항목 | 지금 코드 | 판정 | 수정 |
|---|---|---|---|
| PR-1 | `app/api/me/points/promotion-orders/route.ts:129-138` 모르는 `productId` → `trade_promote_7` 로 대체해 결제 진행. `MyAdsApplyPageClient`·`PointPromotionOrderForm` 은 항상 `selected.id` 를 보낸다(상품 id 없이 보내는 경로 없음) | 고침 | `productId` 가 있는데 카탈로그에 없으면 400 `invalid_product`. 옛 방식(`placement`+`durationDays`)은 그대로 |

---

## 6. 계획안 v2 와 다른 점 (근거)

1. **B 예약:** v2 는 「예약 쓰기 없음」이라 적었지만 `seller-listing-state` 가 예약을 받는다 → 예약 요청 거절을 B 에 넣는다.
2. **B 구매 내역 카드:** `PurchaseHistoryCard` 는 어디에서도 그려지지 않는다 → 수정하지 않는다(기록).
3. **B 예전 채팅 화면·거래 배너:** 거래 방은 항상 메신저로 가고, 메신저는 배너를 그리지 않는다 → 수정하지 않는다(기록).
4. **E 탭:** 지금 탭 버튼이 없다(v2 는 「전체+주제 탭」이라 적음) → 새로 그린다.
5. **E 계약 문서:** UI-1 잠금 문서가 없다 → 테스트와 목록 계약 §5 를 개정한다.
6. **PR-1:** 「상품 id 없이 보내는 경로」는 없다. 실제 결함은 「모르는 id 를 7일 상품으로 바꿔 결제」다.
7. **RP-1:** 중복 0쌍이라 운영 정리 없이 인덱스만 만든다.
8. **D:** 어드민 설정 행이 아직 없다 → 첫 저장 때 생성(데이터 1행, 테이블 변경 없음).

---

## 7. 운영 DB 승인 묶음 (구현과 별도, Owner 승인 후 적용)

| # | 내용 | 영향 | 롤백 |
|---|---|---|---|
| G | `trade_list_page` 찾기 구간에 「비슷한 물품」(단어 하나 이상 일치, 맞은 단어 수 순) 추가. 새 구간 키 `q:related`(전역 검색 일치 판정 `isTradeListSearchMatchSection` 이 `q:` 로 셈). 커서 길이 9 유지. 클라이언트 캐시 키 `v10 → v11` | 거래 목록·찾기 전 경로(같은 함수) | 이전 함수 정의로 `CREATE OR REPLACE` |
| RP-1 | `reports` 부분 유니크 인덱스 `(reporter_id, target_id) WHERE target_type='product'`. 중복이면 200 `already`(409 금지 테스트 유지) | 신고 insert | `DROP INDEX` |
| PR-2 | `purchase_member_content_promotion` 이 `seller_listing_state='completed'` 도 거절. 같은 서명 `CREATE OR REPLACE`, 권한 재부여(`20261025170000` 과 같게). 해당 글 2건 | 홍보 구매 | 이전 정의로 되돌림 |

---

## 8. Owner 결정 (2026-10-28 답변 반영)

- **Q1 판매완료 위치 → 「무조건 목록 맨 끝」** (Owner 「1번은 권장안」. 권장안 = Owner 원문 「판매 완료는 … 하단으로」·인수인계 「맨 아래」에 맞는 쪽).
  - 순서는 모든 판매중 글(일치·유사·나머지, 지역 순서 그대로) 다음에 판매완료 글(같은 순서)이다.
  - 「거래 상태: 판매완료」를 고른 경우는 반대로, 판매완료가 먼저 나온다.
  - 구현: `trade_list_page` ORDER BY 에서 `t_state` 를 맨 앞으로 옮긴다. 운영 DB 함수 변경이라 **§7 묶음(G)과 한 번에 승인·적용**한다.
  - 함께 바꿀 것: 목록 계약 §3 순위표(④ → 맨 앞), 안내 줄 키 순서, 관련 테스트(`list-contract-order`).
- **Q2 샘플 사진 → AI 생성 이미지.**
  - 샘플 채우기는 계획 v2 에 없는 작업이다. 그래서 이번 구현이 끝난 뒤 **별도 설계**(주제별 수량, 문구, 「예시」 표시, 거래·채팅 차단, 어드민 관리)를 올려 승인받는다.
  - 기존 `trade_showcase_items` 테이블과 어드민 화면을 쓴다.

## 9. 계획 밖 결함 (고치지 않고 기록)

- 주제 배지 색 6개 모두 null → 모든 주제가 같은 색이다(Owner 「색만」 요구와 다름). 값 입력 방법은 별도 승인.
- 하위 카테고리 0개 → 「고른 하위 → 같은 상위」 구간이 지금 생기지 않는다.
- 판매중인데 구매자 값이 남은 글 1건, `completed` 인데 `status≠sold` 2건(데이터).
- A 단계 후기 잔재:
  - `lib/chats/server/load-chat-room-detail.ts:44` `buyer-review-flag` 호출
  - 쓰지 않는 상수 `MYPAGE_HOME_TRADE_REVIEWS_HREF`
  - `supabase/migrations/20260605160000_mypage_cms_tables.sql:101` seed 메뉴
  - `scripts/qa/slice5·10·11` 후기 경로
- 예약 기반 차단 함수 잔존(예약 0건, 동작 영향 없음).
- 공용 칩 줄 CSS 레이어 밖(`dibay-chrome-ssot.css`).
- L-7 인기순 페이지 건너뜀.
- 홍보 신청 폼 카탈로그가 도메인 필터 없이 커뮤니티 상품도 보여 줌(고르면 서버 400).
- X-2 vitest 작업자 시간 초과(재발 시 보고).

---

## 10. 구현·반영 방식 (승인 후)

1. 순서: X-1·X-3 → B → C → H-2·D-2 → E → D → F → I → H(F-1~F-3·RP-2) → PR-1. 전부 구현한 뒤 한 번에 검증한다.
2. 커밋:
   - 메신저 파일(`components/community-messenger/**`)은 단독 커밋
   - 나머지 거래는 한 커밋
   - 계약 문서 개정(B·D·E)은 해당 코드 커밋에 포함
3. 로컬 검사 1회: `npm run ci` 안의 `verify:*` 전부, `typecheck:build`, `typecheck:test`, `lint`, 관련 vitest. 로컬 환경 실패 2건(Node26 localStorage)은 구분해 표기한다.
4. main 반영 1회 → Production SHA 1회 확인(폴링 금지).
5. §7 DB 묶음은 Owner 승인 후 적용하고 결과를 조회로 확인한다.
6. 아래 시나리오 표로 Samsung·태블릿(세로·가로)·iPhone 을 화면에서 직접 조작한다. iPhone 이 연결되지 않으면 NOT_PROVEN.
7. 실패를 모아 보완 1회 → 반영 1회 → 같은 표로 재확인한다.

### 시나리오 표

| # | 시나리오 | 기대 |
|---|---|---|
| S1 | `/mypage/trade/reviews`·`/mypage/trade`·`/mypage/trade/sales` 직접 열기 | 오류 없이 「내 매물」 |
| S2 | 내 물품 ⋮ — 판매중 글 / 판매완료 글 | 판매중: 「판매완료」 있음 · 판매완료: 상태 메뉴 없음, 되돌리기 토스트 없음 |
| S3 | 상세 소유자 ⋯ | 판매중일 때만 「판매완료」, 「물품 판매 취소」 없음 |
| S4 | 메신저 거래방 줄(판매자) | 판매중: 「판매완료」 · 판매완료: 상태만 |
| S5 | 판매완료 글 상세(기존 방 있는 구매자 / 없는 구매자) | 기존 방 입장 / 막힘 안내 |
| S6 | 앱 재시작 직후 거래 목록 끝까지 더보기 | 182건, 중복 0 |
| S7 | 태블릿 가로 목록 끝 | 「더보기」가 하단 탭에 안 가림 |
| S8 | 내 매물 칩 줄(384px) | 칩 5개 모두 보임·가로 스크롤 |
| S9 | 가격 없는 글 상세 | 「가격 문의」 |
| S10 | 거래 헤더 | 「판매하기」 없음, 탭 4개 + 📍 |
| S11 | 「지역」 탭 / 「카테고리」 탭 / 「판매」 탭 성과 | 가까운 순 / 주제 6개 / 조회수·찜·신고 = DB 값 |
| S12 | 📍 시트: 내 위치·다른 지역·반경 10/20/40/전체, 옛 `radius=5` 주소 | 적용·열림 |
| S13 | 도시 없는 주소 저장 | 막힘 안내 |
| S14 | 필터 적용 후 📍 위치 / 중고차 기본 / Toyota 모델 | 유지 / 「전체」 / Toyota 모델만 |
| S15 | 사진 0장 등록(중고거래) / 대표 주소 없는 판매자 수정 저장 | 막힘 / 저장됨 |
| S16 | 목록 하트 → 「관심 N」 / 상세 하트 연타 | 즉시 변경 / 뒤집힘 없음 |
| S17 | 다른 기기에서 신고한 글 | 「신고한 글이에요」로 가림 |
| S18 | (DB 승인 후) `iphone 17 pro`·`macbook air`·`zzzz` 입력 / 같은 글 신고 2번 / 판매완료 글 홍보 구매 | 일치 → 비슷한 → 나머지 / 두 번째 `already` / 거절 |

---

## 11. 구현 기록 (Owner 승인 2026-10-28 「구현 되는 부분을 보여 줘서 진행」)

설계 §5 그대로 구현했다. 구현하면서 정한 세부(설계 범위 안)는 아래와 같다.
- **D 📍 시트:** 지도는 넣지 않았다(설계 「내 위치·다른 지역 찾기·나의 지역·반경」 그대로).
  - 시트 구성: 주변 주요 지역, 「전체 상품 보기」, 반경 칩(「전체」 + 어드민 선택지), 「적용」.
  - 다른 입구: 빈 목록의 「위치 선택」 버튼은 시트 열기 신호(`trade-location-sheet-event.ts`)로 연다.
  - 옛 경로를 다루던 경로 규칙 7곳은 그대로 뒀다. 옛 주소는 307 로 먼저 `/market` 에 가므로 그 화면이 그려지지 않는다.
- **D 기본 반경(`tradeDefaultRadiusKm`):** 시트에서 반경 없이 새 지역을 고를 때만 미리 고른다. 첫 진입 목록 순서(목록 계약 §2)는 바꾸지 않았다.
- **D 반경 맞춤:** 서버(`resolveHomePostsGetData`)는 어드민 선택지로, 클라이언트는 마지막으로 받은 선택지(받기 전에는 10·20·40)로 가장 가까운 값을 고른다.
- **E 판매 허브 경로 규칙:** 바꿀 것이 없었다. backHref 가 이미 `/market` 이다.
- **H F-3:** 공개 자격이 없는 글(숨김·삭제·관리자 숨김)에 새로 찜하면 403 `post_not_public` 이다. 찜 해제는 언제나 허용한다.
- **I W-2:** 서버 검사는 새 글 등록과, 사진을 보낸 수정에만 적용한다. 판정은 `trade-images-required.ts` 한 곳에서 한다.
- **테스트:** 바뀐 계약 테스트 13개 파일을 고쳤고, 신규 2개(다음 페이지 기준 재계산·반경 선택지)를 추가했다.

## 12. §7 운영 DB 적용 (Owner 2026-10-28 「승인 한다 남은 위험도 처리 한다」)

- 적용: `20270706120100` RP-1 인덱스 → `20270706120200` PR-2 → `20270706120000` G·판매완료 맨 끝 (코드 main `b2489c342`).
- 조회 확인(운영, 읽기 전용):
  - `trade_list_page` 본문 md5 = 저장소 파일과 같음(`63beaf7b…`).
  - `iphone 17 pro`: 전체 182건 = 50건 + 커서 다음 페이지 132건, 중복 0 · 순서 일치.
  - `uq_reports_product_reporter_target` 생성됨. PR-2 함수에 `seller_listing_state` 검사 반영, anon 실행 권한 없음(service_role 만).
- 실기기: NOT_PROVEN.
