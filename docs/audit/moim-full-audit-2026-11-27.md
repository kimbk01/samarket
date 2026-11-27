# 모임(moim) 전체 감사 — 재검증판 (2026-11-27)

- 지시
  - Owner 2026-11-27 「모임 부분을 전체 감사 … 생성·가입·비밀번호·운영자 권한 … 인원수 UI/UX/CTA SSOT … 방제·방 공지 … 방 생성 누수·호출 과다·병목 … 디자인(버튼·메뉴)」
  - 추가 「모임의 주소 부분이 명확하지 않고 대표 주소를 요청하는 결함」
  - 추가 「대충 확인하지 말고 정확히 … 추측 금지」
  - 추가 「남은 위험·결정 필요는 없어야 하고, 레거시 앱 구조와 권장안을 원함」
- 범위: **감사·보고만.** 코드와 운영 DB 는 바꾸지 않았다.
- 계약 문서 (아래 순서대로 적용)
  1. `docs/moim-ssot.md`
  2. `docs/design/moim/moim-design-v1-2026-11-12.md` (이하 「설계」)
  3. 시안 `docs/design/moim/moim-mockup-2026-11-12.html`
  4. `docs/audit/moim-open-items-audit-2026-11-12.md`

## 0. 확인 방법 (항목마다 아래 중 하나 이상으로 직접 확인)

| 근거 | 방법 |
|---|---|
| **운영 DB 정의** | 운영 Supabase(`ckdosyydvgzqwpbwuhon`)에서 함수 본문(`pg_get_functiondef`)·트리거·인덱스·FK 를 읽음. 저장소 마이그레이션이 아니라 **지금 운영에서 실제로 쓰는 정의** |
| **운영 DB 데이터** | 읽기 전용(`begin read only … rollback`)으로 조회. 2026-11-27 밤(PHT) |
| **main 코드** | 운영 main `3a5b5454f`(2026-11-27 22:29 PHT)를 `git archive` 로 꺼내 줄 단위로 읽음. 작업 폴더 브랜치는 main 보다 뒤처져 있어 쓰지 않음 |
| **실행 결과** | 앱의 주소 판정 함수(`deriveAddressLocation`, main 과 같은 파일)에 운영 주소 26건을 넣어 vitest 로 실행 |

- 앱 화면은 열지 않았다(앱 실행·운영 사이트 열기 0회, 실기기 시험 상한 규정).
- 화면 문구와 버튼은 그 화면을 그리는 main 코드로 판정했다.
- 운영 실데이터: 모임은 5개(활성 1, 종료 4)이고, 모두 멤버가 1명이다. 메신저 오픈채팅은 8개다.

## 1. 요약

| 영역 | 확정 결함 | 가장 큰 것 |
|---|---|---|
| 주소 | 2 | 대표 주소가 있는 회원 62명 중 26명에게 모임이 「대표 주소를 먼저 등록」을 요구한다. 그중 25명은 앱 주소 판정으로 도시가 바로 확정되는 주소다 |
| 생성·가입·초대·권한 | 13 | 권한표 위반(운영진에게 내보내기·차단을 열 수 있음), 탈퇴 처리 없음(계정 영구 삭제가 FK 로 막힘), 일정 빈자리 막힘, 알림 2종 누락 |
| 비밀번호 (오픈채팅) | 1 | 길이 제한 없음, salt 없는 sha256 한 번, 틀린 횟수 잠금 없음 |
| 인원수·방제·공지 | 7 | 공지가 3군데로 나뉘고, 모임 방 안에서 메신저 공지를 고칠 수 있다. 방 정보에 메신저 운영 칸이 그대로 나온다 |
| 호출·병목·누수 | 9 | 공지 1건마다 받는 사람 수에 비례하는 조회가 요청 안에서 동시 실행된다. 하위 화면마다 상세를 다시 부른다(15~17회). 중복 생성을 막는 장치가 없다 |
| 디자인 (버튼·메뉴) | 11 | 버튼 체계가 두 벌이다. 위험 동작(숨기기)이 초록 기본 버튼이다. 탭 순서와 시안 요소 3개가 시안과 다르다 |

이전 보고(같은 날 1차)에서 재검증 결과 근거가 부족했던 7건은 §5 에서 정정했다.

---

## 2. 확정 결함 (항목마다 근거·계약·실패 상황)

### A. 주소

**A1 · P1 · 대표 주소가 있는데 「대표 주소를 먼저 등록」을 요구함**

- **운영 DB 데이터**
  - 활성 대표 주소(`is_active and is_default_master`)를 가진 회원은 62명이다.
  - 그중 26명은 `canonical_lgu_id` 가 비어 있다. 26명 모두 필리핀 주소와 위도·경도가 있다. 등록 시기는 2026-04~11월이다.
- **실행 결과**
  - 26건을 앱의 주소 판정 단일 함수 `deriveAddressLocation` (`lib/addresses/address-location-ssot.server.ts:151`)에 넣었다.
  - **25건은 LGU 가 확정됐다**: Manila 1380600000, Quezon City 1381300000, Makati 1380300000, Parañaque 1381000000, Angeles, Dona Remedios Trinidad.
  - 확정되지 않은 1건은 도시 칸이 비어 있고 「Barangay Ortigas Center, Metro Manila」만 있는 주소다.
