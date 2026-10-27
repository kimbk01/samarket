# 거래 UI·UX·CTA 기기 이탈 감사 · 통일 규격 · 수정 설계 (2026-10-27)

- 범위: 거래(마켓) 화면 전체 + 판매자↔구매자 프로세스. 읽기 전용 감사. 코드·DB 변경 없음.
- Production 기준: 감사 시점 main (`5f1ab2cd3` 이후 거래 코드 변경 없음).
- 기기:
  - iPhone: B w테스트1. 430×932, safe-top 59 / bottom 34.
  - Samsung: A q테스트1. 384×832, safe-top 41 / bottom 48.
  - Xiaomi 태블릿: C zxzx11, 가로 1340×800.
- 방법:
  - ① 화면별 DOM 측정 스크립트로 자동 판정 (`--safe-top`·`--safe-bottom` 실측값 대비 텍스트·버튼 침범, 가로 넘침, 하단탭 가림).
  - ② 기기 캡처.
  - ③ 코드 정적 대조.
  - ④ 운영 DB 읽기 전용 조회.
  - 추정은 결함으로 올리지 않았다. 측정·캡처·코드 중 둘 이상이 일치한 것만 「확정」이다.
- 증거 폴더: `docs/audit/evidence/trade-uiux-2026-10-27/`. 이전 실기기 증거는 `docs/audit/evidence/trade-device-2026-10-27/` 에 있다.

## 1. 측정 결과 요약 (자동 판정)

| 라우트 | iPhone | Samsung | 태블릿 |
|---|---|---|---|
| `/market` | PASS | PASS | 이전 회차 PASS |
| `/search` | PASS | PASS | — |
| `/market?q=test` | PASS (경계) | PASS (경계) · **검색어 미표시** | — |
| `/post/[id]` 타인 | PASS | PASS (문의 카드 정상 `REF-samsung-inline-chat-ok.jpg`) | 판매완료 CTA 사유 미표시 |
| `/market/location` | **FAIL 헤더 top=2px < 59** | **FAIL 헤더 top=2px < 41** | — |
| `/mypage/products` | 측정 중단 ※ | PASS · CTA 불일치 | — |
| `/mypage/trade/sales`·`/purchases`·`/chat` | 측정 중단 ※ | PASS (리다이렉트: 의도된 설계 `next.config.js:111-125`) | — |
| `/write` · `/market/sell` | 측정 중단 ※ | PASS | — |
| `/mypage/trade/chat/compose` (준비 화면) | **FAIL** (Owner 첨부) | 코드 동일 | 코드 동일 |

※ 측정 중 iPhone 미러링 연결이 끊겨 WebView 가 일시정지됐다. 이후 iPhone 항목은 코드 대조로만 판정했고 실측은 **NOT_PROVEN** 이다. 수정 후 재검증 행렬에 포함한다.

## 2. 결함 목록 (확정)

등급: P1 = 거래 진행 불가 · P2 = 화면 이탈/오동작 · P3 = 일관성.

### 2-A. 기기 경계 이탈 (safe-area)

