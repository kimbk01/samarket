# P4 — 메신저 채팅 글자 크기·시각 표기 독립 검증 + 구현 설계

- 기준 트리: `main` HEAD `0360f85ca` (2026-11-18). 읽기 전용 검토. DB·외부 서비스·저장소 수정 없음.
- 판정 범위: **코드 PASS/FAIL만**. 실기기 글자 높이는 호출자가 준 측정값(Samsung 2.8125 px/dp, 레거시 글자 크기 설정 16)을 그대로 썼다. 실기기 재측정은 하지 않았다 → 실기기 판정은 전부 **NOT_PROVEN**.
- 이미 있는 감사 `docs/audit/messenger-chat-full-audit-ssot-design-2026-11-18.md` §4 를 읽고 대조했다. 그 문서의 오류는 §0 에 따로 적었다.

---

## 0. 기존 감사(§4)에서 찾은 오류·누락 (먼저 적음)

| # | 기존 감사 문서의 주장 | 실제 코드 | 판정 |
|---|---|---|---|
| E1 | 「목록 미리보기 13px `sam-text-helper` `MessengerChatListItem.tsx:1116`」 | `:1116` 은 **거래·주문 보조 줄**(`commerceSubline`)이다. 실제 미리보기는 `:1140` `<p data-cm-list-preview className="min-w-0 truncate font-normal">` — 글자 크기 클래스 없음 → `app/messenger-presentation.css:309` `font-size: var(--cm-list-preview-size)` = `:220` **13.5px** (행에 `surface="chat"` → `data-cm-list-surface="chat"`, `messenger-list-row.tsx:59`) | 근거 줄 틀림. 값은 13.5px (13 근사) |
| E2 | 「목록 이름 상속 16」 | 상속이 아니라 `messenger-presentation.css:302` `font-size: var(--cm-list-title-size)` = `:218` 16px | 근거 틀림. 값은 맞음 |
| E3 | D4-a 「목록 미리보기 15」로 바꿈 | 현재 13.5px 은 **Owner 승인 시안**: `messenger-presentation.css:208` 「대화 목록 기본 행 … 이름 16 · 미리보기 13.5 · 시각 11.5」, `chat-list-kakao-time.ts:4` 「채팅 시안 4판 (Owner 「정확히 시안대로」 2026-11-10)」 | **승인 설계와 충돌 — 기존 감사는 충돌로 보고하지 않음** (AGENTS 허위보고 금지 7번) → Owner 결정 필요 |
| E4 | 「입력창 글자도 본문과 같은 16」 (현재값 언급 없음) | 메신저 경로에서는 이미 16px(`messenger-presentation.css:399-401` `!important`). 그러나 **안내 글(placeholder)은 14px**(`globals.css:269-276`), 그리고 **주문 채팅 슬라이드(`/my/store-orders`·사장님 주문) 콜드 진입에서는 16px 규칙 파일이 안 실림** → §A-3 | 누락 |
| E5 | 시각 통일안 「한 함수로」 | 그 함수를 쓰는 `lib/community-messenger/call-log-row-copy.ts` 가 **통화 변경 규정 1번 적용 범위**(`lib/community-messenger/call*`) | 규정 충돌 누락 → §B-6 |
| E6 | — | 날짜 구분선이 **영어 화면에서도 한국어**: `CommunityMessengerRoomPhase2MessageTimeline.tsx:565` `new Intl.DateTimeFormat("ko-KR", …)` (언어 SSOT 3번 「다른 언어로 대체하지 않는다」 위반) | 누락 결함 (범위 밖이면 보고만) |
| E7 | — | 머리글 「마지막 접속 …」·「온라인」·「자리 비움」·「오프라인」 한국어 고정: `format-messenger-peer-presence-line.ts:18-26` (i18n 기준선 `i18n-quality-baseline.json:452` 에 6건 등록된 기존 결함) | 누락 결함 (보고만) |

---

## PART A — 코드에서 실제 적용되는 글자 크기

### A-0. 토큰 → px 해석표

| 토큰/클래스 | 정의 | px | 줄 높이 |
|---|---|---|---|
| `sam-text-xxs` | `samarket-components.css:105-109` → `--sam-text-xxs-size`(`design-tokens.css:240`) → `--sm-font-caption`(`:49`) | **12** | `--sm-lh-caption` 1.3 (`:66`) |
| `sam-text-helper` | `samarket-components.css:98-102` → `--sam-text-helper-size`(`:238`) → `--sm-font-meta`(`:48`) | **13** | 1.4 (`:65`) |
| `sam-text-body-secondary` | `:91-95` → `--sm-font-body-compact`(`:47`) | **13** | 1.45 |
| `sam-text-body` | `:85-89` → `--sm-font-body`(`:46`) | **14** | 1.5 |
| `--sector-header-title-size` | `app/sector-header.css:45` | **17** (테스트 고정: `lib/layout/__tests__/sector-header-symmetric-grid.test.ts:51`, `chat-v4-header-scope.test.ts:24`) | 22px (`:46`) |
| `--sector-header-h` | `sector-header.css:17` | 52 | — |
| `--cm-list-title-size` (chat 행) | `messenger-presentation.css:218` | 16 | 1.3 |
| `--cm-list-preview-size` (chat 행) | `:220` | 13.5 | 1.35 |
| `--cm-list-meta-size` (chat 행) | `:222` | 11.5 | 1.2 (`:316`) |
| body 기본 | `globals.css:163` `var(--sam-text-body-size)` | 14 | 1.5 |
| 입력칸 기본(레이어 밖) | `globals.css:255-267` textarea `font-size: var(--sam-text-body-size)` | 14 | — |
| placeholder(레이어 밖) | `globals.css:269-276` `var(--sam-text-placeholder-size)` → `--sm-font-placeholder` 14 (`design-tokens.css:52`) | 14 | 1.45 |

