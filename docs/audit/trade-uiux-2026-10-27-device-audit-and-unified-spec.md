# 거래 UI·UX·CTA 기기 이탈 감사 · 통일 규격 · 수정 설계 (2026-10-27, 2차 확정)

- 범위: 거래(마켓) 화면 전체 + 판매자↔구매자 프로세스 + 거래방 시스템 메시지. 읽기 전용 감사. 코드·DB 변경 없음.
- 기기·계정:
  - iPhone (B w테스트1): `1.2 (15)`, 430×932, safe 59/34.
  - Samsung (A q테스트1): `1.2.4 (13)`, 384×832, safe 41/48.
  - Xiaomi 태블릿 (C zxzx11): `1.2.4 (13)`, 가로 CSS 1005×601 (density 213).
- 방법:
  - ① DOM 자동 판정: `--safe-top`·`--safe-bottom` 실측값 대비 텍스트·버튼 침범, 가로 넘침, 하단탭 가림.
  - ② 기기 캡처.
  - ③ 코드 대조.
  - ④ 운영 DB 읽기 전용.
  - **둘 이상이 일치한 것만 결함**으로 올렸다. 오탐은 §2-F 에 철회 사유를 남겼다.
- 태블릿은 WebView 디버그 소켓이 없어(`/proc/net/unix` 무, 직접 forward 응답 없음) 캡처 + 밀도 환산 + 코드로 판정했다.
- 증거 폴더: `docs/audit/evidence/trade-uiux-2026-10-27/` (이전 회차는 `trade-device-2026-10-27/`).

## 1. 측정 결과 (자동 판정)

| 라우트 | iPhone | Samsung | 태블릿 |
|---|---|---|---|
| `/market`, `/search`, `/market?q=` | PASS | PASS | PASS |
| `/post/[id]` 타인 | 경계 PASS · **CTA 첫 화면 밖 (CTA-08)** | 경계 PASS · CTA-08 | 판매완료 사유 미표시 (CTA-01) |
| `/market/location` (+`/distance` → 같은 화면) | **FAIL 헤더 top 2 < 59** | **FAIL 헤더 top 2 < 41** | — |
| `/mypage/products`, `/community-messenger/trade-chats`, `/write`, `/market/sell` | PASS | PASS | — |
| 거래방 `/community-messenger/rooms/[id]` | 경계 PASS · **시스템 메시지 SYS-01** | SYS-01 | — |
| 필터 시트 | — | **SHEET-01** | **SHEET-01** |
| 채팅 준비 화면 (compose) | **FAIL (Owner 첨부)** | 코드 동일 | 코드 동일 |

`/mypage/trade/sales` → `/mypage/products`, `/mypage/(trade/)purchases` → 거래채팅 목록 리다이렉트는 의도된 설계다 (`next.config.js:111-125`).

## 2. 결함 목록 (확정)

등급: P1 = 거래 진행 불가 · P2 = 화면 이탈·오동작·잘못된 정보 · P3 = 일관성.

### 2-A. 판매자↔구매자 프로세스

| 단계 | 결과 | 근거 |
|---|---|---|
| ① 등록·수정 | PASS / 수정 직후 상세 stale **FAIL (PR-03 = TM-25)** | §9 S-08 |
| ② 문의 | **FAIL CTA-02**: 「보내기」 문구 미전송 | DB 메시지 0건 + 코드 |
| ③ 대화 | PASS | §9 |
| ④ 예약 | PASS (열린 방 3초 반영). 단, 시스템 메시지 표시 **SYS-01** | §9 S-14 + 이번 실측 |
| ⑤ 판매완료 | **FAIL PR-02**: 방 요약·⋮ 상태·시스템 메시지 미반영 | 코드 확정 |
| ⑥ 거래완료 확인 | **FAIL P1 PR-01**: 메신저 거래방에 진입 UI 없음 | 코드 + S-13 |
| ⑦ 후기 | **FAIL P1 PR-01**: 진입 UI 없음, 후기 딥링크 의도도 버려짐 | 코드 |
| 목록 정합 | **FAIL LIST-01**: 숨김 글이 다른 사용자 목록에 40분간 남음 | 태블릿 캡처 + DB + 코드 |