| ID | 등급 | 화면 | 현상 | 확정 근거 | 원인 (파일:줄) |
|---|---|---|---|---|---|
| UX-01 (=NF-11) | P2 | 채팅 준비 화면 `/mypage/trade/chat/compose` | 썸네일·제목·가격이 Dynamic Island·상태바와 겹친다. 하단 「메시지 보내기」 아래에 빈 공간이 생긴다 | Owner 첨부 `UX01-iphone-compose-header.jpg` + 코드 | `TradeChatComposePreparingShell.tsx:29`: `<header>` 에 safe-top 이 없다. 이 라우트는 전역 헤더 숨김 대상이다 (`mobile-top-tier1-rules.ts:108-122`). `app/(main)/mypage/trade/layout.tsx:9-13`: 하단탭이 숨겨진 라우트에도 하단탭 여백(60px+safe-bottom)을 넣는다 |
| UX-02 | P2 | 위치 선택 `/market/location`·`/distance`·`/search` | 뒤로·제목·검색 버튼이 상태바와 겹친다 (iPhone·Samsung 모두) | DOM 실측 2기기 + `UX02-samsung-location-header.jpg` | `TradeBrowseLocationPageShell.tsx:27-29`: `DefaultHeader embedded` → `.sector-header-shell--embedded{padding-top:0}` (`app/sector-header.css:71-75`). 전역 헤더는 숨김 상태다 |
| UX-03 (=NF-9) | P2 | 신고 사유 전체 시트 | 제목·× 가 상태바와 겹친다 | 이전 회차 `NF9-steady.jpg` + 코드 | `DibayFullSheet.tsx:65,93`: `hideBottomNav` 일 때 stage `top:0`, 헤더에 safe-top 이 없다. `ReportReasonModal.tsx:57` 이 이 경로를 쓴다 |
| UX-04 | P2 | 거래내역 슬라이드 패널 | 패널 헤더가 상태바 아래로 들어간다 | 코드 (`fixed inset-y-0 … pt-0` + `DetailHeader embedded`) · 실측 NOT_PROVEN | `TradeHistoryFromHeaderStack.tsx:133`, `TradeHistoryStackPanel.tsx:50-56` |
| UX-05 | P2 | 거래 채팅 로딩 셸 (`/chats/[id]` 진입 중) | 상단 행에 safe-top, 입력 골격에 safe-bottom 이 없다 | 코드 · 실측 NOT_PROVEN | `TradeChatLoadingShell.tsx:43,70` |
| UX-06 (=NF-1) | P2 | iPhone 상세 문의 카드 입력 중 | 카드가 홈 표시줄 영역까지 내려가 판매자 행이 잘린다. Samsung·태블릿은 정상 | 이전 회차 `NF1-iphone-detail.jpg` | iPhone 키보드 inset 보정 대상이다. 수정 전 iPhone 실측으로 원인을 재특정한다 (추정 수정 금지) |
| UX-07 (=NF-4) | P2 | 태블릿 가로 필터 시트 | 시트 하단이 하단탭에 가려지고 「결과 보기」가 정렬 항목 위에 겹친다 | 이전 회차 `tab20.jpg` | 시트 최대 높이가 가로 800px 에서 하단탭 높이를 빼지 않는다. 수정 전 태블릿 DOM 으로 재특정한다 |
| UX-08 | P3 | `/market` 피드 토스트 | `bottom-24`(96px) 가 하단탭(60+34=94px)+오빗 상승 시 겹칠 수 있다 | 코드 · 실측 NOT_PROVEN | `PostListByCategory.tsx:1019` |

### 2-B. CTA·상태 표시

| ID | 등급 | 화면 | 현상 | 확정 근거 | 원인 |
|---|---|---|---|---|---|
| CTA-01 | P2 | 상세 문의 카드: 판매완료·예약중·타인예약 | 버튼만 회색이 된다. 이유는 `title` 툴팁에만 있어 모바일에서 보이지 않는다. 입력란은 여전히 「아직 판매 중인가요?」를 보여준다 | 태블릿 캡처 `CTA01-tablet-sold-inline-chat.jpg` + 코드 | `TradeDetailInlineChatCard.tsx:89` `title={blockTitle}` 뿐. `PostDetailView.tsx:1116-1126` |
| CTA-02 (=NF-2) | P2 | 상세 「판매자에게 메시지 보내기 → 보내기」 | 방만 열린다. 입력한 문구가 전송되지 않는다 (DB 메시지 0건) | 이전 회차 DB + 코드 | `TradeDetailInlineChatCard.tsx:34` `draft` 는 카드 내부 상태다. `onSend()` 가 텍스트 없이 호출된다 (`PostDetailView.tsx:1108-1114`) |
| CTA-03 | P2 | `/market?q=…` 결과 화면 | 화면 어디에도 검색어가 없다 (입력값·텍스트 0). 「결과 없음」만 보여 무엇을 검색했는지, 어떻게 지우는지 알 수 없다 | Samsung DOM `hasQ:[] textHit:false` + `CTA03-samsung-q-invisible.jpg` | 상단 툴바에 검색어 칩이 없다 |
| CTA-04 (=NF-10) | P3 | 판매 CTA | 판매 허브는 「＋ 판매하기」, 내 매물 하단 고정은 「판매하기」(＋ 없음). 같은 행동인데 모양이 다르다 | `CTA02-samsung-market-sell-cta.jpg` vs `CTA02-samsung-myproducts-cta.jpg` | 내 매물 하단 고정이 `TradeSellCta` 를 쓰지 않는다 |
| CTA-05 | P3 | 내 매물 카드 | 카드마다 「거래 상위노출」이 전폭 primary 버튼이고, 하단 「판매하기」와 같은 색·크기다. 한 화면에 primary 가 N+1 개다 | `CTA02-samsung-myproducts-cta.jpg` | CTA 위계 규격이 없다 |
| CTA-06 (=NF-7) | P3 | 판매자 본인 거래 방 안내 | 「판매자 프로필 보기」가 판매자 자신에게 나온다 | 이전 회차 `sam2.jpg` | 역할 분기 누락 |
| CTA-07 | P3 | 관련 매물 카드 | 「판매중 \| For sale」 한·영 상태칩이 중복된다 | Samsung 상세 하단 캡처 | 칩 소스 2개를 동시에 렌더한다 |