### A-1. 대화방 (`/community-messenger/rooms/[roomId]`, 렌더러 `MessengerTimelineVirtualRow.tsx`)

| 요소 | 코드 (file:line) | 적용 px | 레거시 측정 | 판정(코드 대비 측정) |
|---|---|---|---|---|
| 텍스트 말풍선 본문 (수신·발신 동일) | `MessengerTimelineBubbleInners.tsx:283` `text-[14px] leading-[1.35]` | **14** | 16 | FAIL |
| 스티커 | `BubbleInners.tsx:47-54` 이미지 `h-36 w-36`(144px), 글자 없음 | — | — | 해당 없음 |
| 이모지만 보낸 메시지 | 전용 처리 없음 (`grep emojiOnly/jumbo` 0건) → 일반 본문 14px | 14 | 측정 없음 | NOT_PROVEN (레거시는 큰 이모지 — 글자 토큰이 아닌 기능 차이, 범위 밖 보고) |
| 링크 미리보기 | 미리보기 카드 없음. 링크는 본문 안 밑줄만 `MessengerLinkifiedText.tsx:50` `text-inherit` | 14 (본문 상속) | — | 해당 없음 |
| 답장 인용 머리(이름) | `MessengerTimelineVirtualRow.tsx:464` `sam-text-xxs font-bold` | **12** | 14 | FAIL |
| 답장 인용 본문 | `:469` `sam-text-xxs` | **12** | 14 | FAIL |
| 「전달됨」 | `:615` `sam-text-xxs` | **12** | 측정 없음 | NOT_PROVEN |
| 그룹 발신자 이름 | `:797` `text-[12px] font-medium` | **12** | 측정 없음 | NOT_PROVEN |
| 시각 (말풍선 밖, 발신) | `:810` `text-[11px]` | **11** | 12 | FAIL |
| 시각 (말풍선 밖, 수신) | `:827` `text-[11px]` | **11** | 12 | FAIL |
| 시각 (사진 위) | `:646` `text-[11px]` | 11 | 12 | FAIL |
| 시각 (통화 줄 옆) | `:664` `text-[11px]` | 11 | 12 | FAIL |
| 시각 (음성 말풍선 안) | `VoiceMessageBubble.tsx:356` `sam-text-xxs` | 12 | 12 | PASS(코드) |
| 「안 읽음」 | `:815` `text-[11px]` | 11 | 측정 없음 | NOT_PROVEN |
| 「전송 중」 텍스트 말풍선 | `BubbleInners.tsx:291` `text-[11px]` | 11 | 측정 없음 | NOT_PROVEN |
| 「전송 중」 스티커·사진 | `BubbleInners.tsx:57`, `MessengerChatImageBubble.tsx:155,339` `sam-text-xxs` | 12 | — | NOT_PROVEN |
| 그룹 읽음 수 | `:817` `text-[11px]` | 11 | 측정 없음 | NOT_PROVEN |
| 반응 수 | `:503` `sam-text-xxs` (이모지 `text-base` 16) | 12 | — | NOT_PROVEN |
| 날짜 구분 | `:723` `text-[12px] leading-tight` (굵기 없음) | **12, 보통** | 14 굵게 | FAIL (크기·굵기) |
| 「여기까지 읽음」 구분 | `:736` `text-[12px] font-medium` | 12 | 측정 없음 | NOT_PROVEN |
| 시스템 문구 | `:767` `sam-text-helper leading-5` | **13** | 14 | FAIL |
| 통화 줄 제목 | `BubbleInners.tsx:243` `text-[13px] font-semibold` | 13 | 측정 없음 | NOT_PROVEN |
| 통화 줄 「발신/수신」 | `BubbleInners.tsx:245` `text-[11px]` | 11 | — | NOT_PROVEN |
| 거래 글 변경 줄 | `MessengerTradeListingChangeSystemRow.tsx:33` `sam-text-helper` / 시각 `:37` `sam-text-xxs` | 13 / 12 | 14(서비스 문구) | FAIL(13) |
| 주문 상태 줄 | `MessengerTimelineVirtualRow.tsx:877` `text-[12px]` | 12 | 14(서비스 문구) | FAIL |
| 주문 요약 카드 | `MessengerStoreOrderSummaryCard.tsx:58,60` `text-[12px]` | 12 | — | NOT_PROVEN (카드라 서비스 문구와 같은지 Owner 판단) |
| 파일 말풍선 | `BubbleInners.tsx:120` 14 / `:123` 12 / `:131` 13 | 14/12/13 | — | NOT_PROVEN |
| 입력 중 줄 | `CommunityMessengerRoomPhase2MessageTimeline.tsx:2330` `sam-text-helper font-semibold` / 이니셜 `:2325` 11 | 13 | 측정 없음 | NOT_PROVEN |
| 공지 바 | `Timeline.tsx:2019-2020` xxs 12 / helper 13 | — | — | NOT_PROVEN |
| 입력창 글자 | `messenger-composer-sector.tsx:224` `text-[16px]` — 레이어 밖 `globals.css:255-267`(14px)이 Tailwind 유틸(레이어 안)을 이김(`globals.css:256-257` 주석이 스스로 확인) → `messenger-presentation.css:399-401` `16px !important` 로 복구 | **16** (메신저 경로) | 측정 없음 | 코드 16 |
| 입력창 안내 글 | `globals.css:269-276` → 14; 메신저 전용 덮어쓰기 없음 | **14** | 측정 없음 | NOT_PROVEN |
| 입력창 답장 미리보기 | `CommunityMessengerRoomPhase2Composer.tsx:502` xxs 12 / `:505` helper 13 | 12/13 | — | NOT_PROVEN |
| 머리글 이름 | `CommunityMessengerRoomPhase2Header.tsx:392,420,449,475,482` `text-[length:var(--sector-header-title-size)]` | **17** | ≈18 (라틴 대문자 높이 추정) | 1px 차 — 측정 방법 불확실 |
| 머리글 상태 줄 | `Header.tsx:396,423,452,474,486` `sam-text-xxs` | **12** | 13~14 | FAIL |
| 배달 방 머리글 | `StoreOrderDeliveryMessengerHeaderBlock.tsx:62` 17 / `:66` xxs 12 | 17/12 | — | 위와 같음 |