**PR-01 (P1) 원인**
1. `34477e485`(2026-08-20) 에서 방 하단 거래 진행 영역을 「중복」으로 제거하고 헤더 상품 행 + 상세 슬라이드로 바꿨다. 이때 구매자 「거래완료 확인」(`/api/trade/product-chat/[roomId]/buyer-confirm`), 후기 쓰기, 판매완료 구매자 선택은 **옮겨지지 않았다**.
2. 남은 진입점도 모두 닫혀 있다.
   - `TradeFlowBanner` 는 레거시 `ChatDetailView` 에만 있다. `/chats/[id]` 는 거래방을 서버에서 메신저로 리다이렉트한다 (`app/(main)/chats/[roomId]/page.tsx:67-78`).
   - `PurchaseHistoryCard` 는 렌더하는 곳이 0곳이다.
3. 리다이렉트 시 `openReview` 를 받지만 `tradeItemChatMessengerHrefIfLinked` 가 이를 버린다 (`lib/chats/surfaces/trade-chat-surface.ts`). 「후기 작성」 알림을 눌러도 후기 화면이 열리지 않는다.

**PR-02 (P2) 원인**
- `app/api/trade/product-chat/[roomId]/seller-complete/route.ts` 는 글·product_chats·chat_rooms 상태, 알림, 홈 스냅샷 무효화만 한다.
- 아래 셋은 `seller-listing-state` 경로에만 있고 판매완료 경로에는 없다.
  - 메신저 방 요약(`summary.itemStateLabel`) 갱신
  - 상태 broadcast(`samarket:trade-post-listing:{id}`)
  - 상태 변경 시스템 메시지
- 그래서 판매완료 뒤에도 방에는 「예약중」이 남는다.

**PR-03 (P3)**: 수정 저장 직후 라우터 캐시가 이전 상세를 보여준다.

**LIST-01 (P2) 원인**
- `lib/posts/getPostsForHome.ts:86-88`: localStorage 목록 캐시 TTL 이 **24시간**이다. 복원하면 메모리에 45초 「신선」으로 올라간다 (`:333-350`).
- 캐시 적중 경로는 네트워크 재검증 없이 종료한다 (`components/post/PostListByCategory.tsx:647`).
- 판매완료·숨김·삭제 글이 구매자 목록에 남아, 탭하면 없는 글로 들어간다.
- 증거:
  - 16:31 PHT 숨김 처리된 ② 글이 17:11 PHT 태블릿 목록에 표시됐다 (`LIST01-tablet-hidden-post-before.jpg`).
  - 당겨서 새로고침하자 사라졌다 (`LIST01-tablet-after-refresh.jpg`).

### 2-B. 거래방 시스템 메시지 — SYS-01 (P2, Owner 지적)

예약 시 기록되는 「제품의 상태가 예약중으로 변경되었습니다」 행 (`SYS01-samsung-system-message.jpg`, iPhone 동일).

| # | 현상 | 원인 |
|---|---|---|
| 1 | 본문과 날짜가 한 줄로 이어지고, 날짜가 「오/전 8:08」로 중간에서 끊긴다 | 본문에 `\n` 으로 날짜를 붙여 저장하는데, 행이 `white-space: normal` 이라 줄바꿈이 사라진다 (`MessengerTimelineVirtualRow.tsx:617-620`) |
| 2 | 시각이 틀렸다: 실제 16:08 PHT 인데 「오전 8:08」 | 서버(UTC)에서 `toLocaleString("ko-KR")` 을 timeZone 없이 호출해 **UTC 시각 문자열을 본문에 박아** 저장한다 (`lib/chat/postSellerListingChangeNotice.ts:9-17`, `lib/trade/insert-seller-listing-change-system-messages.ts:102`) |
| 3 | 「예약중」이 강조되지 않는다 | 상태값이 문장 속 평문이다. `metadata: {}` 라 구조화된 상태 정보가 없다 |
| 4 | 두 줄 글자가 `rounded-full` 알약 모양 안에 들어가 좌우가 행 밖으로 밀린 듯 보인다. 색은 하드코딩이다 | `systemBubbleClass = "rounded-full bg-white … text-[#6B7280]"` (`:453-454`). 반경 규칙 위반(여러 줄은 pill 금지), 토큰 미사용 |
| 5 | 한국어 하드코딩 | 다국어 키 미사용 |