### 2-C. 판매자↔구매자 프로세스

| 단계 | 판매자 | 구매자 | 결과 | 근거 |
|---|---|---|---|---|
| ① 등록 | 글쓰기·사진·수정 | — | PASS (S-04·S-05·S-06) / 수정 직후 상세 stale **FAIL (TM-25)** | §9 |
| ② 문의 | 방 수신 | 상세 문의 카드 | **FAIL CTA-02**: 문구 미전송 | DB |
| ③ 대화 | 메신저 거래방 | 메신저 거래방 | PASS | §9 |
| ④ 예약 | 방 ⋮ / 내 매물에서 예약중 | 열린 방에 3초 안에 반영 | PASS (S-14) | §9 |
| ⑤ 판매완료 | 판매완료 처리 | 열린 방·재진입 방에 반영 | **FAIL (NF-5)**: 방 요약 「예약중」·⋮ 「판매중」이 남는다 | `NF5-iphone-room-sheet.jpg` |
| ⑥ 거래완료 확인 | — | 「거래완료 확인」 | **FAIL P1 (PR-01)**: 메신저 거래방에 진입 UI 가 없다 | 코드·S-13 |
| ⑦ 후기 | 후기 | 후기 | **FAIL P1 (PR-01)**: 같은 원인 | 코드·S-13 |

**PR-01 원인 (확정, 이전 NF-6 정정)**
- 「거래 진행 영역 미마운트」는 버그가 아니다. `34477e485`(2026-08-20) 에서 「composer trade flow dock」을 **의도적으로 제거**하고 헤더 상품 행 + 상세 슬라이드로 바꿨다.
- 그런데 이 영역이 갖고 있던 기능 가운데 아래 셋은 **어디로도 옮겨지지 않았다**:
  - 구매자 「거래완료 확인」 (`/api/trade/product-chat/[roomId]/buyer-confirm`)
  - 후기 쓰기
  - 판매완료 시 구매자 선택
- 남은 진입점도 모두 닫혀 있다:
  - `TradeFlowBanner` 는 레거시 `ChatDetailView` 에만 있다. `/chats/[id]` 는 거래방을 메신저로 리다이렉트한다 (`app/(main)/chats/[roomId]/page.tsx:67-78`).
  - `PurchaseHistoryCard` 는 렌더하는 곳이 0곳이다. `/mypage/purchases` 는 거래채팅 목록으로 리다이렉트된다.
  - 렌더 코드는 `components/community-messenger/room/phase2/_extract/attachmentsTrade.txt` 에만 남아 있다.
- 결론: 메신저 거래방에서 구매자는 거래를 확정할 수도, 후기를 남길 수도 없다.

**PR-02 (= NF-5 / S-14 완료 FAIL)**
- 판매완료 경로는 알림 생성 + 홈 스냅샷 무효화만 한다.
- 거래방 요약(`community_messenger_rooms.summary.itemStateLabel`)과 방 Realtime 갱신이 없다. 판매자 상태 변경 broadcast(`samarket:trade-post-listing:{id}`)는 `seller-listing-state` 경로에서만 발행된다.
- 수정 전에 판매완료 1건의 서버 경로를 로그로 대조해 원인을 확정한다.

**PR-03 (= TM-25)**: 수정 저장 직후 상세가 이전 값을 보여준다. 라우터 캐시가 원인이다 (§9 S-08).

### 2-D. 토큰·반경 위반 (코드 확정, 화면 영향 경미)

- `bg-red-50`·`text-red-*`·`text-amber-*`:
  - `TradeChatComposePreparingShell.tsx:49-57` (오류 배너 + 하드코딩 한국어 「다시 시도」)
  - `PostDetailMoreBottomSheet.tsx:132`
  - `PostDetailSellerMoreSheet.tsx:104,128`
  - `PostListMenuBottomSheet.tsx:141,159,190`
  - `PostDetailView.tsx:1163`
  - `TradeReviewWriteSheet.tsx:153`
  - `CommunityMessengerTradeProcessSection.tsx:281`
  - `TradeWriteForm.tsx:2186-2190`