### A-2. 대화 목록 (`MessengerChatListItem.tsx`, `listVisual="default"`)

| 요소 | 코드 | 적용 px | 측정 | 판정 |
|---|---|---|---|---|
| 방 이름 | `:1080` `data-cm-list-title` → `messenger-presentation.css:302` → `:218` | **16** | 16 | PASS(코드·측정 일치) |
| 미리보기 | `:1140` `data-cm-list-preview` → `:309` → `:220` | **13.5** | ≈15 | FAIL (단, 승인 시안 값 — E3) |
| 시각 | `:999-1004` `data-cm-list-meta` (클래스 크기 없음) → `:315` → `:222` | **11.5** | 측정 없음 | NOT_PROVEN |
| 시각 (거래·주문 목록) | `:981` `text-[11.5px]` | 11.5 | — | NOT_PROVEN |
| 안 읽음 배지 | `:1021` / `:989` `text-[11px] font-bold`, 높이 `--cm-list-unread-min` 20px | 11 | 측정 없음 | NOT_PROVEN |
| 인원 수 | `:1089` `text-[14px] font-medium` | 14 | 측정 없음 | NOT_PROVEN |
| 거래·주문 보조 줄 | `:1116` `sam-text-helper` | 13 | — | — |
| 거래 목록 행 | `trade-chat-list/TradeChatListRowContent.tsx:41` 16 / `:51` 12.5 / `:59` 13.5 | | | 시안 값 |
| 주문 목록 행 | `delivery-chat-list/DeliveryChatListRowContent.tsx:37` 16 / `:46` 13.5 | | | 시안 값 |

### A-3. 루트 배율·OS 글자 크기

- `globals.css:142-143` `-webkit-text-size-adjust: 100%; text-size-adjust: 100%` → 브라우저 자동 확대 끔. `html` 에 font-size 지정 없음(16px 기본, rem 미사용 — 채팅 글자는 전부 px).
- `app/layout.tsx:101-107` viewport `width=device-width, initialScale 1, maximumScale 5`.
- Android: `android/app/src/main/java/com/dibay/app/*` 에 `setTextZoom`/`TextZoom` **0건**, `node_modules/@capacitor/android` 에도 0건, `@capacitor/text-zoom` 의존성 없음(`package.json:326-378`). → WebView 기본 textZoom 그대로. **OS 글자 크기가 실제로 반영되는지는 확인 못 함(NOT_PROVEN)** — Samsung 글자 크기를 바꿔 같은 화면을 재측정해야 판정 가능.
- iOS: `ios/App/App` 에 Dynamic Type 관련 코드 0건. 글자가 px 고정이라 WKWebView 는 Dynamic Type 을 따르지 않는다(코드 근거: `-apple-system-body` 등 사용 없음). 실기 NOT_PROVEN.
- iOS 입력칸 16px 하한: `globals.css:1317-1329` `@supports (-webkit-touch-callout:none)` `max(16px, …) !important`.
- **설계 문서 충돌**: `docs/customer-platform/04-DESIGN-SYSTEM.md:45` 「Dynamic Type | 시스템 글자 크기 존중; 고정 px만으로 본문 잠그지 않음(토큰 스케일)」 ↔ 실제 코드는 px 고정·textZoom 미설정. 계약 미이행 → 보고(이번 범위에서 고칠지는 Owner 결정).
- **CSS 로딩 범위 결함 위험**: `messenger-presentation.css` 는 `app/(main)/community-messenger/layout.tsx:2` 에서만 import. 같은 방 컴포넌트를 쓰는 `components/mypage/BuyerStoreOrderChatSlidePanel.tsx`·`components/business/owner/OwnerStoreOrderChatSlidePanel.tsx`(주문 채팅 슬라이드) 를 콜드로 열면 `:399-401` 16px `!important` 와 목록 토큰이 없다 → Android 입력 글자 14px(위 레이어 규칙) 예상. 코드 추론, 실기 NOT_PROVEN. 새 토큰을 `messenger-presentation.css` 에 두면 같은 결함이 난다 → 토큰은 전역 `design-tokens.css` 에 둬야 한다(04-DESIGN-SYSTEM.md:35 「신규 색·타이포·반경 트리를 `app/design-tokens.css` 밖에 두지 않는다」와도 일치).