- **원인 (main 코드 · 운영 정의)**
  - 모임은 저장된 LGU 칸만 읽는다.
    - 목록: `lib/moim/server/moim-queries.server.ts:111-123` `loadViewerMoimLgu` 가 `canonical_lgu_id` 만 읽는다. 값이 없으면 `app/api/moim/route.ts:30` 이 `hasAddress:false` 를 돌려준다.
    - 개설: 운영 `moim_create` 본문은 `select a.canonical_lgu_id … if v_lgu is null … moim__fail('moim_address_required')` 이다.
  - 회원 가입 판정은 대표 주소가 **있는지만** 본다(`lib/auth/resolve-member-registration-authority.ts:40-45`). 그래서 26명은 가입 완료 상태다.
  - 주소 단일 정의 파일의 머리 주석은 「조회: 비어 있는 칸만 이 결과로 채워 내려준다 … 홈 헤더·커뮤니티·거래·내정보·배달은 모두 이 값이 채워진 DTO 만 읽는다」이다. 알림 캠페인도 `resolveAddressCanonicalLguId` 로 LGU 를 채운다(`campaign-target-scan.ts:13-17`).
  - **모임만 이 단일 정의를 쓰지 않는다.**
- **실패 상황 (main 코드)**
  - 「모임」 탭의 우리 동네 목록에 「대표 주소를 등록하면 우리 동네 모임을 볼 수 있어요」와 [주소 등록하기]가 나온다(`MoimLocalList.tsx:16-27`).
  - [주소 등록하기]는 이미 등록된 주소 목록으로 간다. 회원은 무엇을 해야 하는지 안내받지 못한다.
  - 주소 수정 저장(`user-address-service.ts:597-605`)이나 대표 지정(`:62`)을 하면 LGU 가 채워진다. 하지만 화면이 이 방법을 알려 주지 않는다.
  - 모임을 만들면 4단계까지 다 입력한 뒤 제출할 때 「대표 주소를 먼저 등록해 주세요」가 나온다(`MoimCreateWizard.tsx:125-128`).
  - 가입(`moim_join`)은 주소를 보지 않으므로 이 회원들도 가입할 수 있다(운영 함수 중 `user_addresses` 를 읽는 것은 `moim_create` 하나).
- **계약**
  - 설계 P1 3단계 「활동 동네(기본 주소의 도시 …)」
  - 설계 P2 「같은 LGU」 노출

**A2 · P1 · 만들기 화면 「활동 동네」 칸에 도시 이름이 없음**

- main `MoimCreateWizard.tsx:209-212`: 제목 `moim_create_area_label` 과 안내 `moim_create_area_hint`(「대표 주소의 도시로 정해져요. 바꾸려면 내 주소를 바꿔 주세요」)만 있고, 도시 값은 출력하지 않는다.
- 계약: 설계 P1 3단계 「활동 동네(기본 주소의 도시 …)」, 시안 U2(만들기 3/5).
- 실패 상황: 만드는 사람은 어느 도시 모임인지 모른 채 만든다. LGU 가 없는 26명은 이 단계에서 아무 안내도 받지 못한다.

### B. 생성·가입·초대·권한

