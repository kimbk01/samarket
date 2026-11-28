# 모임 2번 묶음 설계안 — 권한·가입·초대·탈퇴 (2026-11-27)

- 근거:
  - 감사 `docs/audit/moim-full-audit-2026-11-27.md` §2 B1·B4·B5·B6·B7·B8·B9·B10·B12·B13·D4·E5 (운영 DB 정의·main 코드로 확인한 결함)
  - 계약 `docs/moim-ssot.md` → 설계 v1 → 시안 → 미결 감사
- 상태: **설계안. 구현·DB 변경 없음.** 승인받은 뒤 구현한다.
- 반영 단위: **PR 1개 · 병합 1회 · 운영 빌드 1회**. 마이그레이션 1개.
  - 순서: 운영 DB 적용(Owner 승인) → Owner 「병합」 → 병합.
  - 자동 병합은 등록하지 않는다.
- [배포 구분] 웹만 (네이티브 변경 없음).

---

## 1. 항목별 설계

표기:
- 「SQL」= 새 마이그레이션 `2027112811xxxx_moim_bundle2_*.sql` 한 파일 안의 변경
- 「현재 정의」= 운영 `pg_get_functiondef` 원문(적용 직전 md5 로 다시 확인)

### B1 · 탈퇴·내보내기 뒤 일정 정원이 줄지 않음
- **바꿀 것** — SQL `moim__deactivate_member`:
  - 일정 참여를 `cancelled` 로 바꿀 때 바뀐 일정 id 를 모은다(`returning sp.schedule_id`).
  - 모은 일정마다 `moim__schedule_refresh(schedule_id)` 를 부른다.
- **영향**: 이 함수를 부르는 곳 전부가 같이 고쳐진다 — 탈퇴, 내보내기, 차단, 어드민 멤버 제거.
- **깨질 수 있는 것**: 없음. `schedule_refresh` 는 확정 인원을 다시 세고 `full ↔ recruiting` 만 바꾼다(운영 정의 확인).
- **시험**: 정원 2 일정에 2명 확정(`full`) → 1명 탈퇴.
  - 수정 전: `confirmed_count=2`, `full`, 다른 멤버 참여 시 `moim_full`
  - 수정 후: `1`, `recruiting`, 참여 성공

### B4 · 나를 차단한 사람에게도 초대가 감
- **바꿀 것** — TS `app/api/moim/[moimId]/invites/route.ts`:
  - RPC 를 부르기 전에 메신저 차단 단일 정의 `getBlockedRelation(inviter, invitee).blockedByPeer` 를 확인한다(`lib/community-messenger/social-relations.ts`).
  - 차단이면 새 코드 `moim_invite_not_allowed` 를 돌려준다(400). 문구: 「이 사람에게는 초대를 보낼 수 없어요」 / "You can't send an invite to this person". 차단 사실은 드러내지 않는다.
- **범위**: 계약 P4 「나를 차단한 사람」 그대로(방향 1개). 친구 여부 검사는 계약에 서버 규칙이 없어 넣지 않는다.
- **오류 코드**:
  - 이 코드는 SQL 에 없는 TS 전용 코드다. 현재 시험은 SQL 에 있는 코드와 `MOIM_ERROR_CODES` 가 정확히 같아야 한다.
  - 그래서 `MOIM_ROUTE_ERROR_CODES`(라우트 전용) 목록을 따로 두고, 문구 키는 둘 다 등록한다. 시험도 그에 맞춰 고친다.
- **시험**: 차단 관계를 흉내 낸 라우트 단위 시험 — 차단이면 RPC·알림 0회, 400.

### B5 · 제재 조회가 실패하면 그냥 허용
- **바꿀 것**:
  - `lib/community/community-write-restriction.ts` `assertCommunityWriteAllowed` 에 선택 인자 `{ failClosed?: boolean }` 를 더한다.
  - `failClosed` 이면 조회 실패와 서비스 클라이언트 없음을 503(`community_restriction_unavailable`)으로 돌려준다.
  - 모임 관문 `guardMoimWrite` 만 `failClosed: true` 로 부른다.
- **영향**: 커뮤니티·피드의 다른 호출처는 인자가 없어 **동작 그대로**다(계약 P1 은 모임에만 적용).
- **시험**: 조회 오류를 흉내 내면 모임 관문은 503, 다른 호출은 기존처럼 null.

### B6 · 권한표 위반 (내보내기·차단을 운영진에게 열 수 있음, 운영진 메모 기본 불가)
- **바꿀 것** — SQL `moim_permission_defaults`, TS `lib/moim/moim-permission-contract.ts` 를 같은 값으로:
  - `remove_member`: `('co_host', false, 'co_host')` — 조정 불가
  - `ban_member`: `('co_host', false, 'co_host')` — 조정 불가
  - `write_note`: `('staff', true, 'staff')` — 운영진 기본 허용, 모임장이 올릴 수 있음