### A-4. 다른 렌더 경로와 범위

AGENTS 「사용자 대면 채팅은 3종만」(`lib/chat-domain/samarket-three-chat-pillars.ts`).

| 경로 | 렌더러 | 범위 |
|---|---|---|
| 커뮤니티 메신저 방 | `MessengerTimelineVirtualRow` | **포함** |
| 거래 채팅 | `app/(main)/chats/[roomId]/page.tsx:69-79` CM 연동이면 메신저 방으로 redirect, 미연동 거래는 목록으로 redirect → 같은 렌더러 | **포함** (같은 파일) |
| 주문 채팅(store_order) | `page.tsx:66-67` 연동 시 `orderMessengerRoomHref` → 같은 렌더러, 행은 `StoreOrderOpsSystemRow`·`MessengerStoreOrderSummaryCard`. 주문 슬라이드 패널도 같은 방 컴포넌트 | **포함** |
| `/chats/[roomId]` 나머지(미연동 주문·일반) | `components/chats/ChatDetailView.tsx`·`ChatMessageList.tsx`(sam-text-body 14 등) | **제외** (레거시 표면, 3종 단일 렌더러 아님) — 글자 불일치는 보고만 |
| Philife | `app/(main)/philife/purchases/[chatId]/page.tsx:14-16` 거래 허브로 redirect. Philife DM 은 `lib/chats` 별도 제품(AGENTS) | **제외** |

---

## PART B — 구현 설계

### B-1. 채팅 글자 토큰 1벌 (`app/design-tokens.css`, `:root` 에 정의 — 목록·방·슬라이드 모두 전역으로 받음)

| 토큰 | 값 | 근거 |
|---|---|---|
| `--cm-font-body` | 16px | 레거시 본문 측정 16 |
| `--cm-font-body-lh` | 1.35 | 현재 줄 높이 유지(21.6px) |
| `--cm-font-service` | 14px | 날짜·시스템·서비스 측정 ≈14 |
| `--cm-font-service-weight-date` | 600 | 날짜 굵게 측정 |
| `--cm-font-quote` | 14px | 답장 인용 측정 ≈14 |
| `--cm-font-meta` | 12px | 시각 측정 ≈12 |
| `--cm-font-header-status` | 14px | 측정 13~14 → 14 (Telegram 형 상단값) |
| `--cm-font-header-title` | `var(--sector-header-title-size)` (17) | **Owner 결정**: 측정 ≈18 은 라틴 대문자 높이 추정이라 근거 약함 + `sector-header.css:50` 「제목은 17px (SSOT S7)」 및 테스트 고정. 기본안 17 유지 |
| `--cm-font-sender` | 14px | **측정 없음** — 인용 이름과 같은 단계로 둠. 실측 전 NOT_PROVEN |
| `--cm-font-list-title` | 16px | 측정 16 (현재와 같음) |
| `--cm-font-list-preview` | 15px | 측정 ≈15 — **Owner 결정(E3, 시안 13.5 와 충돌)** |
| `--cm-font-list-meta` | 12px | 측정 없음 — 방 시각과 같은 단계. NOT_PROVEN |
| `--cm-font-badge` | 12px | 측정 없음. 배지 높이 20px 안에 들어감 |
| `--cm-font-composer` | `var(--cm-font-body)` | 입력 = 본문 16 (iOS 16 하한과 같음) |

다크 모드: `globals.css:32-33` 「다크 모드 없음 (Owner 2026-11-12)」 → 크기 토큰은 색과 무관, 다크 값 불필요.

### B-2. 기존 → 새 토큰 대응표

