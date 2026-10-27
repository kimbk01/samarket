# A-17 옛 데이터 정리 계획 — 매장 주문 채팅방 미리보기·시각 (2026-10-27 PHT)

> 상태: **계획 · Owner 승인 대기** — 운영 DB 데이터 변경이다(AGENTS.md 개발 프로세스 2번).
> 코드 원인은 이미 고쳐져 있다: `b1927d5db`(10-02, CHAT-06), `08cd87d76`(10-27, 삭제된 최신 메시지 문구).
> 이 문서는 그 전에 쌓인 옛 데이터만 다룬다.

## 1. 대상 (운영 DB 읽기 · 10-27 09:45)

- 미리보기가 「📋 주문 요약」인 방은 752곳이다.
- 그중 **291곳**은 `rooms.last_message_at` 이 실제 최신 메시지 시각보다 앞서 있다. 10-02 전에는 요약을 갱신할 때마다 방 미리보기·시각을 그 순간으로 덮어썼기 때문이다.
- 그래서 이 방들은 두 가지가 틀려 있다.
  - **미리보기 글:** 실제 최신 메시지가 아니라 옛 「주문 요약」이 보인다.
  - **정렬:** 실제보다 최근 대화처럼 목록 위쪽에 놓인다.
- 10-02 이후 갱신된 방에는 같은 문제가 0건이다.

| 실제 최신 메시지 종류 | 방 수 | 고친 뒤 미리보기 |
|---|---|---|
| 상태 안내(system, 예: 「배달이 완료되었습니다.」) | 218 | 그 문장 |
| 일반 글(text) | 57 | 그 글 |
| 주문 요약(system, `store_order_summary`) | 6 | 현재 요약 원문 (시각만 바로잡힘) |
| 통화 기록(call_stub) | 5 | 앱 미리보기 함수(`listPreviewFromMessengerMessageRow`)와 같은 통화 문구 |
| 사진(image) | 2 | 앱과 같은 사진 문구 |
| 모두에게서 삭제됨 | 2 | 「삭제된 메시지입니다」 |
| 음성 메시지(voice) | 1 | 「음성 메시지」 |

## 2. 방법

- 모든 방에 대해 앱이 쓰는 재계산 결과(`listPreviewFromMessengerMessageRow` + A-6 삭제 문구)를 그대로 넣는다.
  - 대상 컬럼: `last_message`, `last_message_type`, `last_message_at`(= 실제 최신 메시지 시각).
- 텍스트·상태·주문 요약·삭제 행(283곳)은 SQL 한 번으로 고친다.
- 통화·사진·음성 8곳은 앱 함수 결과를 방마다 미리 뽑아 확인한 뒤 같은 트랜잭션에 넣는다.
- 적용 전후 대조:
  - 같은 조건의 「앞선 시각」 방 수가 **291 → 0** 이어야 한다.
  - 표본 10곳의 미리보기가 방 화면의 최신 메시지와 같아야 한다.

## 3. 영향

- `community_messenger_rooms` 의 UPDATE 트리거는 도메인 불변 검사(`guard_community_messenger_rooms_domain_immutable`) 하나뿐이다. 바꾸는 컬럼은 이 검사 대상이 아니다.
- 알림 발송, 안 읽음 수, 메시지 행은 바뀌지 않는다.
- 해당 사용자·매장 사장님 목록에서 이 방들이 **원래 자리(더 아래)로 내려가고** 미리보기가 실제 최신 메시지로 바뀐다. 목록을 다시 열면 반영된다.

## 4. 롤백

- 적용 직전에 291곳의 (id, last_message, last_message_type, last_message_at) 를 백업 테이블에 저장한다.
- 그 값으로 되돌릴 수 있다.

## 5. 적용 결과 (10-27 09:55 PHT, Owner 승인)

- 백업: `public.a17_store_order_preview_backup_20261027` (291행, RLS 켬). 열: id, last_message, last_message_type, last_message_at, updated_at.
- 적용: 한 트랜잭션에서 291곳 UPDATE. 미리보기 규칙은 서버 기본 재계산(`recomputeCommunityMessengerRoomLastMessage` → `canonicalRoomListPreviewFromMessageFields`)과 같다.
  - 삭제 → 「삭제된 메시지입니다」(text)
  - 관리자 숨김 → 숨김 문구
  - 사진 → 「사진」
  - 그 외 → 본문
- 대조:
  - 「앞선 시각」 방: **291 → 0**.
  - 「📋 주문 요약」 미리보기 방: 752 → 467. 이 가운데 6곳은 실제 최신 메시지가 주문 요약이라 그대로 맞다.
- 표본:
  - `e4bd81a2`·`7e7b9634`: 「삭제된 메시지입니다」 (07-31·06-04 → 05-23·06-04 실제 시각).
  - 통화 5곳: 통화 문구.
  - 사진 2곳: 「사진」.
- 참고: 음성 메시지 1곳(`d7bab26f`)은 서버 기본 규칙대로 본문(파일 주소)이 들어갔다. 지금 서버가 새 음성 메시지를 보낼 때 쓰는 값과 같다. 목록에서 이 방이 파일 주소로 보이는지는 확인하지 않음(NOT_PROVEN) — 음성 미리보기 규칙 자체는 범위 밖.
- 롤백: `update community_messenger_rooms r set last_message=b.last_message, last_message_type=b.last_message_type, last_message_at=b.last_message_at from public.a17_store_order_preview_backup_20261027 b where r.id=b.id;`