- hex 직접 지정:
  - `PostCard.tsx:73,84`
  - `PostListPreviewColumn.tsx:68,79`
  - `TradeListLoadMoreFooter.tsx:40-44`
  - `PostDetailRelatedSections.tsx:119` (`rounded-md` 반경 위반 포함)
  - `ChatInputBar.tsx:255`
  - `ChatMessageList.tsx:227,252,271`
- 반경: `TradeChatLoadingShell.tsx:56-62` `rounded-2xl bg-emerald-50` (말풍선 골격).

### 2-E. 철회·제외 (감사 중 정정)

- 「Samsung 타인 상세에 구매자 CTA 없음」은 **철회**한다. 측정 스크립트 정규식 누락 때문이었다. `inline-chat` 슬롯이 렌더되고 정상 동작한다.
- 「구매내역 → 거래채팅 리다이렉트」는 **제외**한다. Slice 5 의 의도된 설계다 (`next.config.js:111-125`).
- NF-6 은 **PR-01 로 정정**한다. 위 원인 참조.

## 3. 통일 규격 (거래 전 화면 공통 · 단일 정의)

### R1. 상단 (safe-top)

1. 전역 헤더가 보이는 라우트에서는 페이지 헤더를 넣지 않는다. 전역 `AppStickyHeader`/`RegionBar` 가 safe-top 을 책임진다.
2. 전역 헤더가 숨겨진 라우트(`suppressMainTier1`)에서는 페이지가 **반드시** `.sector-header-shell`(비 embedded `DetailHeader`·`DefaultHeader`) 또는 `.app-safe-top` 을 쓴다.
3. `embedded` 헤더는 부모가 이미 safe-top 을 준 경우에만 허용한다.
4. 전체 시트·고정 패널이 `top:0` 에서 시작하면 헤더 행에 `pt-[var(--safe-top)]` 를 준다.

### R2. 하단 (safe-bottom · 하단탭)

1. 하단 고정 CTA·입력: `pb-[max(<기본>, var(--safe-bottom))]`. 키보드가 열리면 `max(safe-bottom, keyboard inset)` 를 쓴다 (`TRADE_POST_DETAIL_BOTTOM_PRIMARY_ROW`, `SubmitButton` 과 같다).
2. 본문 하단 여백(`MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS`)은 `isBottomNavEligibleRoute` 가 true 인 라우트에만 준다.
3. 시트는 `DibayBottomSheet` 만 쓴다. 하단탭 유무에 따른 앵커와 높이를 자동으로 처리한다. 가로 태블릿 최대 높이는 `100dvh − safe-top − 하단탭 높이 − 여백` 이다.
4. 토스트·플로팅은 `bottom: calc(하단탭 높이 + safe-bottom + 12px)` 토큰을 쓰고 px 를 하드코딩하지 않는다.

### R3. CTA 위계

1. 화면당 primary(진녹 `--sam-primary` 채움) **1개**. 그 외에는 secondary(테두리) 또는 tertiary(텍스트)를 쓴다.
2. 판매 진입은 어디서나 `TradeSellCta`(＋ 아이콘 + 「판매하기」) 하나만 쓴다.
3. 비활성 CTA 에는 **보이는 사유 한 줄**이 필요하다. 툴팁만으로는 안 된다. 사유는 상태 문구 키를 그대로 쓴다.
4. CTA 문구는 결과를 말한다. 「보내기」는 실제로 보낸다. 방만 여는 경우 「채팅하기」라고 쓴다.

### R4. 상태 표시

1. 판매 상태 칩은 1개만 둔다 (`ProductStatusBadge`, 한 언어).
2. 검색·필터가 걸린 목록은 상단 툴바에 **현재 조건 칩**(검색어 ✕ 포함)을 항상 보여준다.

### R5. 토큰

- 색: `sam-*` 토큰만 쓴다. 상태색은 `--sam-danger`·`--sam-warning`·`--sam-success` 와 각 `-soft` 배경을 쓴다.
- 반경: 화면에 붙은 요소는 4px(`rounded-ui-rect`), 떠 있는 시트는 12–24px, 원·pill 만 `rounded-full` 이다.