### 2-C. 기기 경계 이탈 (safe-area)

| ID | 등급 | 화면 | 현상 | 확정 근거 | 원인 |
|---|---|---|---|---|---|
| UX-01 (=NF-11) | P2 | 채팅 준비 화면 | 썸네일·제목이 Dynamic Island 와 겹친다. 하단 버튼 아래 약 94px 빈 띠 | Owner 첨부 + 코드 | `TradeChatComposePreparingShell.tsx:29` 헤더 safe-top 없음. `app/(main)/mypage/trade/layout.tsx:9-13` 이 하단탭 없는 라우트에도 탭 여백을 넣는다 |
| UX-02 | P2 | 위치 선택 | 뒤로·제목·검색이 상태바와 겹친다 | 2기기 DOM top=2 + 캡처 | `TradeBrowseLocationPageShell.tsx:27-29` `DefaultHeader embedded` → `sector-header.css:71-75` `padding-top:0` |
| UX-03 (=NF-9) | P2 | 신고 사유 전체 시트 | 제목·× 가 상태바와 겹친다 | 이전 회차 `NF9-steady.jpg` + 코드 | `DibayFullSheet.tsx:65,93` stage top 0 + 헤더 safe-top 없음 |
| UX-08 | P2 | `/market` 토스트 | Samsung: 토스트 하단 736px > 탭 상단 724px (12px 겹침). iPhone: 오빗과 6px 겹침 | 2기기 실측 | `PostListByCategory.tsx:1019` `bottom-24` 고정 px |

### 2-D. CTA·상태 표시

| ID | 등급 | 현상 | 확정 근거 | 원인 |
|---|---|---|---|---|
| CTA-08 (=NF-1 재정의) | P2 | 상세의 구매자 주 CTA(문의 카드)가 카테고리에 따라 **첫 화면 밖**에 있다. 중고차: 카드 top 940 > 화면 932. 일반: 첫 화면 맨 아래 홈 표시줄에 걸리고 판매자 행이 잘린다. 환전: 698 로 보인다 | iPhone 실측 2건 + 캡처 2장 | 카드가 설명·스펙 표 **아래**(`PostDetailView.tsx:1473`)에 있어 스펙 길이만큼 밀린다 |
| CTA-02 (=NF-2) | P2 | 「보내기」가 방만 열고 문구를 보내지 않는다 | DB + 코드 | `TradeDetailInlineChatCard.tsx:34` `draft` 가 카드 내부 상태. `onSend()` 에 문구를 넘기지 않는다 |
| CTA-01 | P2 | 판매완료·예약중이면 버튼만 회색이 되고 이유가 보이지 않는다. 입력란은 「아직 판매 중인가요?」 그대로 | 태블릿 캡처 + 코드 | 사유가 `title` 툴팁뿐 (`TradeDetailInlineChatCard.tsx:89`) |
| CTA-03 | P2 | `/market?q=` 결과 화면에 검색어가 어디에도 없다 | Samsung DOM `hasQ:[] textHit:false` | 툴바에 조건 칩 없음 |
| SHEET-01 (=NF-4 정정) | P2 | 필터 시트 「결과 보기」가 글자 폭(85px)으로 왼쪽에 붙고, 구분선 없이 스크롤 본문(가격 입력)이 그 뒤로 잘린다. Samsung·태블릿 공통 | Samsung DOM `btn 17–102` + 캡처 2장 | `DibayBottomSheet.tsx:171` footer 래퍼가 `<div className="shrink-0">`(block) 이라 버튼의 `flex:1` 이 무효다 (`dibay-overlay.css:333-337`). footer 상단 구분선 없음 |
| CTA-04 (=NF-10) | P3 | 판매 허브 「＋ 판매하기」 vs 내 매물 하단 「판매하기」(＋ 없음) | 캡처 2장 | 내 매물이 `TradeSellCta` 를 쓰지 않는다 |
| CTA-05 | P3 | 내 매물 카드마다 「거래 상위노출」이 진녹 채움 → 주 CTA 가 N+1 개 | 캡처 | CTA 위계 규격 부재 |
| CTA-06 (=NF-7) | P3 | 판매자 본인 거래방 안내에 「판매자 프로필 보기」 | Samsung 거래방 캡처(A=판매자) | 역할 분기 누락 |
| CTA-07 | P3 | 관련 매물 카드에 「판매중 \| For sale」 한·영 칩 중복 | 캡처 | 칩 소스 2개 동시 렌더 |