| 요소 | 파일:줄 | 기존 | 새 |
|---|---|---|---|
| 본문 | `MessengerTimelineBubbleInners.tsx:283` | `text-[14px] leading-[1.35]` | `text-[length:var(--cm-font-body)] leading-[var(--cm-font-body-lh)]` |
| 전송 중(텍스트) | `BubbleInners.tsx:291` | 11 | `--cm-font-meta` |
| 전송 중(스티커·사진) | `BubbleInners.tsx:57`, `MessengerChatImageBubble.tsx:155,339` | xxs 12 | `--cm-font-meta` (값 같음) |
| 파일 이름/정보/업로드 | `BubbleInners.tsx:120/123/131/143` | 14/12/13/13 | body/meta/meta/meta |
| 통화 줄 제목/방향 | `BubbleInners.tsx:243/245` | 13/11 | quote(14)/meta(12) — **통화 규정 적용 범위 밖 파일**(경로가 call* 아님)이나 통화 표시 변경이므로 보고에 명시 |
| 인용 이름/본문 | `MessengerTimelineVirtualRow.tsx:464/469` | xxs 12 | `--cm-font-quote` |
| 반응 수 | `:503` | xxs 12 | `--cm-font-meta` |
| 전달됨 | `:615` | xxs 12 | `--cm-font-quote` |
| 사진 위 시각 / 통화 옆 시각 / 말풍선 옆 시각 | `:646 / :664 / :810, :827` | 11 | `--cm-font-meta` |
| 안 읽음 / 그룹 읽음 수 | `:815 / :817` | 11 | `--cm-font-meta` |
| 날짜 구분 | `:723` | 12 보통 | `--cm-font-service` + weight 600 |
| 읽음 구분선 | `:736` | 12 | `--cm-font-service` |
| 시스템 문구 | `:767` | helper 13 | `--cm-font-service` |
| 그룹 발신자 | `:797` | 12 | `--cm-font-sender` |
| 주문 상태 줄 | `:877` | 12 | `--cm-font-service` |
| 거래 글 변경 줄 | `MessengerTradeListingChangeSystemRow.tsx:33/37` | 13/12 | service/meta |
| 주문 요약 카드 | `MessengerStoreOrderSummaryCard.tsx:58,60` | 12 | **변경 안 함**(카드 레이아웃, Owner 결정 시 service) |
| 음성 시각 | `VoiceMessageBubble.tsx:356,366` | xxs 12 | `--cm-font-meta` (값 같음) |
| 입력 중 줄 | `Timeline.tsx:2330` | helper 13 | `--cm-font-service` |
| 공지 바·빈 방·이전 대화 불러오기 | `Timeline.tsx:1952,1962,1966,1993-2047,2291-2309` | 12~14 | 범위 밖(측정 없음) — 그대로 |
| 입력창 글자 | `messenger-composer-sector.tsx:224` + `messenger-presentation.css:399-402` | 16 (!important, 메신저 경로만) | `--cm-font-composer`; `!important` 규칙을 **전역 파일**(`app/chat-viewport-shell.css`, `globals.css:18` 에서 전역 import)로 이동해 슬라이드 패널에도 적용 |
| 입력창 안내 글 | `globals.css:269-276` (14) | 14 | `[data-cm-room] textarea[data-cm-composer-input]::placeholder { font-size: var(--cm-font-composer) }` (전역 파일). textarea 에 `data-cm-composer-input` 속성 추가(이미 CSS 선택자 `messenger-presentation.css:400` 에 있음, 컴포넌트엔 없음) |
| 입력창 답장 미리보기 | `CommunityMessengerRoomPhase2Composer.tsx:502/505` | 12/13 | quote/quote |
| 머리글 이름 | `CommunityMessengerRoomPhase2Header.tsx:392,420,449,475,482`, `StoreOrderDeliveryMessengerHeaderBlock.tsx:62` | 17 | `--cm-font-header-title`(기본 17 유지) |
| 머리글 상태 | `Header.tsx:396,423,452,474,486`, `StoreOrderDeliveryMessengerHeaderBlock.tsx:66` | xxs 12 | `--cm-font-header-status` |
| 목록 이름 | `messenger-presentation.css:218` | 16 | `var(--cm-font-list-title)` |
| 목록 미리보기 | `messenger-presentation.css:220`, `TradeChatListRowContent.tsx:59`, `DeliveryChatListRowContent.tsx:46` | 13.5 | `var(--cm-font-list-preview)` (Owner 결정 후) |
| 목록 시각 | `messenger-presentation.css:222`, `MessengerChatListItem.tsx:981` | 11.5 | `var(--cm-font-list-meta)` |
| 배지 | `MessengerChatListItem.tsx:989,1021` | 11 | `var(--cm-font-badge)` |
| 인원 수 | `MessengerChatListItem.tsx:1089` | 14 | 그대로(측정 없음) |

### B-3. 바꿀 파일 (전체 목록)

글자(PR-A, 웹):
1. `app/design-tokens.css` — `--cm-font-*` 추가
2. `app/chat-viewport-shell.css` — 입력창 글자·안내 글 규칙(전역)
3. `app/messenger-presentation.css` — `:218-222` 목록 토큰 연결, `:399-402` 규칙 제거(2로 이동)
4. `app/samarket-components.css:1031` — `contain-intrinsic-block-size`
5. `components/community-messenger/room/phase2/MessengerTimelineBubbleInners.tsx`
6. `components/community-messenger/room/phase2/MessengerTimelineVirtualRow.tsx`
7. `components/community-messenger/room/phase2/MessengerTradeListingChangeSystemRow.tsx`
8. `components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageTimeline.tsx` (입력 중 줄)
9. `components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header.tsx`
10. `components/community-messenger/room/phase2/StoreOrderDeliveryMessengerHeaderBlock.tsx`
11. `components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Composer.tsx`
12. `components/community-messenger/line-ui/messenger-composer-sector.tsx`
13. `components/community-messenger/room/MessengerChatImageBubble.tsx`
14. `components/community-messenger/VoiceMessageBubble.tsx` (값 같음 — 토큰 연결만)
15. `components/community-messenger/MessengerChatListItem.tsx`
16. `components/community-messenger/trade-chat-list/TradeChatListRowContent.tsx`
17. `components/community-messenger/delivery-chat-list/DeliveryChatListRowContent.tsx`
18. `lib/store-order-chat/messenger-timeline-row-estimate.ts`
19. `lib/community-messenger/room/messenger-room-ui-constants.ts`