| ID | 등급 | 근거 | 계약 원문 | 실패 상황 |
|---|---|---|---|---|
| B1 | P1 | **운영 정의** `moim__deactivate_member`: 일정 참여를 `status='cancelled'` 로 바꾼 뒤 `moim__refresh_count` 만 부르고 `moim__schedule_refresh` 는 부르지 않는다. `moim_schedule_participants` 에 트리거가 없다(운영 트리거 목록) | P5 「참여 확정된 다가오는 일정은 자동 취소」, P10 정원 | 정원이 찬 일정(`full`)에서 확정 참여자가 모임을 나가거나 내보내져도 `confirmed_count`·`full` 이 그대로다. 빈자리가 생겨도 다른 멤버는 참여할 수 없다 |
| B2 | P1 | main `moim-notify.server.ts:15-38` 종류 목록에 `moim_member_joined` 가 없다. 전체 코드에서 보내는 곳이 0곳이다. `join/route.ts:34` 는 `status === "pending"` 일 때만 알린다 | §7 `moim_member_joined` → 모임장, 벨(묶음) | 바로 가입 모임에 새 멤버가 들어와도 모임장에게 알림이 없다 |
| B3 | P1 | **운영 정의** `moim_invite_respond`: 초대한 사람이 운영진 미만이면 `moim_join` 을 그대로 실행한다(승인제 → pending). main `invites/[inviteId]/route.ts` 에는 알림 호출이 없다 | §7 `moim_join_requested` → 승인권자 | 승인제 모임에서 멤버가 보낸 초대를 수락하면 가입 신청이 생기지만, 승인권자는 알림을 받지 못한다 |
| B4 | P1 | **운영 정의** `moim_invite_send`: 자기 자신·이미 멤버·모임 차단·7일 간격만 검사한다. main `invites/route.ts` 도 검사 없이 RPC 와 `moim_invited` 푸시를 보낸다 | P4 「메신저에서 나를 차단한 사람에게는 보낼 수 없다」 | 나를 차단한 사람에게도 초대와 푸시가 간다 |
| B5 | P1 | main `lib/community/community-write-restriction.ts:50-51,56-57`: 「lookup failed (allowing)」 → `return null`(허용). `:90` 서비스 클라이언트가 없을 때도 허용 | 설계 P1 「`assertCommunityWriteAllowed` 를 쓰되, 조회 실패 시 **거부**하도록 바꾼다」 | 제재 조회가 실패하는 동안 이용 제한 중인 회원도 개설·가입·글쓰기를 할 수 있다 |
| B6 | P1 | **운영 정의** `moim_permission_defaults`: `('remove_member','co_host',true,'staff')`, `('ban_member','co_host',true,'staff')`, `('write_note','co_host',true,'staff')`. main `moim-permission-contract.ts:58-60` 도 같다 | 설계 §5.2 「멤버 내보내기 O O X X」「멤버 차단 O O X X」(조정 없음), 「운영진 메모 O / O(조정) / O(조정)」. 시안 U7 「내보내기·차단은 모임장·부모임장만」 | ① 모임장이 권한 설정에서 운영진에게 내보내기·차단을 열 수 있다 ② 운영진은 기본값으로 메모를 쓸 수 없다 |
| B7 | P1 | **운영 정의** `moim_create`·`moim_update_info`·`moim_admin_update_info`: 금지어 검사는 `v_name`·`v_intro` 만 한다. 질문은 `insert … left(btrim(...),200)` 로 그대로 저장한다. **운영 `moim_policies.banned_words` = `[]`**(빈 목록) | 설계 §4 「가입 질문에서 실명·전화번호·신분증 요구를 금지한다. **질문을 저장할 때 금지어를 검사**」 | 「실명·전화번호를 적어 주세요」 질문이 저장된다. 금지어 목록도 비어 있어 이름·소개 검사도 지금은 아무것도 막지 않는다 |
| B8 | P1 | **운영 FK**: `moims.host_user_id`, `moim_members.user_id` 등 모임 표 14개 FK 가 `profiles` 를 **ON DELETE NO ACTION** 으로 참조한다. `profiles.id → auth.users` 는 CASCADE 다. 영구 삭제 사전 점검 함수 `admin_can_purge_auth_user`·`admin_prepare_auth_user_purge` 본문에 모임이 없다. `account_withdrawal` 종류는 정의(`m2:313`)와 문구만 있고 만드는 코드가 0곳이다 | 설계 P8 「모임장이 DIBAY 를 탈퇴하면 … 자동 위임. 멤버가 없으면 모임을 종료」 | 모임 행이 있는 회원을 영구 삭제하면 `auth.users` 삭제 → `profiles` 연쇄 삭제가 모임 FK 에 걸려 **삭제 자체가 실패**한다. 운영 모임장 5명이 해당된다. 탈퇴(삭제 전)한 모임장은 그대로 모임장으로 남는다 |
| B9 | P2 | **운영 정의** `moim_member_role_set`: 역할을 바꾸면 `moim__rooms_of`(전체 방 + **일정 방**)를 모두 돌며 메신저 역할을 바꾼다. `moim__room_member_role` 은 `owner` 가 아니면 `owner_user_id` 를 바꾸지 않는다 | 설계 §3.3 일정 방 방장 = 일정 호스트 | 일정 호스트(일정 방 owner)의 모임 역할을 운영진이나 멤버로 바꾸면, 일정 방 참여자 역할이 `member` 로 내려간다. 방 `owner_user_id` 는 그대로라 둘이 어긋난다 |
| B10 | P2 | **운영 정의** `moim_update_info`: `delete from moim_join_questions` 후 다시 넣는다. main `moim-queries.server.ts:463` 은 `questions.map((q, i) => ({ question: q, answer: answers[i] }))` 로 순서 번호만 맞춘다 | 설계 P3 「운영진에게만 보이는 것: 가입 질문 답변」 | 대기 신청이 있는 상태에서 질문 1을 지우면, 승인권자 화면에서 질문 2 옆에 질문 1의 답이 붙는다 |
| B11 | P2 | main `MoimCreateWizard.tsx:91-97`: `name.trim().length > 0 && intro.trim().length > 0` 만 본다. 이름·소개에 `maxLength` 가 없다 | 설계 P1 「이름(2~30자)·소개(10~1,000자)」, 운영 정책값 2·30·10·1000 | 1자 이름이나 1자 소개로 4단계까지 진행한 뒤에야 서버 오류가 난다 |
| B12 | P2 | **운영 정의** `moim__host_swap`(위임 수락·어드민 지정·미접속 변경 결정이 모두 부름): 이전 모임장을 `co_host` 로 바꿀 때 `max_co_hosts` 를 검사하지 않는다. `moim_member_role_set` 은 검사한다 | 운영 `moim_policies.max_co_hosts = 2` | 부모임장이 이미 2명인데 위임하면 부모임장이 3명이 된다 |
| B13 | P2 | **운영 정의** `moim_close`: 일정 `cancelled`, 신청 `expired` 로 바꾸지만 `moim_members.status='pending'` 은 바꾸지 않는다. main `close/route.ts` 는 `moim_closed` 만 보낸다 | 설계 P15·§7 `moim_schedule_cancelled`(확정 참여자, 끌 수 없음) | 일정 참여자는 「모임 종료」 알림만 받고 일정 취소 알림은 받지 못한다. 신청자 멤버 행은 `pending` 으로 영구히 남는다 |

### C. 비밀번호 (메신저 오픈채팅 — 모임에는 비밀번호가 없고, 이는 계약과 같다)

**C1 · P1 보안**

- main `lib/community-messenger/open-group-password.ts:9-17`: `createHash("sha256").update(password.trim())` 한 번이고, salt 없이 `===` 로 비교한다.
- main `service.ts:11957-11969`(생성)·`:12640`(수정): 비어 있는지만 검사하고 **길이 제한이 없다.** 메신저 화면 코드에도 길이 제한이 없다.
- 입장 라우트 `open-groups/[roomId]/join/route.ts:16-20`: 계정당 20회/분만 제한한다. 틀린 횟수에 따른 잠금은 없다.
- 실패 상황
  - 1자리 비밀번호도 만들 수 있다.
  - 4자리 숫자(1만 가지)는 계정 1개로 최대 500분이면 모두 시도할 수 있다.
  - 해시가 유출되면 짧은 비밀번호는 바로 복원된다.
- 운영 데이터: 오픈채팅 8개 모두 `join_policy='free'`, 비밀번호 0개.

