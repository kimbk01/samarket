# 모임 4번 묶음 설계안 — 메신저 모임 방 (2026-11-28)

- 근거: 감사 `docs/audit/moim-full-audit-2026-11-27.md` §2 D1·D2·D6·D7
- 계약
  - `docs/moim-ssot.md` → 설계 v1 §2(모임·일정 채팅 표), §3.3, P9
  - 시안 U8 「모임 방 설정에는 **알림 끄기만** 있습니다. 나가기·초대 링크·내보내기 메뉴는 없고, 이런 일은 모임 홈에서 합니다」
  - **메신저 hard-lock** `docs/dibay-messenger-domain-group-hard-lock.md` §「MOIM-owned GROUP rooms」(Owner D1 승인 2026-11-12) — 「방 설정 시트: 나가기·방 삭제·초대·초대 링크 관리·내보내기·차단·역할·권한 숨김 → 「모임 홈으로 가기」 … 메시지 고정은 그대로」
- 상태: **설계안. 구현·DB 변경 없음.** 승인 뒤 구현한다.
- **이 묶음은 메신저 hard-lock 영역 변경이다.** 아래 §3 의 hard-lock 문서 갱신도 승인 대상에 들어간다.
- 반영 단위: PR 1개 · 병합 1회 · 운영 빌드 1회. 마이그레이션 1개(트리거 함수 1개).
  - 순서: 운영 DB 적용(승인) → Owner 「병합」. 자동 병합은 등록하지 않는다.
- [배포 구분] 웹만.

## 0. 확인한 사실 (main `63057603f` · 운영 DB 읽기 전용)

| 사실 | 근거 |
|---|---|
| 모임 방 메뉴 서랍(그룹 메뉴)에 메신저 「공지」 줄이 있고, 권한이 있으면 편집할 수 있다 | `CommunityMessengerRoomPhase2RoomSheets.tsx:504-525` (`vm.roomNotice` · `canEditGroupNotice`), `use-messenger-room-phase2-room-presentation.ts:282-284` (`!isMoimRoom` 없음) |
| 서버 공지 저장은 모임 방인지 보지 않는다. DB 트리거 `cm_moim_guard_rooms` 도 `notice_text` 를 막지 않는다 | `service.ts` `updateCommunityMessengerPrivateGroupNotice`, 운영 `cm_moim_guard_rooms` 정의 |
| 메시지 고정(`pinned_message_id`)은 hard-lock 문서가 「그대로」로 승인한 기능이다 | hard-lock §MOIM-owned GROUP rooms 「메시지 고정은 그대로」 |
| 방 정보 화면에 메신저 운영 칸(공지 상태·허용 권한 n/6·운영 기록)과 공지·권한·기록 버튼, 「멤버·위임 / 멤버 초대」 버튼이 모임 방에도 나온다. 숨기는 것은 나가기뿐이다 | `RoomSheets.tsx:1152-1235` |
| 일정 방도 「모임」 배지와 「모임 홈」 버튼이 나온다. `/api/moim/rooms` 는 `kind: "schedule"` 을 이미 돌려주지만 일정 id 는 주지 않는다 | `MessengerChatListItem.tsx:1149-1155`, `Phase2Header.tsx:514-522`, `app/api/moim/rooms/route.ts:50-55` |
| 채팅 목록 길게 누르기 메뉴는 모임 방 조회 응답 전에는 「나가기」를 보여 준다. 누르면 트리거 거부가 `leave_failed` → 500 일반 오류로 나간다 | `MessengerChatRoomActionSheet.tsx:179`, `rooms/[roomId]/leave/route.ts:55-63` |
| 위임 공통 함수 `moim__host_swap` 은 전체 방 역할만 바꾸고 일정 방은 건드리지 않는다. 2번 묶음 재감사의 「일정 방 역할도 덮는다」 지적은 사실이 아니다 | 운영 `pg_get_functiondef`: `select main_room_id into v_room` 만, `moim__rooms_of` 사용 없음 |

---

## 1. 항목별 설계

### D1 · 공지가 3군데 — 모임 공지 하나로
- **결정**: 모임 방의 공지는 **모임 게시판 공지 하나**로 한다(계약 §2 「기록이 남는 곳 = 모임 홈」, P9). 메신저 방 공지는 모임 방에서 쓰지 않는다. 메시지 고정은 hard-lock 승인대로 유지한다.
- **바꿀 것**
  1. 메신저 방 공지 편집 막기
     - 화면: `canEditGroupNotice` 에 `!isMoimRoom`(메신저 방 공지 편집 화면이 열리지 않음).
     - 서버: `updateCommunityMessengerPrivateGroupNotice` 가 `owner_domain='moim'` 이면 `moim_room_settings_managed_by_moim` 으로 거부.
     - DB: 트리거 `cm_moim_guard_rooms` 의 막는 칸에 `notice_text`·`notice_updated_at`·`notice_updated_by`·`allow_admin_edit_notice` 를 추가(마이그레이션). 트리거 함수는 다른 함수를 부르지 않는다는 기존 규칙(시험)을 지킨다.
  2. 모임 방 메뉴 서랍의 「공지」 줄을 **모임 공지**로 바꾸기
     - 서랍을 열 때만, 모임의 최신 고정 공지 1건을 가져온다(`GET /api/moim/[moimId]/posts?pinned=1&limit=1` — 글 목록 라우트에 `pinned` 조건 추가). 목록·방 열기 핫 경로에는 요청을 늘리지 않는다.
     - 공지가 있으면 제목(없으면 본문 첫 줄)을 보여 주고, 누르면 그 공지 글(`/moim/{id}/posts/{postId}`)로 간다.
     - 공지가 없으면 「모임 공지 보기」를 보여 주고, 누르면 공지 게시판(`/moim/{id}?tab=board&board={공지 게시판}`)으로 간다.
  3. 운영 데이터: 모임 방 5개 모두 `notice_text = ''`(2026-11-27 조회). 옮기거나 지울 데이터가 없다. 적용 직전 다시 조회한다.

