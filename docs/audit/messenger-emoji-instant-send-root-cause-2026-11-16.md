# 메신저 이모지 입력 「바로 전송」 — 측정으로 확정한 원인 (2026-11-16)

- 상태: 보고만(코드 변경·배포 없음).
- 측정 조건: Production `7d8f4a3aa`, Xiaomi(zxzx11, 웹뷰 디버거 계측, 휴대폰 폭 384 덮어쓰기), zxzx11↔q테스트1 테스트 방(`1de13b3e…`), 03:32 PHT. 시험 이모지 메시지 1건은 측정 후 「모두에게서 삭제」(운영 DB 삭제 확인), 입력창 임시 글도 비움.

## 측정

| 시각(계측 기준) | 사건 | 입력창 |
|---|---|---|
| 8039ms | 입력창에 「측정 글」 입력 | 「측정 글」 |
| 8886ms | 😊 버튼 누름(이모지 시트 열림) | 「측정 글」 |
| 약 9000ms | 시트에서 😀 누름 | — |
| **9009ms** | **`POST /api/community-messenger/rooms/1de13b3e…/messages` 본문 `{"content":"😀"}`** (바로 전송) | 「측정 글」 그대로 — 이모지 안 들어감 |
| 9411~12278ms | (변화 없음) | 「측정 글」 그대로 |

- 운영 DB: 03:32:15.804 PHT `message_type=text`, `content="😀"` 메시지 1건 생성(같은 clientMessageId) — 입력창 글과 별개의 한 글자 메시지.

## 원인 (코드 + 측정 일치)

- 시트의 이모지 `onPick` → `vm.dismissRoomSheet()` + `vm.insertOrSendComposerEmoji(emoji)` (`CommunityMessengerRoomPhase2RoomSheets.tsx:307-311`).
- `insertOrSendComposerEmoji` 는 **수정 중일 때만** 입력창에 넣고, 그 외에는 `void sendMessage(token)` 으로 **바로 전송**(`use-messenger-room-phase2-controller.ts:1370-1392`).
- 이력: 2026-10-24 `df034feaf`(K-4) 설계가 「수정 중 이모지가 원문을 바꾸는 결함」만 고치고 「비편집은 현행 즉시 전송 유지」로 정했다. 즉시 전송 자체는 처음부터의 동작이며, 텔레그램 기준과 비교한 적이 없다.
- 안내 문구 `common_emoji_panel_hint` = 「탭하여 입력」 / "Tap to insert" — 실제 동작(전송)과 다르다.

## 텔레그램 실측 (2026-11-15 23:56 PHT, Samsung 텔레그램 13.2.2, 보내기 없음)

- 이모지를 누르면 **입력창 커서 위치에 삽입**, 전송 버튼이 나타남 — 바로 전송 안 함. 패널은 열린 채(여러 개 연속 입력). 전송은 전송 버튼으로만.

## 결론

- **FAIL — 원인 확정:** 이모지 선택 처리 함수가 편집 중이 아닐 때 입력창 대신 `sendMessage` 를 부른다(설계 결정 K-4 「현행 유지」). 기기 측정·운영 DB·코드가 일치한다.
- 고칠 곳(설계 E1 1단계): `insertOrSendComposerEmoji` 의 비편집 분기를 `insertEmojiIntoComposerText`(이미 있는 함수)로 바꾸고, 시트를 닫지 않거나 닫고 입력창 포커스 복귀. 키보드 자리 패널(E1 2단계)은 방 뷰포트 계약 변경이라 별도.

## 수정 (Owner 「입력창 삽입으로 수정」 2026-11-16 · PR 1개)

- `insertOrSendComposerEmoji` → `insertComposerEmoji`: 수정 중·새 글 모두 `insertEmojiIntoComposerText` 로 입력창 커서 위치에 삽입, `sendMessage` 호출 없음. 새 글은 초점을 주지 않고 커서만 옮김(키보드 갑자기 올라오지 않게).
- 이모지 시트는 지금처럼 고른 뒤 닫힌다. 텔레그램처럼 패널을 열어 둔 채 여러 개 고르기·키보드 자리 패널은 방 뷰포트 계약 변경(설계 E1 2단계 S7)이라 이번 범위 아님.
- 옛 거래 채팅(`components/chats/ChatInputBar.tsx`, `emojiPickMode` 기본 "send")은 범위 밖 — 보고만(O7).
- 시험: 이모지 함수 본문에 `sendMessage(` 없음·시트가 `insertComposerEmoji` 호출·옛 이름 없음(계약), 삽입 함수 단위 시험.
- 반영 후 검증: 같은 계측(입력창 「측정 글」 → 😀) — 기대: 전송 요청 0건, 입력창 「측정 글😀」.