### D. 인원수·방제·공지

| ID | 등급 | 근거 | 계약 원문 | 실패 상황 |
|---|---|---|---|---|
| D1 | P1 | 공지가 3군데다: 게시판 공지(`moim_posts`), 메신저 방 공지(`notice_text`), 메신저 고정 메시지(`pinned_message_id`).<br>- main `use-messenger-room-phase2-room-presentation.ts:282-284` `canEditGroupNotice` 에 `!isMoimRoom` 이 **없다**(바로 아래 권한·역할·내보내기·정보 수정은 모두 `!isMoimRoom`).<br>- 서버 `service.ts` `updateCommunityMessengerPrivateGroupNotice` 는 `owner` 또는 `admin && allow_admin_edit_notice` 만 본다.<br>- **운영 트리거** `cm_moim_guard_rooms` 막는 칸에 `notice_text` 가 없다.<br>- **운영 정의** `moim__room_create` 는 `allow_admin_edit_notice = true` 로 방을 만든다 | 시안 U8 「모임 방 설정에는 **알림 끄기만** 있습니다」, 설계 §2 「기록이 남는 곳 … 모임 홈」, P7 「메신저 방 권한(공지 고정 등)은 이 역할에 맞춰 서버가 같이 바꾼다」 | 모임장·부모임장은 채팅방 안에서 모임 게시판과 별개인 메신저 공지를 쓸 수 있다. 운영진은 메신저 역할이 `member`(운영 `moim__cm_role`)라 메신저 공지는 못 쓰지만 게시판 공지는 쓴다. 채팅방 상단에는 모임 게시판 공지가 나오지 않는다 |
| D2 | P1 | main `MessengerChatListItem.tsx:1149-1155` 배지는 `moimRoomOwner ? t("moim_chat_list_badge")` 로 `kind` 를 보지 않는다. `Phase2Header.tsx:514-522` 는 일정 방도 `/moim/{moimId}` + 「모임 홈」이다. `/api/moim/rooms` 는 `kind: "schedule"` 을 이미 돌려준다(`route.ts:54`) | 설계 §2 표 「메신저 목록 표시: 「일정」 배지 + 일정 제목」「방 상단: 「일정 보기」 버튼」 | 일정 방에도 「모임」 배지와 「모임 홈」 버튼이 나오고, 일정 상세로 바로 가는 길이 없다 |
| D3 | P2 | main `moim-screens.ts:327` en `"{count} members"`. 운영 모임 5개는 모두 1명이다 | i18n SSOT §4 짧고 자연스러운 영어 | 영어 화면의 모든 모임 카드에 「1 members」가 나온다 |
| D4 | P2 | **운영 정의** `moim_create`: 공지 게시판 `write_min_role='staff'`. `moim_board_upsert` 는 `v_kind <> 'notice'` 일 때만 바꾼다(공지 게시판 쓰기 권한은 고정). 고정은 `pin_notice`(조정 가능) | 설계 §5.2 「공지 작성·고정」 한 줄, 운영진 「O (조정)」 | 모임장이 공지 권한을 부모임장 이상으로 올려도 운영진은 공지 글을 계속 쓸 수 있다. 고정만 막힌다 |
| D5 | P2 | main `MoimDetailScreen.tsx:204` `if (isMember) items.push({ key: "leave" …` 로 역할을 보지 않는다 | 설계 P5 「**모임장은 위임 전에는 나갈 수 없다** … [모임 종료]를 안내」, 시안 U4 ≡ 메뉴 | 모임장 메뉴에 「모임 나가기」가 있고, 누르면 오류만 나온다 |
| D7 | P2 | main `MessengerChatRoomActionSheet.tsx:179` `isMoimRoom = … Boolean(peekMoimRoomOwner(room.id))` 는 캐시만 본다. 캐시는 `/api/moim/rooms` 응답 뒤에만 채워지고(`use-moim-room-owner.ts:26`), 실패하면 끝내 채워지지 않는다. 서버 `rooms/[roomId]/leave/route.ts:55-63` 는 트리거 거부를 `LEAVE_FAILED` → 500 으로 돌려준다 | 설계 §3.3 「앱 화면에서도 해당 메뉴를 숨긴다」 | 응답 전이거나 조회에 실패했을 때 채팅 목록 길게 누르기 메뉴에 「나가기」가 보이고, 누르면 일반 오류가 뜬다(데이터는 DB 가 막아 그대로) |
| D6 | P2 | main `RoomSheets.tsx:1152-1215`: `vm.isPrivateGroupRoom` 이면 모임 방에도 메신저 「운영」 칸(공지 상태·허용 권한 n/6·운영 기록)과 공지·권한·기록 버튼, `isOwner ? 「멤버·위임」 : 「멤버 초대」` 버튼이 나온다. 숨겨지는 것은 나가기 버튼(`:1217`)뿐이다 | 시안 U8 「모임 방 설정에는 알림 끄기만」, 설계 §3.3 「앱 화면에서도 해당 메뉴를 숨긴다」 | 모임 방 정보에서 메신저 운영 메뉴가 보인다. 모임장에게는 「멤버·위임」이 보이지만 위임은 DB 가 막는다(`cm_moim_guard_rooms` owner 변경 거부) |

- **방제 — 확인 결과 결함 없음**
  - 근거: **운영 정의** `moim_update_info` 가 방 `title`·`avatar_url` 을 같이 바꾼다. `cm_moim_guard_rooms` 가 메신저 쪽 `title` 변경을 거부한다. main `canEditPrivateGroupMeta` 에 `!isMoimRoom` 이 있다.
  - 운영 데이터 5/5 일치.
