# 거래방 상품 상세 슬라이드 「채팅 이어가기」 → 「이동 중…」 정지 — 수정 계획 (2026-11-16)

상태: **계획만 · 구현 안 함 · Owner 승인 대기**. 운영 Production `a5d52018f` 기준으로 코드를 읽었다.

## 1. 결함 (FAIL)

- 증상: 거래방 머리글에서 상품을 눌러 상세 슬라이드를 연다. 「채팅 이어가기」를 누르면 버튼이 「이동 중…」으로 바뀌고, 슬라이드가 닫히지 않은 채 멈춘다. 뒤로 키를 누르면 방은 정상이다.
- 재현 기록 (Xiaomi 분할 화면, zxzx11 구매자, 방 `33a8f97f`)

| 시각 (PHT) | Production | 결과 |
|---|---|---|
| 11:00:41 | 9b82a7068 계열 | 정상 (방 새로 마운트됨) |
| 11:33 | 61bc848ac | 정지 약 50초 |
| 12:08~12:09 | a5d52018f (#379·#380 되돌린 코드) | 정지 |

- 발생 시점: 슬라이드 도입 2026-08-20 `34477e485`, 이중 이동 방지 2026-07-29 `7b5371552`. 기존 결함이며, 오늘 변경(#376·#377·#379·#380)과 무관하다.

## 2. 원인 사슬 (코드 확정)

1. 슬라이드를 여는 곳은 세 곳이고, 모두 **지금 방의 상품 글**을 연다.
   - 머리글 상품 줄: `CommunityMessengerRoomPhase2Header.tsx:218-222`, `listingHeader.postId`.
   - 입력 막힘 안내: `CommunityMessengerRoomPhase2Composer.tsx:413-416`, `tradeBlockedProductPostId`.
   - 점 3개 메뉴 「상품 상세」: `CommunityMessengerRoomPhase2OneToOneDotMenu.tsx:436-438`.
2. 슬라이드는 상세 화면에 지금 방 정보를 넘긴다. `TradePostDetailSlidePanel.tsx`의 `roomBootstrap.messengerRoomId = 지금 방 id`, `roomId = tradeProductChatIdForDock`, `source = product_chat`이다.
3. 상세 화면 `handleChat`은 기존 방이 있으면 `openExistingTradeChat`을 호출한다(`PostDetailView.tsx:852-858`). 이동할 주소는 `tradeHubChatRoomHref(지금 방 id, "product_chat")` = `/community-messenger/rooms/{지금 방}?source=product_chat`이다. **경로가 지금 방과 같고 쿼리만 다르다.**
4. 이동을 시작하면 `navigated = true`가 되어 「이동 중…」과 이중 이동 방지를 풀지 않는다(`PostDetailView.tsx:891-896`). 두 가지는 화면이 언마운트될 때만 풀린다.
5. 슬라이드는 방 화면 안의 상태(`tradePostDetailSlidePostId`, `CommunityMessengerRoomClientPhase2Body.tsx:162-170`)로만 닫힌다. 닫기 버튼, 뒤로 키, 방 화면이 새로 마운트되는 경우에만 닫히고, 주소가 바뀌는 것에는 반응하지 않는다.
6. 따라서 같은 경로로 이동했을 때 방 화면이 새로 마운트되지 않으면, 슬라이드와 「이동 중…」이 계속 남는다.
   - 운영 요청 기록: 11:00 정상 때는 방 전체 조회 9건, 11:33 정지 때 0건, 12:08 정지 때 3건(메시지 없음).

**확인 못 함**: 같은 조작에서 새로 마운트되는 경우와 안 되는 경우를 가르는 조건. 이번 수정은 이 조건에 기대지 않으므로 수정 판정에는 필요 없다. 다만 「원인 모두 확정」이라고 쓰지는 않는다.

## 3. 수정 설계 (1가지 원인, 1가지 수정)

**원칙**: 「채팅 이어가기」의 대상 방이 **지금 슬라이드를 띄운 방과 같으면** 주소를 이동하지 않는다. 대신 슬라이드를 닫아 그 방으로 돌아간다. 사용자가 보는 결과는 「채팅방으로 이어감」으로 같고, 화면이 새로 마운트되느냐에 기대지 않는다.

| # | 파일 | 바꾸는 것 |
|---|---|---|
| 1 | `components/community-messenger/room/phase2/TradePostDetailSlideHostContext.tsx` | 컨텍스트 값에 `hostMessengerRoomId: string`을 추가한다(슬라이드를 띄운 방 id). |
| 2 | `components/community-messenger/room/CommunityMessengerRoomClientPhase2Body.tsx` | Provider에 `hostMessengerRoomId={roomIdStable}`를 넘긴다. |
| 3 | `lib/chats/trade-chat-entry-navigation.ts` | 순수 함수 `isTradeChatTargetSameAsSlideHostRoom({ hostMessengerRoomId, targetMessengerRoomId })`를 추가한다. 둘 다 비어 있지 않고 같을 때만 true. |
| 4 | `components/post/PostDetailView.tsx` `handleChat` 기존 방 분기 | 3이 true이면 `tradePostDetailSlideHost.closeSlide()`만 호출한다. `navigated`는 false로 두어 finally에서 「이동 중…」과 이중 이동 방지를 정상 해제한다. false이면 지금과 같이 `openExistingTradeChat`을 호출한다. |

바꾸지 않는 것
- `openExistingTradeChat`의 이동 방식, 주소 형식, 미리 받기.
- 슬라이드 열기와 닫기 애니메이션.
- 슬라이드 밖 상세 화면(`/post/…`)의 동작.
- 새 방 만들기(`openCreateTradeChat`) 경로.
- 서버와 DB.

## 4. 영향표 (호출처·화면 전부)

| 진입·화면 | 지금 | 수정 후 | 깨질 수 있는 것과 처리 |
|---|---|---|---|
| 거래방 슬라이드 → 「채팅 이어가기」 (휴대폰) | 같은 경로로 이동. 새로 마운트되지 않으면 정지 | 슬라이드만 닫힘 | 없음. 머리글 ‹ 버튼이 이미 `closeSlide()`를 쓰는 경로와 같다(`PostDetailView.tsx:541-553`). |
| 같은 경로 (태블릿·분할 화면) | 정지. 12:08에는 왼쪽 목록도 대화 목록으로 바뀜 | 슬라이드만 닫힘. 주소가 안 바뀌므로 왼쪽 목록도 그대로 | 분할 화면 왼쪽 목록 결함의 **다른 진입 경로**는 고치지 않는다(별도 계획). |
| 슬라이드 → 구인 「지원하고 채팅」 버튼 (같은 `handleChat`) | 같음 | 같은 판정으로 슬라이드 닫힘 | 거래방에서 구인 글이 열리는 경우만 해당 |
| 슬라이드 → 기존 방 없음 → 새 방 (`openCreateTradeChat`) | compose 경로로 이동(다른 경로 → 방 화면 언마운트) | 변경 없음 | 해당 없음 |
| 슬라이드 → 판매자 본인 글 | 채팅 버튼 없음(`showInlineChatCard`에 `!isOwnPost`) | 변경 없음 | 해당 없음 |
| `/post/{id}` 상세 페이지 「채팅 이어가기」 | 다른 경로로 이동 → 정상 | 변경 없음. 슬라이드 호스트가 없어 판정이 항상 false | 없음 |
| 찜 목록 `FavoritePostTradeActions` | `openExistingTradeChat` 직접 호출 | 변경 없음 | 방 화면 밖이라 같은 경로가 생기지 않음 |
| 슬라이드 Android 뒤로 키 등록 (`useOverlayHardwareBack`) | 닫힐 때 해제 | `closeSlide()`로 언마운트 → 해제 | 머리글 ‹ 경로와 같아 기존 동작 |
| `prefetchTradeChatEntry` (상세 진입·누름 직전 미리 받기) | 같은 방 주소 미리 받기 | 변경 없음 | 12:08 기록의 조회 3건이 이것으로 보인다. 이번 수정 범위 밖이며, 바꾸지 않는다. |

## 5. 시험

- **코드 시험 (vitest)**
  1. `isTradeChatTargetSameAsSlideHostRoom`: 같음→true, 다름→false, 한쪽이 비었음→false.
  2. 소스 계약 시험: `PostDetailView` 기존 방 분기가 판정이 true일 때 `closeSlide`를 부르고 `openExistingTradeChat`을 부르지 않는지 확인. 이 저장소의 `trade-detail-surface-owner-contract` 계열과 같은 방식이다.
  3. 1·2를 수정 전 코드에 먼저 돌려 실패하는 것을 확인한 뒤 수정한다.
- **실기 (배포 뒤, 작업자가 직접)**
  - 수정 전 재현은 12:08 a5d52018f 기록으로 대신한다. 다시 조작하지 않는다.
  - 수정 후 각 5회씩, 화면 캡처와 Production SHA를 기록한다.
    - Xiaomi 분할 화면(구매자): 머리글 상품 줄 → 「채팅 이어가기」. 슬라이드 닫힘, 「이동 중…」 남지 않음, 왼쪽 목록 유지, 방 메시지 그대로.
    - Samsung 휴대폰: 같은 조작. 구매자 계정이 휴대폰에 없으면 **NOT_PROVEN**으로 남긴다.
    - Xiaomi: 점 3개 메뉴 「상품 상세」 → 「채팅 이어가기」.
    - 회귀 확인: `/post/{id}` 상세 페이지 「채팅 이어가기」가 방으로 이동하는지.
  - iPhone: QA 계정 거래방이 모두 글 숨김이라 **NOT_PROVEN**.

## 6. 반영

- 웹만 변경(앱 재시작으로 반영, 빌드 없음).
- 작업 브랜치 → PR 1개 → 자동 병합 → 병합 뒤 위 실기를 1회 진행한다.
- 실기에서 다른 결함이 나오면 고치지 않고 원인과 계획을 먼저 보고한다.

## 7. 범위 밖 (보고만)

- 분할 화면 왼쪽 목록이 바뀌는 원래 결함(다른 진입 경로): 별도 계획.
- 같은 경로 이동 때 새로 마운트되는 조건: 확인 못 함.