시각(PR-B, 별도 — B-6):
20. `lib/community-messenger/messenger-clock-time.ts`
21. `lib/community-messenger/chat-list/chat-list-kakao-time.ts` (`formatClock` export)
22. `components/community-messenger/room/community-messenger-room-helpers.tsx:562-576` (캐시 키에 언어)
23. (선택·Owner) `components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageTimeline.tsx:559-572` 날짜 구분선 언어 (E6)
24. (Owner) `lib/community-messenger/realtime/presence/format-messenger-peer-presence-line.ts` (E7)

### B-4. 높이 추정치

| 상수 | 위치 | 현재 | 새 값 (계산, 실측으로 확정) | 계산 |
|---|---|---|---|---|
| `MESSENGER_SHORT_TEXT_ROW_ESTIMATE_PX` | `messenger-timeline-row-estimate.ts:18` | 52 | 55 | 본문 줄 18.9→21.6 (+2.7) |
| `MESSENGER_TIMELINE_VIRTUAL_ESTIMATE_PX` | `messenger-room-ui-constants.ts:20` | 96 | 100 | 2~3줄 기준 +2.7×1.5 |
| 시스템 `72` | `messenger-timeline-row-estimate.ts:33` | 72 | 74 | 13→14, leading-5 고정이라 +0~2 |
| 주문 상태 줄 `88` | `:9` | 88 | 92 | 12→14 × 1.5 |
| 통화 `52` | `:15` | 52 | 52 | min-h-44 고정이라 변화 거의 없음 |
| `contain-intrinsic-block-size: auto 64px` | `samarket-components.css:1031` | 64 | 68 | `auto` 라 한 번 그린 뒤 실제 값 기억 — 첫 표시만 영향 |
| 목록 `ROW_ESTIMATE_PX` | `CommunityMessengerChatList.tsx:35` | 72 | 72 | 행 높이 고정 72(`messenger-presentation.css` `--cm-list-row-max-h`) 유지 |

사용처: `use-messenger-room-phase1-timeline-heavy.ts:51`, `messenger-room-timeline-paint-model.ts:89,106,110`, `Timeline.tsx:547`, `use-messenger-room-load-older-messages-fetch.ts:173` — 함수 1개만 바꾸면 모두 따라간다. `lib/ui/messenger-chat-viewport-tuning.ts` 는 입력창 높이(`:23` 100px = 16px×1.25 4~5줄)만 다룸 — 입력 글자가 이미 16이라 **변경 없음**.

### B-5. 배치 위험

| 위험 | 근거 | 처리 |
|---|---|---|
| 말풍선 폭 | 행 `max-w-[min(76vw,520px)]` (`VirtualRow.tsx:803`) 안에 시각(밖)이 함께 있음. 360dp: 273px − 시각 ≈46px − 간격 → 본문 칸 약 205px → 16px 한글 약 12~13자/줄(14px 는 약 14~15자) | 줄바꿈 증가 허용. 시각을 말풍선 안으로 옮기는 D1-b 는 별도 승인 항목 — 섞지 않음 |
| 시각 잘림 | `:799` 주석 「375px 화면에서 시간 12px 잘림」 과거 결함 → `min-w-0` 로 해결됨 | 360dp·375dp 긴 URL 로 재확인 필수 |
| 통화 줄 | `BubbleInners.tsx:243` `truncate` | 14px 로 제목이 더 빨리 잘림 — 360dp 확인 |
| 머리글 | 높이 52 (`sector-header.css:17`); 제목 17×1.25 + 상태 14×1.25 = 38.75 ≤ 52 | 상태 줄 `truncate` 이미 있음 |
| 목록 행 | 고정 72px; 이름 20.8 + 3 + 미리보기 15×1.35=20.25 = 44 ≤ 72 | 미리보기 한 줄 글자 수 감소(분할 화면 목록 칸에서 두드러짐) |
| 배지 | 높이 20(`--cm-list-unread-min`) 안에 12px 굵게 + 「999+」 폭 증가 | `min-w` 자동 확장 확인 |
| 분할 화면(≥768) | `messenger-presentation.css:410-424` 머리글 높이 auto | 영향 적음 |
| 태블릿 ≥600dp | 레거시는 태블릿 18(기존 감사 D4-b) | **Owner 결정** — 기본안 휴대폰 값 그대로 |
| 슬라이드 주문 채팅 | A-3 CSS 로딩 범위 | 토큰을 전역 파일에 둬 해결 |
| OS 글자 크기 | A-3 | **Owner 결정 필요**: 04-DESIGN-SYSTEM.md:45 계약은 「존중」인데 구현 안 됨. 반영하려면 Android `MainActivity` 에서 `WebSettings.setTextZoom(fontScale×100)` = **네이티브 변경·재빌드**, 앱 전체 글자가 커져 모든 화면 배치 영향. 이번 PR-A 는 px 토큰(배율 1.0 기준)만 — px 토큰은 textZoom 과 호환되므로 나중에 네이티브 단계만 추가하면 됨 |
| 글자 검사 | PR-A 는 CSS·클래스만, 화면 문구 추가 없음 → `check:i18n-quality` 영향 없음 | PR-B 도 기존 키(`cm_ui_chat_list_time_am/pm`, `community-messenger-ui.ts:673-674, 1843-1844`) 재사용 — 새 문구 없음. E7 을 고치면 기준선 6건이 줄어 `check:i18n-quality:baseline` 재작성 필요(`docs/i18n-ssot.md` §5 「고쳐진 항목도 실패」) |