- **근거**: 설계 §5.2 「멤버 내보내기·차단 O O X X(조정 없음)」, 「운영진 메모 O / O(조정) / O(조정)」, 시안 U7 「내보내기·차단은 모임장·부모임장만」.
- **운영 데이터**: `moim_permissions` 0행(2026-11-27 조회). 이미 바뀐 값이 없으므로 옮길 데이터가 없다.
- **영향 화면**:
  - 운영 › 권한(`MoimManagePermissions`)은 조정 목록을 계약 TS 에서 만든다. 내보내기·차단 줄이 「고정」 칸으로 옮겨진다.
  - 멤버 관리의 내보내기·차단·메모 버튼은 `moim.can.*` 를 따른다.
- **시험**:
  - `moim-permission-contract.test.ts` 는 지금 m2 파일에서 권한표를 읽는다. **가장 최근에 `moim_permission_defaults` 를 정의한 마이그레이션**에서 읽도록 고친다.
  - 로컬 DB: 운영진이 내보내기를 시도하면 `moim_forbidden`, 운영진 메모는 성공.

### B7 · 가입 질문 금지어 검사 없음 + 금지어 목록 비어 있음
- **바꿀 것** — SQL `moim_create`·`moim_update_info`·`moim_admin_update_info`:
  - 질문을 저장하기 전에 이름·소개와 같은 금지어 검사를 질문 문장마다 한다(`moim_banned_word`).
  - 위 세 함수는 2번 묶음 안에서 1번 묶음 반영본(`20271128100000`)을 기준으로 다시 정의한다.
- **운영 정책값(데이터 변경, 이 설계 승인 = 값 승인)** — `moim_policies.banned_words` 에 아래 기본 목록을 넣는다:
  - 한국어: `전화번호`, `휴대폰 번호`, `핸드폰 번호`, `연락처`, `카톡 아이디`, `실명`, `본명`, `주민번호`, `주민등록`, `신분증`, `여권`
  - 영어: `phone number`, `mobile number`, `contact number`, `real name`, `full name`, `id card`, `passport`, `kakao id`
  - 근거: 설계 §4 「실명·전화번호·신분증 요구 금지」, 당근 FAQ 3730.
  - 어드민 「운영 정책」 화면에서 이후 수정할 수 있다(설계 §8).
- **영향**: 이름·소개도 같은 목록으로 검사하므로 위 단어가 들어간 모임 이름·소개도 거부된다(계약 P1 「금지어 → 거부」). 운영 활성 모임 1개(「한록」)는 해당하지 않는다.
- **시험**: 질문 「전화번호 알려 주세요」 → `moim_banned_word`. 평범한 질문 → 성공.

### B8 · 회원 탈퇴·영구 삭제 시 모임 처리 없음 (영구 삭제가 FK 로 실패)
- **새 SQL 함수 `moim_account_cleanup(p_user uuid)`** (service_role 전용, 계약 P8 순서):
  1. 사용자가 모임장인 활성 모임마다:
     - 다음 모임장 = 가장 먼저 지정된 부모임장 → 없으면 가장 먼저 지정된 운영진 → 없으면 가장 오래된 멤버(`joined_at`).
     - 다음 모임장이 있으면 `moim__host_swap` 으로 교체하고, `moim_host_transfers(kind='account_withdrawal', status='accepted')` 와 `moim_events` 에 기록한다.
     - 남은 멤버가 없으면 `moim_close` 와 같은 정리를 한다(종료·일정 취소·방 읽기 전용).
  2. 모든 모임의 활성·대기 멤버 행 → `moim__deactivate_member` + 상태 `left`.
  3. 대기 가입 신청 → `cancelled`.
  4. 받은 초대 대기분 → `declined`, 보낸 초대 대기분 → `cancelled`(보낸 사람이 없어짐 — 2026-11-28 결정 D-19, R1 에서 정정).
- **호출 위치** — TS `app/api/admin/users/[id]/delete/route.ts`:
  - **withdraw(탈퇴)·purge(영구 삭제) 두 모드 모두**, 프로필을 바꾸거나 Auth 를 삭제하기 **전에** 부른다.
  - 실패하면 삭제를 멈추고 500 을 돌려준다(반쯤 처리된 상태를 남기지 않는다).