- **인원 계산 — 확인 결과 결함 없음**
  - 근거: **운영 정의** `moim__refresh_count` 가 가입·탈퇴 트랜잭션 안에서 `active` 를 다시 센다.
  - 운영 데이터 5/5 일치. 메신저 참여자도 같은 트랜잭션에서 넣고 빼므로 숫자가 같다.

### E. 호출·병목·누수 (main 코드 기준 호출 수)

| ID | 등급 | 근거 | 영향 |
|---|---|---|---|
| E1 | 높음 | main `posts/route.ts:52-64`, `schedules/route.ts`, `close/route.ts`, `host-transfers/[transferId]/route.ts`: 요청 안에서 `await notifyMoimMany`. `notifyMoimMany` 는 `Promise.all(uniq.map(sendOne))` 로 동시 실행 수 제한이 없다(`moim-notify.server.ts:95-101`). `sendOne` 은 받는 사람마다 `user_settings`·`user_devices` 조회 2회 + `appendUserNotification`(차단 확인 + 알림 생성·발송)을 한다 | 공지 1건에 멤버 M명이면 2M회 이상의 조회와 M건의 알림 생성이 한 요청 안에서 동시에 나간다(운영 정원 상한 300 → 최대 600회 이상). 요청 예산이 없는 라우트다 |
| E2 | 높음 | main `useMoimDetail`(`MoimDetailScreen.tsx:36-54`)은 캐시가 없다. 글 상세·글쓰기·일정 상세·일정 폼·프로필·알림 설정·운영 화면 공용(`moim-manage-shared.tsx`), 7곳이 각자 다시 부른다 | 하위 화면을 열 때마다 상세 1회(아래 E3, 15~17회)가 더 나간다 |
| E3 | 중간 | main `getMoimDetail`(`moim-queries.server.ts:330-407`): 접근 3회 → 병렬 9회 → 순차 `toPosts` 2번(각각 작성자 0~1회 + 게시판 1회) → 다가오는 일정 1회 | 멤버 기준 15~17회(모임장 +1). `moim_boards` 를 한 요청에서 3번 읽고, 순차 단계가 4개다 |
| E4 | 중간 | main `listReceivedMoimInvites`(`:572-578`): 반복문 안에서 `await authorMap` | 받은 초대 N건(최대 50)이면 순차 조회 N회. `/moim` 탭을 열 때마다 개수 표시용으로만 부른다(`MoimTabHome.tsx:57`) |
| E5 | 중간 | **운영 인덱스**: `moims` 에 (생성자, 동네, 이름) 유니크가 없다. **운영 정의** `moim_create` 에 `for update`·advisory 잠금이 없고, 중복·개수 검사는 `exists`·`count` 뿐이다. POST 에 멱등 키가 없다 | 같은 사용자의 개설 요청 두 개가 동시에 처리되면 두 트랜잭션 모두 검사를 통과해 모임과 방이 2개씩 생긴다(READ COMMITTED 동작). 1인 개설 수 상한(5)도 같은 이유로 넘을 수 있다 |
| E6 | 중간 | main `lib/perf/request-budget.ts:49,76,97`: 모임 예산은 `/api/moim`·`/api/moim/rooms`·예약 작업 3개뿐이다 | 상세·게시판·일정·앨범·멤버·글 라우트가 요청 예산 계약(`docs/request-budget-ssot.md`) 밖에 있다 |
| E7 | 낮음 | main `MoimCreateWizard.tsx:184` `onClick={() => setCover(null)}`, `:103-104` 사진을 다시 고르면 덮어쓰기만 한다 | 올린 대표 사진을 지우거나 바꾸거나 만들기를 그만두면 저장소에 파일이 남는다 |
| E8 | 낮음 | main `use-moim-room-owner.ts:18-27,36`: `flush` 가 `pending` 을 비운 뒤 응답 전에는 `cache` 에 없다 | 응답을 기다리는 동안 같은 방 행이 다시 그려지면 `/api/moim/rooms` 를 중복 호출한다 |
| E9 | 낮음 | **운영 인덱스** `moim_invites` 에 `moim_id` 인덱스가 없다(초대 링크 목록은 `moim_id` 로 조회). `request-budget.ts:76` 예약 작업 예산 7.0 은 `moim_cron_tick` 한 번으로 합치기 전 값이다(`cron/moim-schedules/route.ts:39`) | 모임 수가 늘면 순차 스캔이 된다. 규정 「줄인 변경은 같은 PR 에서 예산 값을 낮춘다」를 지키지 않았다 |

확인 결과 결함 없음:
- 개설은 운영 `moim_create` 함수 하나, 트랜잭션 하나다. 방 생성이 실패하면 전체가 롤백된다.
- 모임 화면에는 Realtime 구독·폴링이 없다. 타이머와 리스너는 cleanup 에서 해제된다.
- 목록은 커서로 페이지를 나눈다.

### F. 디자인 — 버튼·메뉴 (main 코드)

- 버튼 클래스 실제 모양(`app/samarket-components.css:251-288`)
  - `secondary`: 연한 초록 채움
  - `outline`: 흰 바탕 + 회색 테두리
  - `danger`: 연한 빨강
  - `ghost`: 투명
  - `outline-primary`: 흰 바탕 + 초록 테두리