### B-6. 시각 표기 충돌 — **Owner 결정 필요**

현재 메신저 시각 포맷터 전부:

| # | 표면 | 함수 (file:line) | 출력 |
|---|---|---|---|
| 1 | 방 말풍선 시각·사진 위·통화 줄·거래 변경 줄·음성 | `messengerMessageClockLabel` (`community-messenger-room-helpers.tsx:570-576`) → `formatMessengerClockTime` (`messenger-clock-time.ts:12` `new Intl.DateTimeFormat("en-US", {hour12:true})`) | 언어 무관 「2:16 AM」 |
| 2 | 방 시트(공지 수정 시각·사진/파일 목록·이벤트) | `formatTime` = 같은 함수 (`helpers.tsx:562`; 사용 `CommunityMessengerRoomPhase2RoomSheets.tsx:677,1255,1393,1555,1635,1704,1775`) | 「2:16 AM」 |
| 3 | 상대 통화 상세 행 | `formatCallPeerDetailRowTime` (`call-log-row-copy.ts:157-159`) → 같은 함수, `CommunityMessengerCallPeerHistoryRow.tsx:20` | 「2:16 AM」 |
| 4 | `formatCallLogListTime` | `call-log-row-copy.ts:127-155` | 제품 코드 사용처 0건(테스트만) |
| 5 | 대화 목록·검색·통화 탭·주문 캐너리 | `formatChatListKakaoTime`/`formatChatListKakaoDateTime` (`chat-list-kakao-time.ts:32-92`), 사용 `MessengerChatListItem.tsx:423`, `MessengerChatSearchScreen.tsx:271`, `call-history-row-line.ts:38`, `DomainStoreOrderCustomerListCanaryGate.tsx:405` | ko 「오전 2:04」 / en 「2:04 AM」 (카탈로그 키) |
| 6 | 1:1 머리글·친구 목록 마지막 접속 | `formatMessengerLastSeenYyMmDdHhMm` (`format-messenger-peer-presence-line.ts:4-14`), `CommunityMessengerFriendPresenceLine.tsx:44` | 「마지막 접속 26-11-14 04:15」 (24시간·한국어 고정) |
| 7 | 날짜 구분선 | `Timeline.tsx:565` `"ko-KR"` 고정 | 「2026년 11월 18일」 (영어 화면도) |
| 8 | 통화 상세 날짜 묶음 | `CommunityMessengerCallPeerDetailPanel.tsx:103` 언어별 Intl | 언어 따름 |

정한 근거(인용):
- `messenger-clock-time.ts:3` 「지속시간(duration)과 혼동 금지. AM/PM 리터럴은 Intl(en-US)만 사용한다.」 — 커밋 `d9fe523d0` (2026-07-30 「fix(messenger): call clock AM/PM …」)
- 테스트가 이 결정을 잠금: `lib/community-messenger/__tests__/messenger-presentation-contract.test.ts:78-89` 「AM/PM clock time is single SSOT authority」 — `/^\d{1,2}:\d{2}\s*(AM|PM)$/i` 및 `not.toMatch(/hour12:\s*lang\s*===\s*"ko"/)`
- 성능 계약: `messenger-clock-time.ts:5-6` 채팅 P0-1(Owner 2026-11-11) 「포맷터는 모듈에서 1개만」, `docs/audit/messenger-p0-structural-audit-design-2026-11-11.md:23` ⓓ
- 목록: `chat-list-kakao-time.ts:3-9` 「채팅 시안 4판 (Owner 「정확히 시안대로」 2026-11-10) … 오늘: 「오전 9:54」 (en "9:54 AM")」
- 마지막 접속: `format-messenger-peer-presence-line.ts:3` 「lastSeen 은 `yy-mm-dd hh:mm` 고정 (기기 간 날짜 누락 차이 방지)」
- 언어 SSOT: `docs/i18n-ssot.md` §3-3 「다른 언어로 대체하지 않는다. 영어 화면에 한국어, 한국어 화면에 영어가 나오면 결함」

**충돌**: #1~#3 의 「en-US 고정」(Owner 승인 이전 SSOT) ↔ 언어 SSOT(2026-11-08) ↔ 시안 4판 목록 형식. 임의로 고르지 않고 Owner 결정으로 둔다.