## 4. 수정 설계 (묶음 · 순서)

순서: 거래 진행이 불가한 P1 → 경계 이탈 P2 → CTA P2 → P3.

| 묶음 | 대상 | 수정 | 바뀌는 파일 | 회귀 위험 | 검증 |
|---|---|---|---|---|---|
| F1 (P1, 메신저 도메인 단독 커밋) | PR-01 | 메신저 거래방에 **조건부 거래 행동 줄**을 둔다. 헤더 상품 행 바로 아래에 둔다. 보일 때: 구매자 → 판매자가 판매완료한 뒤 「거래완료 확인」, 확인 뒤 「후기 쓰기」. 판매자 → 예약·판매완료(구매자 선택 포함)·「후기 쓰기」. 할 일이 없으면 줄을 렌더하지 않는다 (08-20 「중복 제거」 의도 유지). 내부 동작은 기존 `CommunityMessengerTradeProcessSection` 의 상태 로직(`TradeFlowBanner`·`buyer-confirm`·`TradeReviewWriteSheet`)을 재사용하고 새 API 는 없다 | `CommunityMessengerRoomPhase2Composer.tsx` 또는 `…Header.tsx`, `CommunityMessengerTradeProcessSection.tsx` (compact 변형) | 메신저 방 레이아웃·키보드·스크롤 계약 (`community-messenger-mobile-room-viewport.md`) | 2계정: 예약→판매완료→구매자 확인→양측 후기 |
| F2 (P2) | PR-02 | 판매완료 경로에서 방 요약 `itemStateLabel` 갱신 + 거래 상태 broadcast 발행. `seller-listing-state` 와 같은 함수로 합친다 | 판매완료 API·`product-chat-messenger-meta.ts` | 알림 중복 | 열린 방·재진입 방 3초 안에 반영 |
| F3 (P2) | UX-01·02·03·04·05 | R1 적용. compose 헤더 `.app-safe-top`, 위치 셸 `embedded` 제거, `DibayFullSheet` 헤더 safe-top, 거래내역 패널 `pt-[var(--safe-top)]`, 로딩 셸 safe-top·bottom. `mypage/trade/layout.tsx` 여백을 하단탭 라우트 조건부로 바꾼다 | 6개 파일 | 다른 도메인에서 `DibayFullSheet` 사용처: 사용처 전수 확인 후 적용 | iPhone·Samsung DOM 측정 0건 + 캡처 |
| F4 (P2) | CTA-02 | 카드 `draft` 를 `onSend(text)` 로 넘긴다. 방 생성 후 첫 메시지 1회 전송(중복 방지 키), 실패 시 방에 초안을 복원한다 | `TradeDetailInlineChatCard.tsx`, `PostDetailView.tsx`, 채팅 시작 클라이언트 | 중복 전송 | 보내기 1회 = 메시지 1건 (DB) |
| F5 (P2) | CTA-01 | 비활성 사유를 입력란 자리에 표시한다 (예: 「판매완료된 상품이에요」). 입력란·버튼은 숨긴다 | `TradeDetailInlineChatCard.tsx` | 없음 | 판매완료·예약중·타인예약 3상태 캡처 |
| F6 (P2) | CTA-03 | `/market?q=` 툴바에 검색어 칩(✕ = q 만 제거) | 마켓 툴바 컴포넌트 | TM-35 ↺ 계약 유지 | q 표시·✕·↺ |
| F7 (P2, 실측 선행) | UX-06·UX-07 | iPhone 키보드 inset·태블릿 가로 시트 높이를 실측해 원인을 특정한 뒤 R2 적용 | 실측 후 확정 | — | 해당 기기 |
| F8 (P3) | CTA-04·05·06·07, PR-03, UX-08, 2-D | `TradeSellCta` 통일, 상위노출 secondary 로 강등, 역할 분기, 칩 단일화, 저장 후 `router.refresh()`, 토스트 토큰, 색·반경 토큰 치환 | 각 파일 | 시각 변화 | 캡처 대조 |

**실기기 재검증 행렬 (수정 후, 매 회 Production SHA 기록)**: 3기기 × 위 라우트 DOM 측정 0건 + 프로세스 ①~⑦ 2계정 1회.

**롤백**: 묶음별 단독 커밋을 `git revert` 한다.

## 5. 시안

UI·CTA 시안(현재 → 수정)은 별도 페이지로 공유한다. 이 문서 §3 규격을 그대로 그린 것이다.