### 2-E. 토큰·반경 (P3, 코드 확정)

- 색:
  - `bg-red-50`·`text-red-*`·`text-amber-*`·hex 직접 지정. 대상: `TradeChatComposePreparingShell.tsx:49-57`, `PostDetailMoreBottomSheet.tsx:132`, `PostDetailSellerMoreSheet.tsx:104,128`, `PostListMenuBottomSheet.tsx:141,159,190`, `PostDetailView.tsx:1163`, `TradeReviewWriteSheet.tsx:153`, `TradeWriteForm.tsx:2186-2190`, `PostCard.tsx:73,84`, `PostListPreviewColumn.tsx:68,79`, `TradeListLoadMoreFooter.tsx:40-44`, `PostDetailRelatedSections.tsx:119`.
- 레거시 셸:
  - `TradeChatLoadingShell.tsx:43,56-62,70` (safe-area·`rounded-2xl bg-emerald-50`). 거래방은 서버 리다이렉트로 이 셸이 보이지 않아 P3 로 내린다.

### 2-F. 철회·제외 (근거 포함)

| 항목 | 판정 | 근거 |
|---|---|---|
| Samsung 상세 구매자 CTA 없음 | 철회 | 측정 정규식 누락. `inline-chat` 슬롯 정상 |
| 구매내역 → 거래채팅 이동 | 제외 | 의도된 설계 |
| NF-6 「dock 미마운트 버그」 | PR-01 로 정정 | 08-20 의도적 제거, 기능 이전 누락이 실제 결함 |
| NF-4 「하단탭에 가려짐」 | SHEET-01 로 정정 | 시트 하단 = 탭 상단 (601×0.78−60 = 408px 높이, top 117 실측 일치) |
| UX-04 거래내역 슬라이드 패널 | 제외 | 여는 버튼(`TradeHeaderComposeButton`)이 G6 이후 마운트 0곳. 도달 경로 없음 |
| NF-1 「키보드」 가설 | CTA-08 로 재정의 | 원본 캡처는 키보드 없는 첫 화면이다. 끝까지 스크롤하면 마지막 콘텐츠 882 < 898 로 정상 |
| NF-3 ⑥ 방 생성 | 제외 | 원인 재현 불가. 단일 관측이라 결함으로 올리지 않는다 |

## 3. 통일 규격

### R1. 상단
1. 전역 헤더가 숨겨진 라우트(`suppressMainTier1`)는 비 embedded `.sector-header-shell` 또는 `.app-safe-top` 을 반드시 쓴다.
2. `embedded` 는 부모가 safe-top 을 준 경우만 허용한다.
3. top 0 에서 시작하는 전체 시트는 헤더에 safe-top 을 준다.

### R2. 하단
1. 고정 CTA·입력: `pb-[max(기본, var(--safe-bottom))]`. 키보드가 열리면 `max(safe-bottom, inset)`.
2. 본문 하단탭 여백은 `isBottomNavEligibleRoute` 가 true 인 라우트에만 준다.
3. 시트 footer 는 전폭 flex 행 + 상단 구분선. `DibayBottomSheet` 가 footer 를 `flex` 래퍼(`OverlayUi.actionsRow`)로 감싼다.
4. 토스트·플로팅: `bottom: calc(var(--app-bottom-nav-height) + var(--safe-bottom) + 오빗 상승 + 12px)` 토큰 하나로 고정한다.

### R3. CTA
1. 화면당 주 CTA(진녹 채움) 1개. 나머지는 테두리(보조)·텍스트(3차).
2. 판매 진입은 어디서나 `TradeSellCta`(＋ 판매하기).
3. 구매자 주 CTA 는 **첫 화면 안**: 상세 문의 카드는 가격·제목·위치 블록 **바로 아래**(Facebook Marketplace 순서).
4. 비활성 CTA 는 보이는 사유 한 줄을 표시한다.
5. 문구 = 결과. 「보내기」는 실제로 보낸다.