- **FK (영구 삭제가 막히지 않게)** — 지금은 모임 표 14개 FK 가 `profiles` 를 NO ACTION 으로 참조한다:
  - 소속·개인 설정 행 — 삭제와 함께 지움(`ON DELETE CASCADE`): `moim_members`, `moim_join_requests`, `moim_bans`, `moim_invite_targets`(초대한 사람·받은 사람), `moim_notification_prefs`, `moim_schedule_participants`, `moim_member_profile_history`
  - 작성 기록 — 기록은 남기고 사람 연결만 끊음(`ON DELETE SET NULL`, 열을 null 허용으로 바꿈): `moim_posts.author_id`, `moim_comments.author_id`, `moim_album_items.uploader_id`, `moim_reports.reporter_id`, `moim_invites.created_by`, `moims.created_by`, `moims.host_user_id`(종료된 모임만 해당 — 활성 모임은 1단계에서 이미 위임됨), `moim_schedules.host_user_id`
  - 계약 P5 「쓴 글·댓글은 남는다. 작성자 표시는 「나간 멤버」」와 같다.
- **화면 영향** — `authorMap`·`toPosts` 등:
  - 작성자 id 가 null 이면 「나간 멤버」로 표시한다(`isActiveMember:false`, 기존 문구 `moim_screen_left_member`).
  - 일정 호스트가 null 이면 일정 관리권은 모임장·부모임장만 갖는다(`moim__schedule_can_manage` 확인 후 같은 규칙으로 고친다).
- **영구 삭제 사전 점검**: `admin_can_purge_auth_user` 에는 모임 항목을 넣지 않는다. 위 정리 + FK 로 막힐 이유가 없어지기 때문이다.
- **운영 데이터 영향**: 지금 모임 기록이 있는 회원은 5명(모임장)이다. 이들은 정리 함수를 부르기 전까지 바뀌는 것이 없다.
- **시험(로컬 DB)**: 다음 상태를 만들어 정리 함수를 실행한 뒤 `delete from profiles` 를 해 본다.
  - 모임장 + 부모임장 2명 + 멤버
  - 혼자인 모임장
  - 글·댓글·일정 호스트
  - 확인할 것: 위임 순서, 종료, 글 유지(작성자 null), 삭제 성공(수정 전에는 FK 오류 재현)

### B9 · 역할 변경이 일정 방장 권한을 덮어씀
- **바꿀 것** — SQL `moim_member_role_set` 과 어드민 `moim_admin_member_role`:
  - 메신저 역할 변경을 **전체 방(main_room)** 과, 대상이 **호스트가 아닌 일정 방**에만 적용한다.
  - 대상이 호스트인 일정 방은 `owner` 를 유지한다.
- **시험**: 일정 호스트를 운영진·멤버로 바꾼 뒤에도 그 일정 방 참여자 역할이 `owner` 이고, `owner_user_id` 와 같다.

### B10 · 질문을 수정하면 대기 신청 답변이 다른 질문에 붙음
- **바꿀 것**:
  - SQL `moim_join`: 답변을 저장할 때 `[{question, answer}]` 로 그 시점의 질문 문장을 함께 저장한다.
  - TS `listMoimJoinRequests`(`moim-queries.server.ts:463`):
    - 답변이 객체 배열이면 그대로 쓴다.
    - 예전 문자열 배열이면 지금처럼 순서로 맞춘다(운영 신청 0건이지만 호환을 둔다).
- **시험**: 신청 → 질문 1 삭제 → 승인권자 화면 데이터에서 답변이 원래 질문 문장과 짝을 이룬다.

### B12 · 위임 뒤 부모임장 상한 초과
- **설계 안 충돌**: P8 「이전 모임장은 부모임장이 된다」 ↔ D6 `max_co_hosts`(운영값 2).
- **권장안(두 규칙을 모두 지킴)**:
  - 부모임장이 이미 상한이면, 이전 모임장이 부모임장이 될 자리가 없으므로 **위임 요청 단계에서 거부**한다.
  - 새 코드 `moim_transfer_co_host_full`, 문구: 「부모임장이 가득 차서 위임할 수 없어요. 부모임장 한 명의 역할을 바꾼 뒤 다시 시도해 주세요」.
  - 받는 사람이 부모임장이면 자리가 하나 비므로 허용한다.
  - 수락 시점에도 같은 검사를 한다(요청 뒤 역할이 바뀐 경우).
- **바꿀 것**: SQL `moim_host_transfer_request`·`moim_host_transfer_respond`·`moim_admin_assign_host`·`moim_admin_host_request_decide` 가 공통 검사 함수 `moim__assert_host_swap_cap` 을 부른다.
  - 어드민 지정은 사유를 적고 상한을 넘을 수 있게 하지 않는다 — 같은 거부.
- **시험**: 부모임장 2명인 모임에서 멤버에게 위임 → 거부. 부모임장에게 위임 → 성공, 부모임장 2명 유지.