### D2 · 일정 방에도 「모임」 배지·「모임 홈」 버튼
- **바꿀 것**
  - `/api/moim/rooms` 응답에 `scheduleId`(일정 방이면 `owner_ref_id`)를 더한다. 조회 수는 그대로다.
  - 채팅 목록 배지: 일정 방 = 「일정」(en "Meetup", 모임 탭 이름 `moim_home_schedules_tab` "Meetups" 과 같은 말). 모임 방은 「모임」 그대로.
  - 방 머리글 버튼: 일정 방 = 「일정 보기」 → `/moim/{moimId}/schedules/{scheduleId}`. 모임 방은 「모임 홈」 그대로.
- 계약 §2 표 「메신저 목록 표시: 「일정」 배지 + 일정 제목」, 「방 상단: 「일정 보기」 버튼」. 일정 제목은 방 제목이 이미 일정 제목과 맞춰져 있다(`moim_schedule_update`).

### D6 · 모임 방 정보 화면의 메신저 운영 칸
- **바꿀 것**: `RoomSheets.tsx` 방 정보의 「운영」 칸(공지 상태·허용 권한·운영 기록 카드, 공지·권한·기록 버튼, 「멤버·위임 / 멤버 초대」 버튼)을 모임 방에서는 그리지 않는다.
  - 대신 「모임 홈으로 가기」(일정 방은 「일정 보기」)를 보여 준다(hard-lock 문서의 방 설정 시트 규칙과 같다).
- **남는 것**: 알림 끄기(메뉴 서랍), 미디어·링크 보기, 멤버 목록 보기(읽기만). 시안 U8 「알림 끄기만」은 설정 항목 기준이고, 미디어·멤버 보기는 설정이 아니라 남긴다.

### D7 · 목록 길게 누르기 「나가기」가 응답 전에 보이고, 누르면 일반 오류
- **바꿀 것**
  1. 서버 `rooms/[roomId]/leave/route.ts`: 모임 방 트리거 거부(`moim_room_membership_managed_by_moim`)를 409 + 그 코드로 돌려준다. 지금은 `leave_failed` → 500 이다. 다른 그룹 방 나가기 오류 처리는 그대로다.
  2. 화면: 나가기 실패가 이 코드면, 일반 오류 대신 「모임 채팅방은 모임에서 나가요」(기존 키 `moim_err_moim_room_membership_managed_by_moim`)를 보여 주고 [모임 홈] 이동을 제공한다.
- **근거**: 모임 방인지 판정하는 조회는 응답 전·실패 때 알 수 없다. 그래서 서버가 정확한 이유를 돌려주는 쪽이 근본이다. 메뉴를 응답 전에 숨기면 일반 그룹 방도 잠깐 나가기가 사라진다.

---

## 2. 함께 바뀌는 문구 (ko·en, 키로만)

- `moim_chat_list_badge_schedule`: 「일정」 / "Meetup"
- `moim_room_schedule_btn`: 「일정 보기」 / "View meetup"
- `moim_room_notice_label`: 「모임 공지」 / "Group notice"
- `moim_room_notice_empty`: 「모임 공지 보기」 / "View group notices"

## 3. 메신저 hard-lock 문서 갱신 (승인 대상)

`docs/dibay-messenger-domain-group-hard-lock.md` §MOIM-owned GROUP rooms:
- 「막힌 메신저 쪽 쓰기」에 **방 공지(notice_text·공지 권한)** 를 추가한다.
- 「화면」에 다음을 적는다.
  - 방 정보 운영 칸 숨김 → 모임 홈/일정 보기
  - 메뉴 서랍 공지 = 모임 게시판 최신 고정 공지
  - 일정 방 = 「일정」 배지·「일정 보기」
  - 나가기 거부는 409 `moim_room_membership_managed_by_moim`
- 「메시지 고정은 그대로」는 유지한다.

## 4. 검증 계획

- 로컬 Postgres(운영 정의 md5 대조): 수정 전에는 모임 방 `notice_text` 갱신이 통과하고, 수정 후에는 `moim_room_settings_managed_by_moim` 으로 거부된다. 일반 그룹 방 공지 갱신은 그대로 통과한다.
- 시험(수정 전 실패 재현):
  - 공지 편집 권한 판정(모임 방 false)
  - 서버 공지 저장 거부
  - 나가기 409 코드
  - rooms DTO `scheduleId`
  - 배지·버튼 문구 분기
  - 글 목록 `pinned` 조건
- vitest 전체, typecheck:build·test, eslint, check:i18n-quality, 메신저 관련 `verify:*` 각 1회.
- 독립 재감사 통과 뒤 PR(자동 병합 없음) → DB 적용 승인 → 「병합」.

## 5. 롤백

- DB: `cm_moim_guard_rooms` 이전 정의(적용 전 백업 파일)로 되돌린다.
- 코드: Instant Rollback.