### R4. 상태 표시
1. 상태칩 1개, 한 언어.
2. 검색·필터 조건은 툴바 칩으로 항상 표시하고, ✕ 로 해당 조건만 지운다.
3. 시스템 메시지는 **구조화 메타데이터 + 클라이언트 렌더**로 만든다.
   - 본문에 시각을 박지 않는다. 시각은 `created_at` 을 기기 시간대로 표시한다.
   - 상태값은 칩으로 강조한다: 예약중 = `--sam-warning-soft` 바탕 + `--sam-warning` 굵게 / 판매완료 = muted 바탕 + fg 굵게 / 판매중 = `--sam-primary-soft` + primary 굵게.
   - 문장과 시각은 **별도 행**으로 둔다.
   - 컨테이너는 4px 반경 카드(여러 줄 pill 금지), `max-w-[min(100%,22rem)]`, `whitespace-pre-line` 을 쓴다.

### R5. 토큰
- 색은 `sam-*` 만 쓴다.
- 반경: 붙은 요소 4px, 떠 있는 시트 12–24px, 한 줄 원·pill 만 `rounded-full`.

### R6. 목록 정합
- 캐시(메모리·session·local) 시드 뒤에는 **항상 1회 백그라운드 재검증**을 한다. `getPostsForHome` 단일 비행·같은 cacheKey 로 하고, 목록 불변조건 §9 를 지킨다.
- 상태가 바뀐 글은 결과로 교체한다.

## 4. 수정 설계 (묶음 · 순서 · 검증)

| 묶음 | 대상 | 수정 | 파일 | 회귀 위험·대응 | 실기기 검증 |
|---|---|---|---|---|---|
| **F1** (P1, 메신저 단독 커밋) | PR-01 | 헤더 상품 행 아래 **조건부 행동 줄**. 구매자는 판매완료 뒤 「거래완료 확인」 → 「후기 쓰기」. 판매자는 예약·판매완료(구매자 선택)·「후기 쓰기」. 할 일이 없으면 렌더하지 않는다. `CommunityMessengerTradeProcessSection` 상태 로직·기존 API 를 재사용한다. 메신저 href 에 `openReview` 를 전달하고 방에서 후기 시트를 연다 | `CommunityMessengerRoomPhase2Header.tsx`(또는 Composer), `CommunityMessengerTradeProcessSection.tsx`(compact), `trade-chat-surface.ts` | 방 뷰포트·키보드 계약 문서 §7 이력 기록, `verify:cm-room-keyboard-layout-contract` | 2계정: 예약→판매완료→확인→양측 후기, 알림 딥링크 |
| **F2** (P2) | PR-02 + SYS-01 서버 | 판매완료 경로를 `seller-listing-state` 와 **같은 서버 함수**로 합친다(방 요약 갱신 + broadcast + 시스템 메시지). 시스템 메시지는 `body` 에서 시각을 빼고 `metadata: {domain:"trade", kind:"listing_change", listingState}` 로 기록한다 | `seller-complete/route.ts`, `insert-seller-listing-change-system-messages.ts`, `postSellerListingChangeNotice.ts` | 알림 중복: 기존 알림 1회 유지 테스트 | 열린 방·재진입 방 3초 내 반영, 시스템 메시지 1건 |
| **F3** (P2, 메신저 단독 커밋) | SYS-01 클라이언트 | `TradeListingChangeSystemRow` 를 새로 만든다. 문장 행 + 상태 칩(굵게·배경) / 시각 행(`created_at`, 기기 시간대). 레거시 본문은 `chat-list-last-message-display.ts` 정규식으로 상태를 추출하고 박힌 시각은 버린다. 일반 시스템 행은 `whitespace-pre-line` + 4px 카드 + 토큰 | `MessengerTimelineVirtualRow.tsx`, 새 컴포넌트, i18n 키 | 레거시 메시지 3형식 단위 테스트 | iPhone·Samsung 캡처: 2행·강조·PHT 시각 |
| **F4** (P2) | UX-01·02·03·08 | R1·R2 적용: compose 헤더 `.app-safe-top`, 위치 셸 비 embedded, `DibayFullSheet` 헤더 safe-top, `mypage/trade/layout` 탭 여백 조건부, 토스트 토큰 | 5개 파일 | `DibayFullSheet` 사용처 전수 확인 | 2기기 DOM 침범 0건 |
| **F5** (P2) | SHEET-01 | `DibayBottomSheet` footer 를 flex 행 + 상단 구분선으로 감싼다 (모든 시트 공통) | `DibayBottomSheet.tsx`, `dibay-overlay.css` | 다른 시트 footer 전수 캡처 | Samsung·태블릿 버튼 전폭 |
| **F6** (P2) | CTA-08·01·02 | 문의 카드를 제목·가격·위치 블록 아래로 옮긴다. 막힌 상태는 사유 행 + 3차 CTA. 「보내기」는 문구를 넘겨 방 생성 후 1회 전송(중복 방지 키), 실패 시 방 입력창에 복원 | `PostDetailView.tsx`, `TradeDetailInlineChatCard.tsx`, 채팅 시작 클라이언트 | 중복 전송: idempotency 키 | 3카테고리 첫 화면 CTA, 3상태 캡처, 1회 = 1건 |
| **F7** (P2, 성능 민감 → 해당 verify 필수) | LIST-01 | 캐시 시드 뒤 1회 백그라운드 재검증(R6) | `PostListByCategory.tsx`, `getPostsForHome.ts` | `/market` 불변조건 §9·prewarm 키 일치 테스트 | 숨김 처리 → 다른 기기 목록 복귀 시 사라짐 |
| **F8** (P2) | CTA-03 | 검색어 칩(✕ = q 만 제거, ↺ TM-35 유지) | 마켓 툴바 | TM-35 테스트 | q 표시·✕·↺ |
| **F9** (P3) | CTA-04·05·06·07, PR-03, 2-E | `TradeSellCta` 통일, 상위노출 보조 버튼, 역할 분기, 칩 단일화, 저장 후 `router.refresh()`, 토큰 치환 | 각 파일 | 시각 변화 | 캡처 대조 |