| ID | 등급 | 근거 | 규칙·계약 | 실패 상황 |
|---|---|---|---|---|
| F1 | P1 | `MoimManageReports.tsx:124` 「숨기기」 = `Sam.btn.primaryCombo` | 위험 동작 구분 | 콘텐츠를 숨기는 버튼이 화면에서 가장 강한 초록 기본 버튼이다 |
| F2 | P1 | `MoimAlbum.tsx:206` `actionBtn` 하나로 고정·삭제·신고를 같은 모양으로 그린다. `disabled:opacity-50` | Sam 클래스 사용, 비활성은 `disabledToken` | 삭제가 다른 동작과 구분되지 않는다 |
| F3 | P1 | secondary 가 두 벌이다. 멤버 화면 `moim-ui.tsx:23` `btnSecondary = outlineCombo`(흰 바탕), 운영 화면은 `secondaryCombo`(초록 채움)를 13곳에서 쓴다(Requests:87, Reports:116, Invite:154·158, Boards:94·106, Members:221, Info:143, shared:95·108). 여기에 `outlinePrimaryCombo`(Boards:127), `ghostCombo + text-sam-danger`(Invite:164, Boards:114)가 섞여 있다 | UI 토큰 규칙(시맨틱 클래스 한 체계) | 같은 「거절·취소·보기」가 화면마다 흰색·초록·투명으로 다르게 보인다. 가입 신청 화면의 거절(초록 채움)과 승인(초록)이 잘 구분되지 않는다 |
| F4 | P1 | `MoimMemberView.tsx:245`(일정 만들기)·`:325`(글쓰기) = `btnSecondary btnSm` | 화면 핵심 CTA | 멤버 홈의 핵심 행동이 작은 흰 버튼이다 |
| F5 | P2 | `MoimMemberView.tsx:78-84` 탭 순서 홈·**일정·게시판**·앨범·멤버. 처음 만든 M4 커밋(884e5800c) 이후 바뀐 적이 없다 | 설계 §9 「홈 · 게시판 · 일정 · 앨범 · 멤버」, 시안 U4 같은 순서 | 탭 순서가 시안과 다르다 |
| F6 | P2 | `MoimScheduleDetailScreen.tsx:319` 「일정 취소」 = `btnSecondary`, `:538` 같은 문구 = `btnDanger` | 같은 동작 같은 모양 | 같은 화면 안에서 같은 버튼이 두 가지 모양이다 |
| F7 | P2 | `MoimPublicView.tsx:114,129` 정원 마감·가입 불가를 `disabled` `btnPrimary` 로 표시 | 버튼과 안내 구분 | 누를 수 없는 버튼과 안내가 구분되지 않는다 |
| F8 | P2 | `MoimManageHub.tsx:91` `›` 문자, `MoimTabHome.tsx:120` `›`, `MoimManageMembers.tsx:194` `⋯` 문자. 그 밖의 곳은 `MoreVertical`·`ChevronRight` 아이콘(9곳). 허브 대기 건수 배지가 `Sam.badge.danger`(`:88`) | 아이콘 일관성 | 같은 의미의 표시가 문자와 아이콘으로 섞여 있다. 처리할 신청 건수가 오류처럼 빨갛게 보인다 |
| F9 | P2 | 운영 화면 저장 버튼(Info:297, Permissions:104, Invite:296, Transfer:96, HostRequest:125, Close:69)이 본문 끝에 있다. 멤버 화면 7곳은 `MoimStickyFooter` 를 쓴다 | 하단 버튼 줄 통일(커밋 41ecdba05 「모임 화면 7곳 공용 하단 줄로 통일」) | 운영 화면에서는 저장하려면 끝까지 스크롤해야 한다 |
| F10 | P2 | `MoimPostDetailScreen.tsx:210` 댓글 ⋮ `h-8 w-8`(32px) | `--sam-tap-min: 44px`(`design-tokens.css:263`) | 터치 영역이 기준보다 작다 |
| F11 | P2 | 시안 요소 누락: U4 머리글 ⌕(모임 안 검색, `MoimDetailScreen`·`MoimMemberView` 에 없음), U5 일정 상세 머리글 ⤴·⋮(`MoimScheduleDetailScreen` 에 없음, 수정·마감·취소가 본문에 나열됨), U7 멤버 시트 「✉ 대화하기」(`MoimManageMembers.tsx:72-102` 항목은 역할·메모·내보내기·차단뿐) | 승인 시안 = 구현 | 시안에 있는 기능 3개가 없다 |
| F12 | P2 | 메신저 목록 모임 배지 `MessengerChatListItem.tsx:1152` `rounded-[6px]` | 반경 규칙(4px 또는 pill) | 반경 규칙에 맞지 않는다 |

참고: 모임 탭 홈의 카테고리가 칩이 아니라 2단 밑줄 탭인 것은 Owner 「3판대로 구현」(커밋 830a8b686, 2026-11-12) 지시에 따른 것이라 결함이 아니다.

---

## 3. 레거시 앱 구조 비교와 권장안

출처 표기:
- 「공식」= 카카오 고객센터·카카오 공식 공지·당근 FAQ
- 「2차」= 블로그·기사
- 당근 FAQ 원문 분석은 `docs/audit/meetings-moim-audit-design-2026-11-12.md` §2 에 있다.