### B13 · 모임 종료 때 대기 멤버 행 방치 + 일정 참여자 알림 없음
- **바꿀 것**:
  - SQL `moim_close`: 대기 멤버 행 `pending → cancelled`. 신청 만료 함수(`moim_join_requests_expire_due`)와 같은 값이다.
  - TS `close/route.ts`:
    - 종료 직전에 다가오는 일정의 확정 참여자를 읽는다.
    - 종료가 성공하면 `moim_schedule_cancelled` 를 보낸다(§7 끌 수 없음).
    - `moim_closed` 를 이미 받는 사람에게도 일정 알림이 가는 것은 계약 §7 그대로다.
- **시험**: 대기 멤버 1·확정 참여자 1인 모임 종료 → 멤버 행 `cancelled`, 일정 취소 알림 대상 1명.

### D4 · 공지 쓰기와 공지 고정이 다른 권한으로 움직임
- **바꿀 것**:
  - SQL `moim_post_create`·`moim_post_update`: 공지 게시판(`kind='notice'`)이면 `write_min_role` 대신 `moim_actor_can(..., 'pin_notice')` 로 판정한다.
  - TS `MoimMemberView.tsx:42` 쓰기 버튼 조건: 공지 게시판이면 `moim.can.pin_notice`.
- **근거**: 설계 §5.2 「공지 작성·고정」 한 줄, 운영진 「O (조정)」.
- **시험**: 모임장이 `pin_notice` 를 부모임장 이상으로 올리면 → 운영진 공지 작성 `moim_forbidden`, 자유 게시판 작성은 성공.

### E5 · 같은 모임이 두 번 만들어질 수 있음
- **바꿀 것**:
  - SQL: 유니크 부분 인덱스 `moims (created_by, lgu_id, lower(name)) where status='active'`.
  - `moim_create` 시작 부분에 개설자 단위 잠금 `pg_advisory_xact_lock(hashtextextended(p_actor::text, 0))` — 1인 개설 수 상한 검사도 같이 보호한다.
  - 유니크 위반은 `moim_duplicate` 로 바꿔 돌려준다.
- **운영 데이터**: 활성 모임 1개, 중복 0이라 인덱스 생성이 실패할 일이 없다(적용 직전에 다시 조회).
- **시험**: 같은 입력으로 두 세션이 동시에 개설 → 1개만 생성, 다른 하나는 `moim_duplicate`.

---

## 2. 함께 바뀌는 문구 (ko·en 동시, 키로만)

- `moim_err_moim_invite_not_allowed`
- `moim_err_moim_transfer_co_host_full`
- `community_restriction_unavailable` (이미 있으면 재사용)

## 3. 반영 순서와 화면 공백

1. 마이그레이션을 운영 DB 에 적용한다(Owner 승인).
   - 적용 전: 바꿀 함수 전부의 운영 md5 를 적고, 현재 정의를 백업 파일로 저장한다(`docs/audit/moim-bundle2-backup-definitions-2026-11-27.sql`).
   - 적용 뒤의 지금 운영 코드:
     - 권한 기본값·금지어·위임 상한·일정 정원·공지 권한은 DB 에서 바로 적용된다. 화면은 지금 코드 그대로 동작하고, 거부되면 기존 오류 문구 경로로 나간다.
     - 새 오류 코드 `moim_transfer_co_host_full` 은 지금 코드에 문구 키가 없다. 그래서 병합 전에는 「알 수 없는 오류」 문구가 나올 수 있다. 위임은 드물어 영향이 작지만, **DB 적용 직후 바로 병합**해 그 구간을 줄인다.
     - B8 정리 함수는 새 코드에서만 부르므로 병합 전에는 동작하지 않는다(지금과 같음).
2. Owner 「병합」 → 병합 1회 → 운영 sha 확인.

## 4. 롤백

- DB: 백업 파일의 이전 정의로 `create or replace` 하고, FK 를 이전(NO ACTION, not null)으로 되돌린다.
  - 단, 되돌리기 전에 null 이 된 작성자 행이 있으면 not null 복원이 실패한다. 그런 행이 생겼다면 FK 만 되돌리고 not null 은 두는 쪽으로 롤백 절차를 남긴다.
- 코드: 운영 장애면 Instant Rollback(개발 프로세스 2번).

## 5. 검증 계획 (구현 뒤, 보고 전)

- 로컬 임시 Postgres 17 에 운영과 같은 정의를 올린다(md5 대조). 각 항목의 **수정 전 실패 재현 → 수정 후 통과**를 시나리오로 남긴다.
- vitest 전체, typecheck:build·test, eslint, check:i18n-quality 를 각 1회.
- 독립 재감사를 통과한 뒤 보고한다. 자동 병합은 등록하지 않는다.
- 운영 DB 적용 후 함수 md5·권한·인덱스를 대조한다.