- **반영**: 묶음마다 단독 커밋. 메신저(F1·F3)는 메신저 도메인 단독으로 반영한다. 통화 코드는 건드리지 않는다.
- **검증**: 매 회 Production SHA 기록 → 3기기 DOM 측정 + 캡처 → 프로세스 ①~⑦ 2계정 1회. 상태 변경 실기기 테스트는 실행 전 Owner 승인을 받는다.
- **롤백**: 묶음별 `git revert`. F2 는 DB 스키마 변경 없이 `metadata` 컬럼 값만 바뀐다(기존 jsonb).
- **수정 후 iPhone 키보드 확인 조건**: iPhone 미러링 창이 보조 모니터에 있으면 실제 탭이 전달되지 않는다. 검증 때 미러링 창을 주 화면에 두어야 한다.

## 5. 수정 반영·실기기 재검증 결과 (2026-10-27 18:15 PHT)

- 반영: main `c645a9999`(F1–F9 11커밋) → `c31a90f48`(CTA-06 재수정). Production READY 확인(Vercel). 웹 전용 — 앱 재시작만.
- 로컬 검증: `typecheck:build`·`typecheck:test` PASS, 변경 관련 vitest 전부 PASS, 변경 파일 eslint 오류 0,
  `verify:cm-room-keyboard-layout-contract`·`verify:cm-room-entry-scroll-contract`·`verify:messenger-hot-path-contract`·`verify:trade-hot-path-contract`·`verify:trade-detail-bottom-safe-contract` PASS.
- 테스트 계정: A=Samsung(판매자) · B=iPhone(구매자) · C=태블릿. 테스트 상품 ⑦ `a2fdf8ed`(프로세스) · ⑧ `b6e7669e`(목록 정합) — 종료 후 둘 다 숨김.