| 영역 | 당근 모임 | 카카오 오픈채팅 / 팀채팅 | DIBAY 현재 | **권장안** |
|---|---|---|---|---|
| 동네·주소 | 내 동네 인증 기준으로 모임 동네를 정하고, 만들 때 동네 범위를 고름(기존 감사 §2.1) | 지역 개념 없음 | 대표 주소의 LGU 칸만 보고, 화면에 도시 이름이 없음(A1·A2) | 모임 동네 = 주소 단일 정의(`deriveAddressLocation`) 결과 하나로 판정한다. 만들기 2단계에 「활동 동네: Quezon City」를 값으로 보여 준다. 판정이 안 되는 주소면 그 자리에서 [주소 확인] 한 번으로 해결하게 한다. LGU 가 빈 기존 주소 26건은 같은 함수로 채운다(25건 확정, 1건은 회원에게 주소 확인 요청) |
| 생성 | 주제 → 이름·소개 → 연령·정원 → 동네 → 질문·승인 순서. 같은 목적 반복 개설 제한 | 방장 방 최대 20개(공식). 짧은 시간에 많이 만들면 자동 제한(공식) | 단계 구성은 같다. 중복 생성 방지 장치 없음(E5). 길이 검사는 서버에만 있음(B11) | 개설 요청에 멱등 키와 DB 유니크(생성자·동네·이름, 활성만)를 둔다. 입력 단계에서 2~30자·10~1,000자를 바로 보여 준다(정책값을 화면이 읽음) |
| 가입 | 바로 가입 / 승인(질문). 모임별 프로필. 실명·전화번호 요구 금지(FAQ 3730) | 입장 조건(성별·출생연도, 본인인증 방장만 — 공식). 프로필 정책은 개설 시 고정(공식) | 같은 구조. 질문 금지어 검사 없음, 금지어 목록도 비어 있음(B7) | 질문 저장 때 금지 패턴(실명·전화·주민·신분증 등)을 서버에서 검사한다. 금지어 목록은 운영 정책에 기본값을 넣는다 |
| 비밀번호 | 없음 | 오픈채팅 「참여코드」는 방장만 설정(2차). 일반 그룹채팅에는 없음 | 모임에는 없음(계약과 같음). 오픈채팅 비밀번호는 약함(C1) | 모임에는 비밀번호를 넣지 않는다(승인 가입 + 초대가 같은 역할). 오픈채팅 참여코드는 4자리 이상(숫자 6자리 권장)으로 하고, 느린 해시(scrypt, salt 포함)와 고정 시간 비교를 쓴다. 방·계정 단위로 연속 실패 5회면 잠근다 |
| 인원수 | 정원은 모임장이 정함. 일정은 「2/4명」 표시 | 오픈채팅 최대 1,500, 그룹·팀채팅 3,000(공식) | 원본 1개(`member_count`), 계산은 정상. 영어 「1 members」(D3) | 표시 문구 키는 「멤버 {count}」 / 「멤버 {count}/{cap}」 둘만 쓴다(메신저 머리글 포함). 영어는 단수·복수를 구분한다. 정원이 차면 버튼이 아니라 안내 줄로 보여 준다(F7) |
| 운영자 권한 | 모임장 > 부모임장·운영진 > 멤버. 멤버가 있으면 모임장은 위임 전에 못 나감 | 팀채팅: 방장 1 + 부방장 최대 10. 부방장은 방장·다른 부방장을 못 내보냄. 방장 변경은 24시간에 1회(공식) | 3단계 역할·상한(부모임장 2·운영진 5). 내보내기·차단을 운영진까지 열 수 있음(B6), 위임 때 상한 검사 없음(B12), 모임장에게 나가기 메뉴(D5) | 계약 §5.2 그대로 내보내기·차단은 부모임장 이상으로 고정하고(조정 불가), 운영진 메모는 기본 허용으로 바꾼다. 위임 수락 때 부모임장 상한을 검사한다. 모임장 메뉴에서는 「나가기」 대신 「모임 종료·위임 안내」를 보여 준다 |
| 방제 | 모임 이름 = 채팅방 이름 | 팀채팅은 방장·부방장이 이름 수정(공식) | 모임 이름 → 방 제목 자동, 메신저 쪽 수정 차단(정상) | 지금 구조 유지. 일정 방은 「일정」 배지와 일정 제목, [일정 보기] 버튼으로 구분한다(D2) |
| 방 공지 | 모임 홈의 공지 메뉴 하나 | 일반 그룹채팅은 누구나 공지 1개(100자, 새로 올리면 이전 공지 사라짐 — 공식). 팀채팅은 방장·부방장이 관리 | 공지 3군데(D1), 공지 쓰기 권한과 고정 권한이 따로 움직임(D4) | **공지는 모임 게시판 공지 하나**로 한다. 채팅방 상단에는 최신 고정 공지 1개를 배너로 보여 주고, 「공지 보기」로 글에 연결한다. 모임 방에서는 메신저 공지 편집을 화면과 DB 트리거(`notice_text`) 양쪽에서 막는다. 공지 쓰기와 고정은 같은 권한(`pin_notice`) 하나로 판정한다 |
| 방 정보 화면 | 모임 채팅방 설정 = 알림 위주 | 팀채팅은 관리 메뉴가 방장·부방장에게만 보임 | 메신저 운영 칸이 모임 방에도 보임(D6) | 모임 방 정보는 「알림 끄기 + 모임 홈 가기」만 둔다(시안 U8). 멤버 목록은 모임 멤버 화면으로 연결한다 |
| 탈퇴·삭제 | 모임장 장기 미접속 30일 뒤 신청·검토 | 팀채팅 방장이 제재되면 일반 채팅방으로 바뀜(공식) | 탈퇴 처리 없음, 영구 삭제가 FK 로 막힘(B8) | 계정 탈퇴·영구 삭제 전에 모임 정리 함수 1개를 부른다(설계 P8 순서로 자동 위임, 멤버 없으면 종료, 멤버 행은 `left`). 모임 FK 는 작성 기록(글·댓글·앨범)이면 `SET NULL` + 「탈퇴한 멤버」 표시, 소속 기록이면 정리 함수로 처리한다 |
| 알림 | 가입·공지·일정 알림, 모임별로 끄기 | — | 새 멤버·초대 신청 알림 누락(B2·B3). 공지 발송이 요청 안에서 동시 무제한(E1) | `moim_member_joined`(모임장, 묶음)와 초대 수락으로 생긴 신청의 `moim_join_requested` 를 보낸다. 여러 사람에게 보내는 알림은 응답 뒤 작업으로 돌리고, 언어 조회는 한 번에 묶어 읽으며, 동시 실행 수를 제한한다 |
| 화면 호출 | — | — | 하위 화면마다 상세 15~17회(E2·E3) | 상세는 모임 단위로 메모리 캐시에 두고 하위 화면이 같이 쓴다. 머리글·권한만 필요한 화면은 가벼운 「요약」 응답을 쓴다. 상세의 게시판 조회는 1회로 줄이고, 고정 글·최근 글·일정은 병렬로 부른다. 모든 모임 라우트를 요청 예산에 등록한다 |
| 버튼·메뉴 | 홈·공지·일정·앨범·멤버 순 메뉴 | ≡ 메뉴 안에 관리 메뉴 | 버튼 체계 두 벌(F1~F4), 아이콘 혼용(F8) | 버튼 역할은 `moimCls` 한 곳에서만 정의한다: 기본(초록, 화면당 1개, 하단 고정 줄) / 보조(흰 테두리 1종) / 위험(빨강: 숨기기·삭제·내보내기·차단·회수·종료·일정 취소). 상태 안내는 버튼이 아니라 안내 줄로. 화면 메뉴는 머리글 ⋮ 하나(일반 → 신고 → 위험 순). 이동 표시는 `ChevronRight`, 행 메뉴는 `MoreVertical`(터치 44px). 운영 허브는 5묶음: 멤버(신청·관리·초대) / 모임 설정(정보·게시판·권한) / 안전(신고) / 모임장(위임·변경 요청) / 위험(종료). 탭 순서는 §9 대로 |

