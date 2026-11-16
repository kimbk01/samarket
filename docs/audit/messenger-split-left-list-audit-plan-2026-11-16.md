# 분할 화면(768px+) 왼쪽 목록 바뀜 — 감사·수정 계획 (2026-11-16)

상태: **계획만 · 구현 안 함 · Owner 승인 대기**. 기준 코드는 main `9b1d7c106`, 운영은 `dc8907b55`(#385 포함)이다.

## 0. 이전 실패 (#379·#380, #382로 되돌림)

| 실패 | 원인 | 이번 계획에서 막는 방법 |
|---|---|---|
| 모든 방 이동(8곳)에 「지금 주소의 목록 상태 이어 붙이기」를 적용 | 배너·전역 검색 등 왼쪽 목록과 무관한 진입도 거래 목록 상태를 물려받음 | 주소에서 이어 붙이지 않는다. **누른 목록이 직접 값을 넘긴다**(§3 P1). |
| 머리글 누락 | 왼쪽 홈만 고치고 분할 머리글은 고치지 않음 | 영향표에 머리글·뒤로를 같이 넣는다(§4). |
| 같은 주소 이동 정지 | 상세 슬라이드 경로 | #385로 해결됨(이동하지 않고 닫음, 실기 PASS). |
| 실기 중 연속 PR | 규정 위반 | 이번 작업은 PR 1개. 실기 결함은 고치지 않고 보고한다. |

## 1. 왼쪽 목록이 정해지는 방식 (코드)

- `MessengerResponsiveShell.tsx:65`: 방 주소의 `cm_list` 값으로 정한다. `trade`면 거래 채팅, `delivery`면 주문 채팅, 없으면 대화 홈.
- 대화 홈 안의 탭(대화·친구·통화·보관함)은 `use-community-messenger-home-shell-effects.tsx:241-256`에서 주소의 `section`으로 정한다. **`section`이 없으면 대화(chats)로 되돌린다.**
- 채팅 검색 등 하위 화면은 `CommunityMessengerHome.tsx:527-530`에서 정한다. **주소가 `/community-messenger`일 때만** `section=search`를 읽고, 방 주소에서는 무조건 닫는다.
- 방 주소 생성
  - 메신저 안: `communityMessengerRoomHref`, `runCommunityMessengerRoomForwardNavigation`.
  - 거래 방: `tradeMessengerRoomHref`, `tradeHubChatRoomHref`. **`cm_list`를 붙이지 않는다.**
  - 반면 주문 방(`buildStoreOrderMessengerRoomHref`)과 도메인 라우터(`buildChatDomainRoomHref`)는 거래 `cm_list=trade`, 주문 `cm_list=delivery`를 붙인다.
  - 즉 **거래 방 주소만 규칙과 다르다.**

## 2. 진입 경로 전수표와 수정 전 실측

실측 조건: Xiaomi 분할 화면, zxzx11, Production `dc8907b55`, 2026-11-16 PHT.

| # | 진입 경로 | 지금 왼쪽 | 판정 | 증거 |
|---|---|---|---|---|
| E1 | 대화 목록 행 | 대화 | 정상 | 코드 |
| E2 | 거래 채팅 목록 행 | 거래 채팅 (`cm_list=trade`) | 정상 | 17:32 실측 |
| E3 | 주문 채팅 목록 행 | 주문 채팅 (`cm_list=delivery`) | 정상 | 코드 |
| E4 | 채팅 검색 → 대화 결과 | 채팅 검색 → **대화로 바뀜** | **FAIL** | 17:47:42 실측 (w테스트1) |
| E5 | 채팅 검색 → 메시지·친구·공개방 결과 | 같은 경로(`navigateToCommunityRoom`) | **FAIL**(코드) | 실측 안 함 |
| E6 | 친구 탭 → 친구 누름 → 1:1 방 | 친구 → **대화로 바뀜** | **FAIL** | 17:48 실측 (q테스트1) |
| E7 | 통화 탭 → 기록 → 「채팅」 | 통화 → **대화로 바뀜** | **FAIL** | 17:48 실측 (q테스트1) |
| E8 | 보관함 → 방 | `section` 빠짐 → 대화 | **FAIL**(코드) | 실측 안 함 |
| E9 | 거래방 위 상품 상세 → 「채팅 이어가기」 | 이동 없음, 유지 | 정상 | #385, 17:33~17:36 실측 5+5회 |
| E10 | `/post/…` 상품 페이지 → 「채팅 이어가기」 | **대화 목록**. 이 목록에는 그 거래방이 없음 | **FAIL** | 17:39 실측 (찐빵) |
| E11 | 내 구매·판매 내역, 새 거래 채팅(compose), 옛 구매 주소 | `tradeHubChatRoomHref` → 대화 | **FAIL**(코드) | 실측 안 함 |
| E12 | 알림 목록 → 거래 알림(가격 제안 수락 등 `tradeChatNotificationHref`) | 대화 | **FAIL**(코드) | 실측 안 함 |
| E13 | 앱 안 메시지 배너 → 거래·주문 방 | 방 주소만 → 대화 | **FAIL**(코드) | 실측 안 함 |
| E14 | 전역 검색(`/search`) → 대화 결과 | 결과 종류별 `listSource` | 정상 | 코드 |
| E15 | 주문 상세 → 주문 채팅 | `cm_list=delivery` | 정상 | 코드 |
| E16 | 메시지 푸시 탭 (FCM) → 거래·주문 방 | 방 주소만 → 대화 | FAIL(코드) | 범위 밖(§6) |

**원인은 두 가지다.**
- **R1 (E4~E8)**: 왼쪽 홈 안에서 방을 열면, 방 주소에 누른 탭·하위 화면(`section`)이 실리지 않는다. 그래서 홈이 대화 탭으로 돌아간다.
- **R2 (E10~E13)**: 메신저 밖에서 거래·주문 방을 열 때 방 주소에 그 방의 목록(`cm_list`)이 없다. 그래서 그 방이 없는 대화 목록이 나온다.

## 3. 수정 설계

**원칙**
1. 왼쪽 목록 안에서 방을 열면 **누른 그 목록·탭이 그대로** 남는다.
2. 메신저 밖에서 방을 열면 **그 방이 속한 목록**이 나온다(거래 → 거래 채팅, 주문 → 주문 채팅, 그 외 → 대화).
3. 주소가 기준이다. 새 저장소나 상태를 만들지 않는다.

### P1 — 왼쪽 홈 안 진입 (R1: E4~E8), 분할 화면에서만

| # | 파일 | 변경 |
|---|---|---|
| 1 | `lib/community-messenger/messenger-entry-origin.ts` | `communityMessengerRoomHref`에 선택 인자 `splitListSection`(friends·calls·archive·search)을 추가해 `section`으로 싣는다. chats·없음이면 싣지 않는다(지금과 같음). |
| 2 | `lib/community-messenger/community-messenger-room-forward-navigation.ts` | 인자 `splitListSection`을 받아 1로 넘긴다. **분할 화면일 때만** 싣는다(`matchesMessengerSplitViewport`). 휴대폰은 지금과 같다. **주소에서 이어 붙이지 않는다**(#379 실패 원인). |
| 3 | `lib/community-messenger/home/use-community-messenger-home-navigation.ts` | 홈의 `navigateToCommunityRoom`이 지금 왼쪽 상태(검색 화면이면 search, 아니면 mainSection)를 넘긴다. |
| 4 | `MessengerChatListItem.tsx` | 홈 목록 행(대화·검색·보관함)이 같은 값을 받아 넘긴다(홈이 prop으로 전달). |
| 5 | `MessengerCallLogsPanel.tsx`, `CommunityMessengerCallPeerDetailPanel.tsx` | 통화 탭에서 연 방은 `calls`를 넘긴다. |
| 6 | 친구 누름 → 1:1 방 경로 | 구현 첫 단계에서 호출 함수를 확정한다(지금 확인한 것은 결과뿐: 17:48 FAIL). 같은 값 `friends`를 넘긴다. |
| 7 | `CommunityMessengerHome.tsx:527-530` | 분할 화면이고 방 주소이면 `section=search`도 읽는다(검색 화면 유지). |
| 8 | `use-community-messenger-home-shell-effects.tsx` 분할 머리글 | 방 주소에서도 하위 화면 머리글(「채팅 검색」·뒤로)을 쓴다. 뒤로 = 방은 그대로 두고 `section`만 뺀 주소. |

- 친구·통화·보관함 탭은 지금도 방이 열린 채 탭을 바꾸면 방이 유지된다. 화면은 17:47에 실측했다(친구 탭 + 방 유지). 주소가 `/rooms/:id?section=friends`가 되는 것은 코드로 확인했다(`replaceMessengerSectionUrl`의 `stickyRoomId`). 주소 자체는 기기에서 읽지 못했다(운영 앱은 WebView 디버거가 꺼져 있음).
- 따라서 같은 주소 규칙을 방 진입에도 쓰는 것이다. 새 규칙이 아니다.

### P2 — 메신저 밖 거래 방 (R2: E10~E12)

| # | 파일 | 변경 |
|---|---|---|
| 9 | `lib/chats/surfaces/trade-chat-surface.ts` `tradeMessengerRoomHref` | `cm_list=trade`를 붙인다. 주문 방(`buildStoreOrderMessengerRoomHref`)과 도메인 라우터(`buildChatDomainRoomHref`)의 규칙과 같다. 이 함수 하나로 상품 상세·구매/판매 내역·compose·옛 구매 주소·거래 알림 주소(서버 `tradeChatNotificationHref`)가 모두 따라간다. |

### P3 — 앱 안 메시지 배너 (E13)

| # | 파일 | 변경 |
|---|---|---|
| 10 | `cm-participant-unread-full-effects.ts` → `messenger-in-app-banner-store.ts` → `in-app-notification-banner-store.ts` → `InAppNotificationBannerHost.tsx:125` | 배너 내용을 만들 때 이미 읽는 방 요약(`row ?? cachedSnapshot.room`)으로 목록 종류를 정해 대상에 싣는다(추가 요청 없음). 판정은 `communityMessengerRoomIsConfirmedTrade` / `communityMessengerRoomIsConfirmedDelivery`. 누르면 `communityMessengerRoomHref(roomId, null, listSource)`로 연다. 부재중 통화 배너(`missed-call-event-banner.ts`)는 1:1 방이라 대화(지금과 같음). |

## 4. 영향표

| 대상 | 수정 후 | 깨질 수 있는 것 | 처리 |
|---|---|---|---|
| 휴대폰 방 화면 | P1은 분할에서만이라 변화 없음. P2·P3은 거래·주문 방 주소에 `cm_list`가 추가됨 | 방 뒤로가 기록이 없을 때(푸시·직접 링크) 돌아갈 곳이 대화 → **거래 채팅 목록**으로 바뀜 | 의도한 변경이다. 거래 목록 행으로 들어간 방과 같은 동작. 기록이 있으면 지금처럼 기록 뒤로(`runHistoryBackWithFallback`) |
| 분할 머리글 | 검색 화면 유지 시 「채팅 검색」+뒤로 | #379 누락 지점 | 8번에서 함께 처리, 실기 항목 포함 |
| 분할 머리글 (친구·통화) | 이미 방 주소 `section`을 읽음 | — | 실기로 확인 |
| 방 뒤로 대체 주소 `buildMessengerRoomListBackHref` | `section`은 보지 않음 | 없음 | 변경 없음 |
| 미리 받기 키(`trade-chat-room-route-prefetch.ts`·`prefetchTradeChatEntry`) | 같은 함수로 주소를 만들어 키 일치 유지 | 키 불일치로 미리 받기 무효 | 같은 함수만 쓰는지 시험으로 고정 |
| #385 같은 방 판정 | 방 id 비교라 주소 변화 무관 | 없음 | 기존 시험 그대로 통과 확인 |
| 거래 알림 `link_url` (서버 저장) | 새 알림부터 `cm_list=trade` | 알림 읽음·푸시 분류가 주소를 비교하는 곳 | `push-routing-transport` 분류는 `startsWith("/community-messenger/rooms/")`(영향 없음). 읽음 범위 계약 시험 3개를 실행해 확인. 옛 알림은 지금처럼(지난 데이터 채우지 않음) |
| 시험 고정값 | `offer-accepted-link-messenger-room.test.ts:28` 정확 문자열 | 실패 | 새 규칙으로 갱신 |
| 진입 복원(`restore-envelope.ts` 허용 키 `cm_list`) | 이미 허용 | 없음 | — |
| `section=search`가 방 주소에 남은 채 휴대폰 폭으로 줄어듦 | 휴대폰 홈은 방 주소의 하위 화면을 읽지 않음(7번은 분할 조건) | 없음 | 시험으로 고정 |

## 5. 시험

**코드 시험** (먼저 작성하고, 수정 전 코드에서 실패를 확인한다)
1. `communityMessengerRoomHref`: `splitListSection` friends·calls·archive·search는 `section`으로 실리고, chats·없음은 실리지 않는다.
2. 이동 함수: 분할일 때만 `section`이 실리고, 휴대폰이면 안 실린다. 주소(location)에서 값을 가져오지 않는다(소스 계약).
3. `tradeMessengerRoomHref`·`tradeHubChatRoomHref`·`tradeChatNotificationHref`: `cm_list=trade`가 붙는다.
4. 배너: 거래 방 → `cm_list=trade`, 주문 방 → `delivery`, 1:1 → 없음.
5. 홈 하위 화면 판정: 분할 + 방 주소 + `section=search`이면 검색, 휴대폰이면 null.
6. 기존: `messenger-room-back-navigation.test.ts`, 알림 읽음·푸시 분류 계약 시험, 거래 진입·#385 시험 전부 통과.

**실기** (배포 뒤 작업자가 직접, Xiaomi 분할 화면 + Samsung 휴대폰)

| # | 항목 | 기대값 |
|---|---|---|
| 1 | E4 채팅 검색 → 방 | 왼쪽 「채팅 검색」과 결과 유지, 머리글 「채팅 검색」, 뒤로 → 검색만 닫히고 방 유지 |
| 2 | E6 친구 → 1:1 방 | 왼쪽 친구 탭 유지 |
| 3 | E7 통화 → 채팅 | 왼쪽 통화 탭 유지 |
| 4 | E10 `/post` → 채팅 이어가기 | 왼쪽 거래 채팅 목록, 그 방이 목록에 보임 |
| 5 | E11 내 구매 내역 → 채팅 | 같음 |
| 6 | E13 거래 방 메시지 배너 | 왼쪽 거래 채팅 목록. 상대 메시지가 필요하다. Samsung q테스트1 → Xiaomi zxzx11. **시험 메시지 1건을 보내야 하므로 실기 전에 Owner에게 알린다.** |
| 7 | 회귀: E1·E2·E9 | 지금과 같음 |
| 8 | 휴대폰(Samsung): 대화 목록 → 방 → 뒤로, 거래 목록 → 방 → 뒤로 | 지금과 같음 |

- iPhone: NOT_PROVEN 예상(QA 계정 거래방이 모두 숨김 글).

## 6. 범위 밖 (보고만)

- **E16 메시지 푸시 탭**: FCM 주소는 `lib/push/dispatch/fcm-data-payload-contract.ts`가 방 주소만으로 만든다. 알림 발송 계약(hard-lock 영역)이라 이번에 바꾸지 않는다. 푸시로 연 거래방은 계속 대화 목록이다.
- 같은 경로 이동 때 방 화면이 새로 마운트되는 조건: 확인 못 함(#385로 상세 슬라이드 경로는 영향 없음).

## 7. 반영

- 웹만 변경(앱 재시작, 빌드 없음).
- PR 1개 → 자동 병합 → 병합 뒤 §5 실기 1회.
- 실기 FAIL은 고치지 않고 원인과 계획을 보고한다.