기본안(승인 시):
- 단일 함수 `formatMessengerClock(date, lang)` = `chat-list-kakao-time.ts:68-73` 의 `formatClock`(이미 키 `cm_ui_chat_list_time_am/pm` 사용) 을 export 해 그대로 씀 → ko 「오전 2:16」, en 「2:16 AM」. `formatMessengerClockTime(iso)` 는 `getRuntimeAppLanguage()`(`lib/community-messenger/cm-ui-translate.ts:6` 와 같은 원천)로 이 함수를 호출.
- P0-1 성능 계약 유지: `Intl` 생성 없음(정수 연산 + 카탈로그 조회). `messengerMessageClockLabelCache`(`helpers.tsx:568`) 값에 `lang` 을 함께 저장해 언어가 바뀌면 다시 계산.
- #6 마지막 접속·#7 날짜 구분선은 같은 언어 규칙으로 맞출지 **별도 Owner 결정**(yy-mm-dd 는 별도 SSOT 주석이 있음).
- **통화 변경 규정 충돌**: #3 은 `lib/community-messenger/call-log-row-copy.ts`(규정 1번 적용 범위 `lib/community-messenger/call*`)와 `components/community-messenger/call-history/*` 의 표시 문자열을 바꾼다. 신호·세션·푸시는 바뀌지 않지만 규정은 「예외 없음」 → PR-B 는 **시각만 단독 PR, 자동 병합 등록하지 않고 Owner 승인 후 병합**, 확인은 Android·iPhone 통화 탭·통화 상세·방 통화 줄 표시(통화 연결 행렬은 신호 무변경이라 Owner 가 면제할지 결정).

### B-7. 테스트

갱신:
- `lib/community-messenger/__tests__/messenger-presentation-contract.test.ts:78-89` (AM/PM 고정 → ko/en 양쪽), `:144-159`(목록 토큰을 바꾸면)
- `lib/community-messenger/room/__tests__/chat-p0-1-render-storm-contract.test.ts:83`
- `lib/community-messenger/__tests__/call-log-row-copy.test.ts:197-208` (PR-B)
- `lib/store-order-chat/__tests__/messenger-timeline-row-estimate.test.ts` (추정치)
- `lib/community-messenger/chat-list/__tests__/chat-list-kakao-time.test.ts` (`formatClock` export)
- 변경 없음 확인: `lib/layout/__tests__/sector-header-symmetric-grid.test.ts:51`, `chat-v4-header-scope.test.ts:24`(머리글 17 유지), `chat-p0-5-content-visibility-contract.test.ts:24-25`(정규식 `auto \d+px` 라 통과), `messenger-voice-recording-and-bubble-contract.test.tsx:111-115`(라벨을 직접 넘김)

추가:
- 토큰 계약: `design-tokens.css` 에 `--cm-font-body: 16px` 등 존재, 위 B-3 5~17번 파일에 `text-[11px]|text-[12px]|text-[13px]|text-[14px]|text-[11.5px]|text-[13.5px]` 와 채팅 글자용 `sam-text-xxs/helper` 가 남지 않음(파일별 래칫).
- 입력창 규칙이 `messenger-presentation.css` 가 아닌 전역 파일에 있음(슬라이드 패널 회귀 방지).
- 시각: 런타임 언어 ko → 「오전 2:16」, en → 「2:16 AM」, 언어 전환 후 같은 메시지 객체 라벨 재계산.

### B-8. 화면 확인 행렬 (모두 Production SHA·PHT·로그인 계정·기기 기록, Owner 화면 기준)

| 기기 | 화면 | 확인 |
|---|---|---|
| Samsung (Owner 폰, 360dp급) | 1:1 방 | 본문·날짜·시스템·인용·시각 글자 높이 재측정 → 레거시 표와 대조; 긴 URL·긴 한글 줄바꿈; 시각 잘림 없음 |
| Samsung | 그룹 방 | 발신자 이름·읽음 수·입력 중 줄 |
| Samsung | 거래 방·주문 방 | 거래 변경 줄·주문 상태 줄·요약 카드 |
| Samsung | 대화 목록·거래 목록·주문 목록 | 72px 유지, 미리보기 잘림, 배지 「999+」 |
| Samsung | `/my/store-orders` 주문 채팅 슬라이드(콜드 진입) | 입력 글자 16 |
| Samsung | 시스템 글자 크기 최대 | OS 배율 반영 여부(현재 상태 기록용, A-3) |
| iPhone | 같은 방·목록 | 입력 확대 없음, 머리글 2줄 52px 안 |
| Xiaomi 태블릿 | 분할 화면 | 목록 칸·방 머리글 |
| ko / en 각 1회 | 방·목록·통화 탭 | (PR-B) 시각 표기 일치 |

### B-9. 되돌리기

- PR-A: 토큰 값만 원래 값(14/12/11/13/13.5/11.5)으로 되돌리면 화면이 즉시 원복(웹 배포, 앱 재시작). 전체 되돌림은 PR revert 1회. 장애 시 Vercel Instant Rollback(AGENTS 개발 프로세스 2번).
- PR-B: `messenger-clock-time.ts` 1파일 revert 로 en-US 고정 복귀.
- 네이티브 변경 없음 → 앱 재빌드·버전 증가 없음(`[배포 구분]` 웹).

### B-10. Owner 결정 필요 목록

1. 목록 미리보기 15 (시안 4판 13.5 와 충돌) — E3
2. 머리글 이름 18 (SSOT S7 17 고정) — 기본안 17 유지
3. 태블릿 단계값 — 기본안 휴대폰 값
4. OS 글자 크기 반영(네이티브 textZoom, 04-DESIGN-SYSTEM.md:45 계약 미이행)
5. 시각 표기 통일(B-6) 및 통화 규정 적용 방식
6. 마지막 접속 형식·한국어 고정(E7), 날짜 구분선 언어(E6)
7. 측정 없는 요소(발신자 이름·목록 시각·배지·안 읽음·입력 안내 글)의 값 — 실측 전 NOT_PROVEN