권장안 근거 출처(공식):
- 카카오 팀채팅 부방장 최대 10명: https://www.kakaocorp.com/page/detail/11393
- 부방장 권한: https://cs.kakao.com/helps_html/1073209685
- 내보내기 권한 차이: https://cs.kakao.com/helps_html/1073203075
- 방장 변경 24시간: https://cs.kakao.com/helps_html/1073184429
- 공지 1개·100자: https://cs.kakao.com/helps_html/1073188898
- 이용자 보호조치(다수 개설 자동 제한): https://cs.kakao.com/helps_html/1073199443
- 오픈채팅 정원 1,500: https://www.kakaocorp.com/page/detail/9696
- 당근 운영정책 경고 누적 차단: https://www.daangn.com/wv/faqs/3730

---

## 4. 권장 수정 묶음 (한 묶음 = PR 1개, 도메인을 섞지 않음)

1. **주소**: A1·A2. 모임 동네 판정을 주소 단일 정의로 바꾸고, 만들기 2단계에 도시 표시 + 주소 확인 CTA 를 넣는다. 운영 DB 에서 LGU 가 빈 주소 25건을 채운다(운영 DB 적용).
2. **권한·가입·초대·탈퇴 (DB 함수)**: B1·B4·B5·B6·B7·B8·B9·B10·B12·B13·D4·E5. 마이그레이션이므로 운영 DB 적용이 필요하다.
3. **알림·호출**: B2·B3·E1·E2·E3·E4·E6·E8·E9.
4. **메신저 모임 방**: D1·D2·D6·D7. 메신저 화면과 트리거 변경이다(메신저 hard-lock 영역).
5. **오픈채팅 비밀번호**: C1.
6. **모임 화면·디자인**: A2 화면 부분을 제외한 B11·D3·D5·E7·F1~F12.

## 5. 1차 보고 정정 (재검증 결과)

| 1차 항목 | 정정 |
|---|---|
| 「주소 등록하기를 눌러도 고칠 방법이 없다」 | **틀림.** 주소 수정 저장이나 대표 재지정을 하면 LGU 가 채워진다(`user-address-service.ts:62,597-605`). 결함은 「그 방법을 화면이 안내하지 않고, 모임만 단일 정의를 쓰지 않는다」로 고친다 |
| A3 「동네 표시가 화면마다 다름」 | **삭제.** 멤버 홈 머리글에 동네를 표시하라는 계약이 없다(시안 U4 머리글은 이름만) |
| D3 「인원수 출처 3개라 숫자가 달라질 수 있음」 | **삭제.** 메신저 참여자는 같은 트랜잭션에서 맞춰지고, 운영 정원 상한이 300이라 운영 멤버 탭 `limit 1000` 을 넘지 않는다. 문구 차이만 D3·권장안에 남긴다 |
| D9 「영어 Group 명칭이 채팅 3종 경계 위반」 | **결함에서 제외.** 용어집(`docs/i18n-ssot.md`)에 모임 영어 표기 규정이 없다. 권장안으로만 둔다 |
| D10 「나간 방도 모임 방으로 표시」 | **삭제.** 나간 방은 목록에 나오지 않아 화면 영향이 없다 |
| F8 「위임·종료 확인창 위험 톤 아님, 종료 최종 확인 없음」 | **삭제.** 위임은 상대가 수락해야 하는 요청이고, 종료는 이름 입력으로 확인한다 |
| F10 「⋮ 항목이 0개여도 보임」 | **삭제.** 비회원은 `/moim/[id]` 에 들어올 수 없고(접근 정책), 로그인 사용자에게는 「신고」가 항상 있다 |
| 「Owner 결정 필요: 카테고리 칩 vs 밑줄 탭」 | **해소.** Owner 「3판대로 구현」(커밋 830a8b686) 지시에 따른 구현이다 |