| 항목 | 결과 | 실측 근거 |
|---|---|---|
| UX-02 위치 헤더 | PASS (iPhone·Samsung) | 헤더 침범 0건(남은 `img` 는 overflow-hidden 지도 타일) |
| UX-01 채팅 준비 화면 | PASS (iPhone) | 첫 글자 top 76 > safe 59, 하단 바 931/932(빈 띠 없음) |
| UX-03 신고 시트 | PASS (iPhone) | 제목 top 75 > 59 |
| UX-08 토스트 | PASS (Samsung) | 토스트 하단 697 < orbit 716 < 탭 724 |
| SHEET-01 필터 시트 | PASS (Samsung·태블릿) | 버튼 17–367px 전폭 + 상단 구분선, 태블릿 캡처 동일 |
| CTA-08 문의 카드 위치 | PASS (iPhone) | 중고차 상세 카드 532–654(이전 940, 화면 932) |
| CTA-02 「보내기」 전송 | PASS | 보내기 1회 → 새 방 메시지 1건(DB) |
| CTA-01 막힘 사유 | PASS (iPhone) | 판매완료 상세: 입력란 대신 「거래완료 상품입니다」 |
| CTA-03 검색어 칩 | PASS (iPhone) | 「검색: test」 표시, ✕ → `q` 만 제거·지역 유지 |
| CTA-04·05 내 매물 CTA | PASS (Samsung) | 하단 「＋ 판매하기」, 상위노출 `sam-btn--secondary` |
| CTA-06 프로필 문구 | PASS (재수정 후) | 판매자 A: 「구매자 프로필 보기」(2개 방) · 구매자 B: 「판매자 프로필 보기」 |
| CTA-07 칩 언어 | PASS (iPhone) | 관련 매물 「For sale」 0 · 「팝니다」 11 |
| SYS-01 시스템 행 | PASS (iPhone·Samsung) | 「상품 상태 변경 [예약중]」/「6:05 PM」 2행, 시각 PHT 정확, 레거시 메시지도 같은 모양 |
| PR-03 수정 후 상세 | PASS (Samsung) | 저장 직후 상세 제목 즉시 갱신 |
| PR-01 행동 줄 | PASS | 판매자: 「거래 단계」 접힘 줄→예약중→판매완료 / 구매자: 할 일 없을 때 미표시 → 판매완료 후 「거래완료 확인」 → 「평가·후기 보내기」 |
| PR-02 판매완료 반영 | PASS | 두 방에 실시간 시스템 행, 방 요약 `itemStateLabel=거래완료`, 메타 `listingState` 기록(DB) |
| 프로세스 ①~⑦ | PASS | 등록→수정→문의(전송)→예약→판매완료→거래완료 확인→후기 = DB `review_completed` |
| LIST-01 목록 정합 | PASS (iPhone) | 상세 진입 중 숨김 → 뒤로 오자 목록에서 제거, `/api/posts/listing-visibility` 1회(목록 재조회 없음) |

### 설계 대비 조정 (근거)

- PR-01 후기 딥링크(`openReview`) — **넣지 않음**: CUT D 계약(후기 deep-link 제거, 후기 작성은 거래 채팅 안에서만)이 테스트로 고정. 방 안 「평가·후기 보내기」로 충족.
- SHEET-01 — 공용 `DibayBottomSheet` 대신 **거래 필터 시트만** 수정: 공용 시트는 매장·배달·관리자 17곳이 사용(타 도메인 혼합 금지). 다른 거래 시트 2곳은 이미 정상.
- UX-05 로딩 셸 — 색·반경 토큰만: `ChatRoomScreen` embedded 모드에서 safe-area 이중 여백 위험, 거래방은 서버 리다이렉트로 이 셸이 보이지 않음.
- CTA-06 — 1차(`d1a8568a4`) summary `roleLabel` 보정은 실측 FAIL(원본값이 방 생성자 기준) → 거래방 상세 캐시로 확정하도록 재수정(`c31a90f48`).
- LIST-01 — 원인 정정: `PostListByCategory` 캐시 경로는 비활성(즉시 false). 실제 경로는 `/market`(`HomeProductList`) 목록 세션 복원·24h 캐시 + CUT H 무삭제.
- 판매자 후기 — 서버 계약상 후기는 구매자만(`isTradeReviewWriteEligible`). 신규 기능 추가 없음.

### 시험 중 발생·정리

- 신고 시트 측정 중 사유 1탭이 즉시 접수되는 기존 설계로 테스트 신고 1건(`c9fbffc7`, B→타인 글) 생성 → 기존 정리 방식대로 `rejected` 처리, 해당 시각 알림 발송 0건 확인.
- 테스트 상품 ⑦·⑧ 숨김. ⑦ 거래의 B→A 구매 후기 1건은 테스트 계정 간 기록으로 남음.

### 범위 밖 (보고만)

- `verify:trade-primary-tab-transition` 실패 — origin/main 에서도 동일(TradePrimaryTabs·CommunityFeed 규칙), 이번 변경과 무관.
