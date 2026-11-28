# G2 — 설계 v1 §5(5.1·5.2 권한표 전 칸) · P7 · P8 조항별 대조

- 코드 기준: `/Users/bkkim/projects/samarket-wt-moim-address` HEAD `04ee097fb` (읽기 전용). 운영 DB·앱·사이트 미조회 (앱 실행 0회).
- 판정 = **코드 PASS**(DB 최신 정의 + TS 계약 + UI 코드가 모두 맞음). 화면·실기기 결과는 전 행 NOT_PROVEN 이다(행마다 반복하지 않음).
- 계약 순서 `docs/moim-ssot.md`. 뒤 승인 문서: 2번 묶음 B6·B9·B12·D4·B8, 4번 묶음 §0(`moim__host_swap` 전체 방만 = 사실·유지), 설계 §10 M5 행·SSOT(어드민 키 `moim` 하나).
- 약어 (파일 = `supabase/migrations/`):
  - **B2** `20271128110000_moim_bundle2_permissions.sql` (권한표 최신 정의 B2:10-31 — 같은 함수 m2 정의보다 뒤 파일이 이김)
  - **M2** `20271112210000_moim_m2_schema_rpc.sql` · **M3** `20271112230000_moim_m3_board_rpc.sql` · **M4** `20271113100000_moim_m4_schedule_album_prefs.sql` · **M5** `20271113200000_moim_m5_admin_rpc.sql`
  - **C** `lib/moim/moim-permission-contract.ts` · **Q** `lib/moim/server/moim-queries.server.ts`
  - **판정 함수**: DB `moim_actor_can` M2:673-710 (최신 정의 = M2, 다른 파일 재정의 없음) ↔ TS `canMoimAction` C:89-98 (같은 규칙: 활성·blocked 는 close 만·warned 는 transfer_host 거부·조정 가능 행만 override). 화면 `detail.can.*` = `moimCanMap` Q:378-386 (같은 TS 함수 + DB `moim_permissions` 행).
  - **조정 하한/상한**: DB `moim_permissions_set` M2:1171-1191 — `adjustable` 행만, 값은 `host|co_host|staff|member` 중 **floor 이상이면 무엇이든**(상한 없음). TS `isAllowedMoimPermissionOverride` C:101-104 동일. UI `MoimManagePermissions.tsx:64` 선택지 = 같은 TS 함수.
- 이전 감사(`matrix/prior-reaudit.md`) 일치 ID 는 note 에 적고, 없으면 **NEW**.

## §5.1 플랫폼과 모임 안

| ID | 요구 (원문 ≤20단어) | 판정 | DB | TS | UI | note |
|---|---|---|---|---|---|---|
| S5.1-01 | 「플랫폼: 슈퍼관리자, 그리고 새 권한 키 `moim` 을 가진 운영자」 | PASS | — | `app/api/admin/moim/**` 전 라우트 `requireAdminPermission("moim")` | 어드민 메뉴(설계 M5) | 운영자 권한 행 반영은 open-items §1(운영 적용 기록) |
| S5.1-02 | 「하위 권한 moim.view / moim.edit / moim.sanction / moim.report」 | N/A | — | — | — | 대체: 설계 §10 M5 「권한은 단일 키 `moim`(하위 키 미분리)」, `docs/moim-ssot.md` 「권한 키 `moim` 하나」 |
| S5.1-03 | 「`moim.delete` 는 슈퍼관리자만」 | PASS | — | `moims/[moimId]/lifecycle/route.ts` `requireSuperAdmin()`, `content/route.ts` delete·undelete 에 `isSuperAdmin` 검사 | — | SSOT 「모임 삭제·복구·콘텐츠 삭제는 최고관리자」 |
| S5.1-04 | 「`boards` 권한에 얹지 않는다」 | PASS | — | grep: `app/api/admin/moim/**` 에 `boards` 키 판정 없음, 전부 `"moim"` | — | |
| S5.1-05 | 「모임장(1명), 부모임장, 운영진, 멤버」 | PASS | M2:107 role check 4종 · M2:125 `moim_members_one_host_uidx`(활성 모임장 1명) · B2:891-892 `moims_active_has_host` | C:10 `MOIM_ROLES` | — | |
| S5.1-06 | 「부모임장은 내보내기·차단까지 할 수 있고」 | PASS | B2:25-26 `remove_member`/`ban_member` co_host 고정 · M2:931-972 | C:59-60 | `MoimManageMembers.tsx` `c.remove_member`/`c.ban_member` | B6 |
| S5.1-07 | 「운영진은 승인·공지·게시판 관리까지만 할 수 있다(D4)」 | NOT_PROVEN | B2:22 `manage_boards` co_host 고정 (운영진 불가) | C:55 | `MoimManageBoards.tsx:192` allow `manage_boards` | **NEW · 설계 내부 충돌**: §5.1 「운영진 … 게시판 관리까지」 ↔ §5.2 「게시판 만들기·순서 O O X X」. 구현은 §5.2 표를 따름. 어느 쪽이 맞는지 Owner 결정 필요(AGENTS 허위보고 금지 7번) |
| S5.1-08 | (D4 귀결) 운영진은 내보내기·차단 불가 | PASS | B2:25-26 floor co_host, 조정 불가 | C:59-60 | 운영 › 권한 「고정」 칸 | B6 |
| S5.1-09 | 「부모임장과 운영진의 차이는 당근에서 확인하지 못했다」 | N/A | — | — | — | 사실 기록, 요구 아님 |

## §5.2 권한표 — 칸별 (행동 × 역할)

열 의미: 기대 = 설계 칸 값. 「고정」= 조정 표시 없음 → 모임장이 바꿀 수 없어야 함.
DB 칸은 해당 RPC 의 권한 검사 위치. UI 칸은 버튼·메뉴 노출 조건(모두 `detail.can.*` = TS 판정).
| ID | 요구 | 판정 | DB | TS | UI | note |
|---|---|---|---|---|---|---|
| S5.2-info-host | 「모임 정보 수정」 host = O | PASS | B2:17 (host,false) · `moim_update_info` B2:245 `actor_can edit_info` | C:50 | `MoimManageInfo.tsx:314` allow `edit_info`, 허브 `MoimManageHub.tsx` `c.edit_info` | 조정 불가(adjustable=false, `moim_permissions_set` 가 `moim_permission_not_adjustable`) — 일치 |
| S5.2-info-co_host | 「모임 정보 수정」 co_host = X | PASS | B2:17 (host,false) · `moim_update_info` B2:245 `actor_can edit_info` | C:50 | `MoimManageInfo.tsx:314` allow `edit_info`, 허브 `MoimManageHub.tsx` `c.edit_info` | 조정 불가(adjustable=false, `moim_permissions_set` 가 `moim_permission_not_adjustable`) — 일치 |
| S5.2-info-staff | 「모임 정보 수정」 staff = X | PASS | B2:17 (host,false) · `moim_update_info` B2:245 `actor_can edit_info` | C:50 | `MoimManageInfo.tsx:314` allow `edit_info`, 허브 `MoimManageHub.tsx` `c.edit_info` | 조정 불가(adjustable=false, `moim_permissions_set` 가 `moim_permission_not_adjustable`) — 일치 |
| S5.2-info-member | 「모임 정보 수정」 member = X | PASS | B2:17 (host,false) · `moim_update_info` B2:245 `actor_can edit_info` | C:50 | `MoimManageInfo.tsx:314` allow `edit_info`, 허브 `MoimManageHub.tsx` `c.edit_info` | 조정 불가(adjustable=false, `moim_permissions_set` 가 `moim_permission_not_adjustable`) — 일치 |
| S5.2-join-host | 「가입 승인·거절」 host = O | PASS | B2:18 (staff,true,staff) · `moim_join_decide` M2:897 | C:51 | `MoimManageRequests.tsx:153` allow `decide_join`, 허브 신청 줄 | 모임장 이상 값도 모임장 포함 → 모임장은 항상 O |
| S5.2-join-co_host | 「가입 승인·거절」 co_host = O | FAIL | B2:18 (staff,true,staff) · `moim_join_decide` M2:897 | C:51 | `MoimManageRequests.tsx:153` allow `decide_join`, 허브 신청 줄 | **NEW** 고정 O 칸인데 조정됨: `moim_permissions_set` M2:1182-1183 이 floor 이상 아무 값(`co_host`·`host`)을 받는다. 시나리오: 모임장이 운영 › 권한에서 「가입 승인·거절」를 「모임장 이상」으로 저장 → co_host 가 `moim_forbidden`, 버튼도 사라짐. 같은 원인: `isAllowedMoimPermissionOverride` C:101 · 선택지 `MoimManagePermissions.tsx:64` 에 「모임장 이상」 칩 |
| S5.2-join-staff | 「가입 승인·거절」 staff = O(조정) | PASS | B2:18 (staff,true,staff) · `moim_join_decide` M2:897 | C:51 | `MoimManageRequests.tsx:153` allow `decide_join`, 허브 신청 줄 | 기본 O(기본 최소 역할 staff), 조정 가능(상향) — 일치 |
| S5.2-join-member | 「가입 승인·거절」 member = X | PASS | B2:18 (staff,true,staff) · `moim_join_decide` M2:897 | C:51 | `MoimManageRequests.tsx:153` allow `decide_join`, 허브 신청 줄 | floor `staff` → 이 역할로 내릴 수 없음(`moim_permission_value_invalid`) — 일치 |
| S5.2-link-host | 「초대 링크 만들기·끄기」 host = O | PASS | B2:19 (staff,true,staff) · `moim_invite_link_create` M2:1232 · `_revoke` M2:1246 | C:52 | `MoimManageInvite.tsx:314` `can.manage_invite_link`, 머리글 ⤴ `use-moim-invite-share.ts:21` | 모임장 이상 값도 모임장 포함 → 모임장은 항상 O |
| S5.2-link-co_host | 「초대 링크 만들기·끄기」 co_host = O | FAIL | B2:19 (staff,true,staff) · `moim_invite_link_create` M2:1232 · `_revoke` M2:1246 | C:52 | `MoimManageInvite.tsx:314` `can.manage_invite_link`, 머리글 ⤴ `use-moim-invite-share.ts:21` | **NEW** 고정 O 칸인데 조정됨: `moim_permissions_set` M2:1182-1183 이 floor 이상 아무 값(`co_host`·`host`)을 받는다. 시나리오: 모임장이 운영 › 권한에서 「초대 링크 만들기·끄기」를 「모임장 이상」으로 저장 → co_host 가 `moim_forbidden`, 버튼도 사라짐. 같은 원인: `isAllowedMoimPermissionOverride` C:101 · 선택지 `MoimManagePermissions.tsx:64` 에 「모임장 이상」 칩 |
| S5.2-link-staff | 「초대 링크 만들기·끄기」 staff = O(조정) | PASS | B2:19 (staff,true,staff) · `moim_invite_link_create` M2:1232 · `_revoke` M2:1246 | C:52 | `MoimManageInvite.tsx:314` `can.manage_invite_link`, 머리글 ⤴ `use-moim-invite-share.ts:21` | 기본 O(기본 최소 역할 staff), 조정 가능(상향) — 일치 |
| S5.2-link-member | 「초대 링크 만들기·끄기」 member = X | PASS | B2:19 (staff,true,staff) · `moim_invite_link_create` M2:1232 · `_revoke` M2:1246 | C:52 | `MoimManageInvite.tsx:314` `can.manage_invite_link`, 머리글 ⤴ `use-moim-invite-share.ts:21` | floor `staff` → 이 역할로 내릴 수 없음(`moim_permission_value_invalid`) — 일치 |
| S5.2-invite-host | 「친구 초대 보내기」 host = O | PASS | B2:20 (member,true,member) · `moim_invite_send` M2:1275 | C:53 | `MoimManageInvite.tsx:315` `can.send_invite`, ⋮ 메뉴 `MoimDetailScreen.tsx:179` | 모임장 이상 값도 모임장 포함 → 모임장은 항상 O |
| S5.2-invite-co_host | 「친구 초대 보내기」 co_host = O | FAIL | B2:20 (member,true,member) · `moim_invite_send` M2:1275 | C:53 | `MoimManageInvite.tsx:315` `can.send_invite`, ⋮ 메뉴 `MoimDetailScreen.tsx:179` | **NEW** 고정 O 칸인데 조정됨: `moim_permissions_set` M2:1182-1183 이 floor 이상 아무 값(`co_host`·`host`)을 받는다. 시나리오: 모임장이 운영 › 권한에서 「친구 초대 보내기」를 「모임장 이상」으로 저장 → co_host 가 `moim_forbidden`, 버튼도 사라짐. 같은 원인: `isAllowedMoimPermissionOverride` C:101 · 선택지 `MoimManagePermissions.tsx:64` 에 「모임장 이상」 칩 |
| S5.2-invite-staff | 「친구 초대 보내기」 staff = O | FAIL | B2:20 (member,true,member) · `moim_invite_send` M2:1275 | C:53 | `MoimManageInvite.tsx:315` `can.send_invite`, ⋮ 메뉴 `MoimDetailScreen.tsx:179` | **NEW** 고정 O 칸인데 조정됨: `moim_permissions_set` M2:1182-1183 이 floor 이상 아무 값(`co_host`·`host`)을 받는다. 시나리오: 모임장이 운영 › 권한에서 「친구 초대 보내기」를 「모임장 이상」으로 저장 → staff 가 `moim_forbidden`, 버튼도 사라짐. 같은 원인: `isAllowedMoimPermissionOverride` C:101 · 선택지 `MoimManagePermissions.tsx:64` 에 「모임장 이상」 칩 |
| S5.2-invite-member | 「친구 초대 보내기」 member = O(조정) | PASS | B2:20 (member,true,member) · `moim_invite_send` M2:1275 | C:53 | `MoimManageInvite.tsx:315` `can.send_invite`, ⋮ 메뉴 `MoimDetailScreen.tsx:179` | 기본 O(기본 최소 역할 member), 조정 가능(상향) — 일치 |
| S5.2-notice-host | 「공지 작성·고정」 host = O | PASS | B2:21 (staff,true,staff) · 고정 `moim_post_pin` M3:117 · 공지 작성/수정 B2:684-685, B2:726-727 (D4) | C:54 | 쓰기 버튼 `MoimMemberView.tsx:44` (공지 게시판=`can.pin_notice`), 고정 메뉴 `MoimPostDetailScreen.tsx:163` | 모임장 이상 값도 모임장 포함 → 모임장은 항상 O |
| S5.2-notice-co_host | 「공지 작성·고정」 co_host = O | FAIL | B2:21 (staff,true,staff) · 고정 `moim_post_pin` M3:117 · 공지 작성/수정 B2:684-685, B2:726-727 (D4) | C:54 | 쓰기 버튼 `MoimMemberView.tsx:44` (공지 게시판=`can.pin_notice`), 고정 메뉴 `MoimPostDetailScreen.tsx:163` | **NEW** 고정 O 칸인데 조정됨: `moim_permissions_set` M2:1182-1183 이 floor 이상 아무 값(`co_host`·`host`)을 받는다. 시나리오: 모임장이 운영 › 권한에서 「공지 작성·고정」를 「모임장 이상」으로 저장 → co_host 가 `moim_forbidden`, 버튼도 사라짐. 같은 원인: `isAllowedMoimPermissionOverride` C:101 · 선택지 `MoimManagePermissions.tsx:64` 에 「모임장 이상」 칩 |
| S5.2-notice-staff | 「공지 작성·고정」 staff = O(조정) | PASS | B2:21 (staff,true,staff) · 고정 `moim_post_pin` M3:117 · 공지 작성/수정 B2:684-685, B2:726-727 (D4) | C:54 | 쓰기 버튼 `MoimMemberView.tsx:44` (공지 게시판=`can.pin_notice`), 고정 메뉴 `MoimPostDetailScreen.tsx:163` | 기본 O(기본 최소 역할 staff), 조정 가능(상향) — 일치 · D4: 공지 작성도 같은 권한 |
| S5.2-notice-member | 「공지 작성·고정」 member = X | PASS | B2:21 (staff,true,staff) · 고정 `moim_post_pin` M3:117 · 공지 작성/수정 B2:684-685, B2:726-727 (D4) | C:54 | 쓰기 버튼 `MoimMemberView.tsx:44` (공지 게시판=`can.pin_notice`), 고정 메뉴 `MoimPostDetailScreen.tsx:163` | floor `staff` → 이 역할로 내릴 수 없음(`moim_permission_value_invalid`) — 일치 |
| S5.2-boards-host | 「게시판 만들기·순서」 host = O | PASS | B2:22 (co_host,false) · `moim_board_upsert` M3:183 | C:55 | `MoimManageBoards.tsx:192`, 허브 `c.manage_boards` | 조정 불가(adjustable=false, `moim_permissions_set` 가 `moim_permission_not_adjustable`) — 일치 |
| S5.2-boards-co_host | 「게시판 만들기·순서」 co_host = O | PASS | B2:22 (co_host,false) · `moim_board_upsert` M3:183 | C:55 | `MoimManageBoards.tsx:192`, 허브 `c.manage_boards` | 조정 불가(adjustable=false, `moim_permissions_set` 가 `moim_permission_not_adjustable`) — 일치 |
| S5.2-boards-staff | 「게시판 만들기·순서」 staff = X | PASS | B2:22 (co_host,false) · `moim_board_upsert` M3:183 | C:55 | `MoimManageBoards.tsx:192`, 허브 `c.manage_boards` | 조정 불가(adjustable=false, `moim_permissions_set` 가 `moim_permission_not_adjustable`) — 일치 |
| S5.2-boards-member | 「게시판 만들기·순서」 member = X | PASS | B2:22 (co_host,false) · `moim_board_upsert` M3:183 | C:55 | `MoimManageBoards.tsx:192`, 허브 `c.manage_boards` | 조정 불가(adjustable=false, `moim_permissions_set` 가 `moim_permission_not_adjustable`) — 일치 |
| S5.2-hide-host | 「글 숨김(모임 안)」 host = O | PASS | B2:23 (staff,false) · `moim_post_remove` M3:100 · 댓글 B2:882 · 앨범 M4:451 | C:56 | `MoimPostDetailScreen.tsx:160,171` · `MoimAlbum.tsx:204` · 신고 화면 `MoimManageReports.tsx:167` | 조정 불가(adjustable=false, `moim_permissions_set` 가 `moim_permission_not_adjustable`) — 일치 |
| S5.2-hide-co_host | 「글 숨김(모임 안)」 co_host = O | PASS | B2:23 (staff,false) · `moim_post_remove` M3:100 · 댓글 B2:882 · 앨범 M4:451 | C:56 | `MoimPostDetailScreen.tsx:160,171` · `MoimAlbum.tsx:204` · 신고 화면 `MoimManageReports.tsx:167` | 조정 불가(adjustable=false, `moim_permissions_set` 가 `moim_permission_not_adjustable`) — 일치 |
| S5.2-hide-staff | 「글 숨김(모임 안)」 staff = O | PASS | B2:23 (staff,false) · `moim_post_remove` M3:100 · 댓글 B2:882 · 앨범 M4:451 | C:56 | `MoimPostDetailScreen.tsx:160,171` · `MoimAlbum.tsx:204` · 신고 화면 `MoimManageReports.tsx:167` | 조정 불가(adjustable=false, `moim_permissions_set` 가 `moim_permission_not_adjustable`) — 일치 |
| S5.2-hide-member | 「글 숨김(모임 안)」 member = X | PASS | B2:23 (staff,false) · `moim_post_remove` M3:100 · 댓글 B2:882 · 앨범 M4:451 | C:56 | `MoimPostDetailScreen.tsx:160,171` · `MoimAlbum.tsx:204` · 신고 화면 `MoimManageReports.tsx:167` | 조정 불가(adjustable=false, `moim_permissions_set` 가 `moim_permission_not_adjustable`) — 일치 |
| S5.2-sched-host | 「일정 만들기」 host = O | PASS | B2:24 (member,true,member) · `moim_schedule_create` M4:115 | C:57 | `MoimMemberView.tsx:235` `can.create_schedule`, `MoimScheduleFormScreen.tsx:196` | 모임장 이상 값도 모임장 포함 → 모임장은 항상 O |
| S5.2-sched-co_host | 「일정 만들기」 co_host = O | FAIL | B2:24 (member,true,member) · `moim_schedule_create` M4:115 | C:57 | `MoimMemberView.tsx:235` `can.create_schedule`, `MoimScheduleFormScreen.tsx:196` | **NEW** 고정 O 칸인데 조정됨: `moim_permissions_set` M2:1182-1183 이 floor 이상 아무 값(`co_host`·`host`)을 받는다. 시나리오: 모임장이 운영 › 권한에서 「일정 만들기」를 「모임장 이상」으로 저장 → co_host 가 `moim_forbidden`, 버튼도 사라짐. 같은 원인: `isAllowedMoimPermissionOverride` C:101 · 선택지 `MoimManagePermissions.tsx:64` 에 「모임장 이상」 칩 |
| S5.2-sched-staff | 「일정 만들기」 staff = O | FAIL | B2:24 (member,true,member) · `moim_schedule_create` M4:115 | C:57 | `MoimMemberView.tsx:235` `can.create_schedule`, `MoimScheduleFormScreen.tsx:196` | **NEW** 고정 O 칸인데 조정됨: `moim_permissions_set` M2:1182-1183 이 floor 이상 아무 값(`co_host`·`host`)을 받는다. 시나리오: 모임장이 운영 › 권한에서 「일정 만들기」를 「모임장 이상」으로 저장 → staff 가 `moim_forbidden`, 버튼도 사라짐. 같은 원인: `isAllowedMoimPermissionOverride` C:101 · 선택지 `MoimManagePermissions.tsx:64` 에 「모임장 이상」 칩 |
| S5.2-sched-member | 「일정 만들기」 member = O(조정) | PASS | B2:24 (member,true,member) · `moim_schedule_create` M4:115 | C:57 | `MoimMemberView.tsx:235` `can.create_schedule`, `MoimScheduleFormScreen.tsx:196` | 기본 O(기본 최소 역할 member), 조정 가능(상향) — 일치 |
| S5.2-remove-host | 「멤버 내보내기」 host = O | PASS | B2:25 (co_host,false) · `moim_member_remove` M2:940 | C:59 | `MoimManageMembers.tsx` `c.remove_member` | 조정 불가(adjustable=false, `moim_permissions_set` 가 `moim_permission_not_adjustable`) — 일치 · B6 반영 |
| S5.2-remove-co_host | 「멤버 내보내기」 co_host = O | PASS | B2:25 (co_host,false) · `moim_member_remove` M2:940 | C:59 | `MoimManageMembers.tsx` `c.remove_member` | 조정 불가(adjustable=false, `moim_permissions_set` 가 `moim_permission_not_adjustable`) — 일치 · B6 반영 |
| S5.2-remove-staff | 「멤버 내보내기」 staff = X | PASS | B2:25 (co_host,false) · `moim_member_remove` M2:940 | C:59 | `MoimManageMembers.tsx` `c.remove_member` | 조정 불가(adjustable=false, `moim_permissions_set` 가 `moim_permission_not_adjustable`) — 일치 · B6 반영 |
| S5.2-remove-member | 「멤버 내보내기」 member = X | PASS | B2:25 (co_host,false) · `moim_member_remove` M2:940 | C:59 | `MoimManageMembers.tsx` `c.remove_member` | 조정 불가(adjustable=false, `moim_permissions_set` 가 `moim_permission_not_adjustable`) — 일치 · B6 반영 |
| S5.2-ban-host | 「멤버 차단(재가입 금지)」 host = O | PASS | B2:26 (co_host,false) · `moim_member_remove(p_ban)` M2:940 · 해제 M2:978 | C:60 | `MoimManageMembers.tsx` `c.ban_member`·차단 탭 | 조정 불가(adjustable=false, `moim_permissions_set` 가 `moim_permission_not_adjustable`) — 일치 · B6 반영 |
| S5.2-ban-co_host | 「멤버 차단(재가입 금지)」 co_host = O | PASS | B2:26 (co_host,false) · `moim_member_remove(p_ban)` M2:940 · 해제 M2:978 | C:60 | `MoimManageMembers.tsx` `c.ban_member`·차단 탭 | 조정 불가(adjustable=false, `moim_permissions_set` 가 `moim_permission_not_adjustable`) — 일치 · B6 반영 |
| S5.2-ban-staff | 「멤버 차단(재가입 금지)」 staff = X | PASS | B2:26 (co_host,false) · `moim_member_remove(p_ban)` M2:940 · 해제 M2:978 | C:60 | `MoimManageMembers.tsx` `c.ban_member`·차단 탭 | 조정 불가(adjustable=false, `moim_permissions_set` 가 `moim_permission_not_adjustable`) — 일치 · B6 반영 |
| S5.2-ban-member | 「멤버 차단(재가입 금지)」 member = X | PASS | B2:26 (co_host,false) · `moim_member_remove(p_ban)` M2:940 · 해제 M2:978 | C:60 | `MoimManageMembers.tsx` `c.ban_member`·차단 탭 | 조정 불가(adjustable=false, `moim_permissions_set` 가 `moim_permission_not_adjustable`) — 일치 · B6 반영 |
| S5.2-note-host | 「운영진 메모」 host = O | PASS | B2:27 (staff,true,staff) · `moim_member_note_set` M3:215 · 읽기 Q:483 `write_note` | C:62 | `MoimManageMembers.tsx` `c.write_note` | 모임장 이상 값도 모임장 포함 → 모임장은 항상 O |
| S5.2-note-co_host | 「운영진 메모」 co_host = O(조정) | PASS | B2:27 (staff,true,staff) · `moim_member_note_set` M3:215 · 읽기 Q:483 `write_note` | C:62 | `MoimManageMembers.tsx` `c.write_note` | 기본 O(기본 최소 역할 staff), 조정 가능(상향) — 일치 · B6 반영(운영진 기본 허용) |
| S5.2-note-staff | 「운영진 메모」 staff = O(조정) | PASS | B2:27 (staff,true,staff) · `moim_member_note_set` M3:215 · 읽기 Q:483 `write_note` | C:62 | `MoimManageMembers.tsx` `c.write_note` | 기본 O(기본 최소 역할 staff), 조정 가능(상향) — 일치 · B6 반영(운영진 기본 허용) |
| S5.2-note-member | 「운영진 메모」 member = X | PASS | B2:27 (staff,true,staff) · `moim_member_note_set` M3:215 · 읽기 Q:483 `write_note` | C:62 | `MoimManageMembers.tsx` `c.write_note` | floor `staff` → 이 역할로 내릴 수 없음(`moim_permission_value_invalid`) — 일치 · B6 반영(운영진 기본 허용) |
| S5.2-role-host | 「역할 지정」 host = O | PASS | B2:28 (host,false) · `moim_member_role_set` B2:406 | C:63 | `MoimManageMembers.tsx` `c.set_role` | 조정 불가(adjustable=false, `moim_permissions_set` 가 `moim_permission_not_adjustable`) — 일치 |
| S5.2-role-co_host | 「역할 지정」 co_host = X | PASS | B2:28 (host,false) · `moim_member_role_set` B2:406 | C:63 | `MoimManageMembers.tsx` `c.set_role` | 조정 불가(adjustable=false, `moim_permissions_set` 가 `moim_permission_not_adjustable`) — 일치 |
| S5.2-role-staff | 「역할 지정」 staff = X | PASS | B2:28 (host,false) · `moim_member_role_set` B2:406 | C:63 | `MoimManageMembers.tsx` `c.set_role` | 조정 불가(adjustable=false, `moim_permissions_set` 가 `moim_permission_not_adjustable`) — 일치 |
| S5.2-role-member | 「역할 지정」 member = X | PASS | B2:28 (host,false) · `moim_member_role_set` B2:406 | C:63 | `MoimManageMembers.tsx` `c.set_role` | 조정 불가(adjustable=false, `moim_permissions_set` 가 `moim_permission_not_adjustable`) — 일치 |
| S5.2-transfer-host | 「모임장 위임」 host = O | PASS | B2:29 (host,false) · `moim_host_transfer_request` B2:525 | C:64 | `MoimManageHub.tsx:24` `canOpenMoimTransfer`, `MoimManageTransfer.tsx:98` | 조정 불가(adjustable=false, `moim_permissions_set` 가 `moim_permission_not_adjustable`) — 일치 · 경고(warned) 모임은 DB·TS 모두 거부 |
| S5.2-transfer-co_host | 「모임장 위임」 co_host = X | PASS | B2:29 (host,false) · `moim_host_transfer_request` B2:525 | C:64 | `MoimManageHub.tsx:24` `canOpenMoimTransfer`, `MoimManageTransfer.tsx:98` | 조정 불가(adjustable=false, `moim_permissions_set` 가 `moim_permission_not_adjustable`) — 일치 |
| S5.2-transfer-staff | 「모임장 위임」 staff = X | PASS | B2:29 (host,false) · `moim_host_transfer_request` B2:525 | C:64 | `MoimManageHub.tsx:24` `canOpenMoimTransfer`, `MoimManageTransfer.tsx:98` | 조정 불가(adjustable=false, `moim_permissions_set` 가 `moim_permission_not_adjustable`) — 일치 |
| S5.2-transfer-member | 「모임장 위임」 member = X | PASS | B2:29 (host,false) · `moim_host_transfer_request` B2:525 | C:64 | `MoimManageHub.tsx:24` `canOpenMoimTransfer`, `MoimManageTransfer.tsx:98` | 조정 불가(adjustable=false, `moim_permissions_set` 가 `moim_permission_not_adjustable`) — 일치 |
| S5.2-close-host | 「모임 종료」 host = O | PASS | B2:30 (host,false) · `moim_close` B2:641 | C:65 | `MoimManageClose.tsx:86`, ⋮ `MoimDetailScreen.tsx:196` | 조정 불가(adjustable=false, `moim_permissions_set` 가 `moim_permission_not_adjustable`) — 일치 |
| S5.2-close-co_host | 「모임 종료」 co_host = X | PASS | B2:30 (host,false) · `moim_close` B2:641 | C:65 | `MoimManageClose.tsx:86`, ⋮ `MoimDetailScreen.tsx:196` | 조정 불가(adjustable=false, `moim_permissions_set` 가 `moim_permission_not_adjustable`) — 일치 |
| S5.2-close-staff | 「모임 종료」 staff = X | PASS | B2:30 (host,false) · `moim_close` B2:641 | C:65 | `MoimManageClose.tsx:86`, ⋮ `MoimDetailScreen.tsx:196` | 조정 불가(adjustable=false, `moim_permissions_set` 가 `moim_permission_not_adjustable`) — 일치 |
| S5.2-close-member | 「모임 종료」 member = X | PASS | B2:30 (host,false) · `moim_close` B2:641 | C:65 | `MoimManageClose.tsx:86`, ⋮ `MoimDetailScreen.tsx:196` | 조정 불가(adjustable=false, `moim_permissions_set` 가 `moim_permission_not_adjustable`) — 일치 |
| S5.2-schedmgr-host | 「일정 참여자 승인·내보내기」 host = O (모임장) | PASS | `moim__schedule_can_manage` M4:37-46 (일정 호스트 or co_host 이상, 활성·비차단) · `moim_schedule_decide` M4:286 · `_remove_participant` M4:311 | Q 일정 `toSchedules` `lib/moim/server/moim-schedule-queries.server.ts:80,105` `canManage = isHost or rank≥co_host` | `MoimScheduleDetailScreen.tsx:225,587` `s.viewer.canManage` | rank 4 ≥ co_host · 고정(조정 칸 없음, 권한표에 행동 키 없음) |
| S5.2-schedmgr-co_host | 「일정 참여자 승인·내보내기」 co_host = O (←) | PASS | `moim__schedule_can_manage` M4:37-46 (일정 호스트 or co_host 이상, 활성·비차단) · `moim_schedule_decide` M4:286 · `_remove_participant` M4:311 | Q 일정 `toSchedules` `lib/moim/server/moim-schedule-queries.server.ts:80,105` `canManage = isHost or rank≥co_host` | `MoimScheduleDetailScreen.tsx:225,587` `s.viewer.canManage` | rank 3 ≥ co_host · 고정(조정 칸 없음, 권한표에 행동 키 없음) |
| S5.2-schedmgr-staff | 「일정 참여자 승인·내보내기」 staff = ← = 본인 일정일 때만 | PASS | `moim__schedule_can_manage` M4:37-46 (일정 호스트 or co_host 이상, 활성·비차단) · `moim_schedule_decide` M4:286 · `_remove_participant` M4:311 | Q 일정 `toSchedules` `lib/moim/server/moim-schedule-queries.server.ts:80,105` `canManage = isHost or rank≥co_host` | `MoimScheduleDetailScreen.tsx:225,587` `s.viewer.canManage` | 운영진은 rank 2 → 호스트일 때만 · 일치 · 고정(조정 칸 없음, 권한표에 행동 키 없음) |
| S5.2-schedmgr-member | 「일정 참여자 승인·내보내기」 member = 본인 일정이면 O | PASS | `moim__schedule_can_manage` M4:37-46 (일정 호스트 or co_host 이상, 활성·비차단) · `moim_schedule_decide` M4:286 · `_remove_participant` M4:311 | Q 일정 `toSchedules` `lib/moim/server/moim-schedule-queries.server.ts:80,105` `canManage = isHost or rank≥co_host` | `MoimScheduleDetailScreen.tsx:225,587` `s.viewer.canManage` | `host_user_id = p_actor` · 일치 · 고정(조정 칸 없음, 권한표에 행동 키 없음) |

### §5.2 표 아래 규칙

| ID | 요구 | 판정 | DB | TS | UI | note |
|---|---|---|---|---|---|---|
| S5.2-R1 | 「자기 자신은 내보내거나 차단할 수 없다」 | PASS | M2:938 `moim_cannot_target_self` | — | `MoimManageMembers.tsx` `actionsFor` 자기 자신 → 빈 메뉴 | 역할 지정도 M2/B2:407 자기 자신 거부 |
| S5.2-R2 | 「하위 역할은 상위 역할을 내보낼 수 없다」 | PASS | M2:947 대상 rank ≥ 행위자 rank 이면 거부 | `moimRoleRank` C:70 | `actionsFor` 같거나 높은 역할 → 「대화하기」만 | 같은 역할끼리도 막음(더 엄격, 메신저 hard-lock 원칙과 같음). 어드민은 모임장만 못 건드림 M5:293 |


## P7 역할 지정 · 권한 설정

| ID | 요구 | 판정 | DB | TS | UI | note |
|---|---|---|---|---|---|---|
| P7-01 | 「모임장 → 멤버 관리 → 대상 → [역할 변경]」 | PASS | `moim_member_role_set` B2:394-431 `set_role` | C:63 | `MoimManageMembers.tsx` `c.set_role` → 역할 시트 | |
| P7-02 | 「부모임장 / 운영진 / 멤버」 선택 | PASS | B2:405 `p_role in (co_host,staff,member)` | — | `ASSIGNABLE_ROLES` = co_host·staff·member | 모임장 대상 거부 B2:410 |
| P7-03 | 「대상에게 `moim_role_changed`」 | FAIL | — | `app/api/moim/[moimId]/members/[userId]/route.ts:23` `if (result.ok && role !== "member")` | — | prior **P2-15**. 시나리오: 모임장이 운영진 → 멤버로 내림 → 알림 없음. 어드민 경로(`admin/moim/moims/[moimId]/members/[userId]/route.ts:43`)는 멤버로 내려도 보냄 |
| P7-04 | 「모임장 → 설정 → [멤버 권한 관리]」 | PASS | `moim_permissions_set` M2:1178 `edit_info`(모임장) | C:50 | 허브 권한 줄 `c.edit_info`, `MoimManagePermissions.tsx:121` | |
| P7-05a | 「§5.2 의 「조정」 항목」만 조정 목록에 | PASS | `adjustable=false` 행 → `moim_permission_not_adjustable` M2:1181 | C `adjustable` | `MoimManagePermissions.tsx` 조정/고정 두 목록 | 조정 행동 6개: decide_join·manage_invite_link·send_invite·pin_notice·create_schedule·write_note = 표의 「조정」 칸이 있는 행과 같음 |
| P7-05b | 「「조정」 항목을 켜거나 끈다」 — 조정 칸만, 고정 칸은 그대로 | FAIL | M2:1182-1183 floor 이상이면 `host` 까지 허용(상한 없음) | C:101-104 동일 | 선택지 `MoimManagePermissions.tsx:64` 에 「부모임장 이상」「모임장 이상」 | **NEW**. 표의 고정 O 칸 7개(S5.2-join/link/notice-co_host, invite/sched-co_host·staff)가 꺼질 수 있다. 바른 상한: 가입·링크·공지 = {staff, co_host}, 친구 초대·일정 = {member, staff}, 메모 = {staff, co_host, host} |
| P7-06 | 「메신저 방 권한은 이 역할에 맞춰 서버가 같이 바꾼다」 — 사용자 경로·전체 방 | PASS | B2:422-427 `moim__rooms_of` 루프(전체 방 포함) → `moim__room_member_role` M2:573-586 · 매핑 `moim__cm_role` M2:502 host→owner·co_host→admin·그 외 member | `moimRoleToMessengerRole` C:107 (같은 매핑) | — | |
| P7-07a | 같은 요구 — 사용자 경로·일정 방 (B9) | PASS | B2:422-425 대상이 호스트인 일정 방 제외, 나머지 일정 방 적용 | — | — | B9 「호스트가 아닌 일정 방에만 적용」 그대로 |
| P7-07b | 같은 요구 — 일정 방 역할이 **경로와 무관하게** 모임 역할과 맞는가 | FAIL | 일정 참여 확정 `moim__schedule_confirm` M4:79 는 모임 역할과 무관하게 `'member'` 로 넣는다. 위임 `moim__host_swap` M5:22-38 은 전체 방만 바꾼다 | — | — | **NEW**. 시나리오 ① 부모임장 A 가 일정 S 에 참여 → S 방 역할 `member`. 부모임장 B 는 S 참여 뒤 역할 지정됨 → S 방 `admin`. 같은 부모임장이 순서에 따라 다르다. ② 모임장 H 가 위임 뒤 부모임장이 됨 → 참여 중인 일정 방은 `member` 그대로(역할 지정 경로라면 `admin`). 4번 묶음 §0 은 host_swap 「전체 방만」을 사실로 확인했을 뿐 일관성은 다루지 않음 |
| P7-08 | 같은 요구 — 어드민 경로·전체 방 | PASS | `moim_admin_member_role` M5:278 `main_room_id` 역할 변경 | — | `AdminMoimDetailPage.tsx:428,501` 역할 시트 | |
| P7-09 | 같은 요구 — 어드민 경로·일정 방 (B9 「어드민 `moim_admin_member_role`」) | FAIL | M5:260-281 일정 방 미반영 · B2 에 재정의 없음 | — | — | prior **W2 / P2-4**. 시나리오: 어드민이 일정 참여 중인 운영진을 부모임장으로 → 전체 방 `admin`, 일정 방 `member` 그대로(사용자 경로였다면 `admin`) |
| P7-10 | 위임 때 전체 방 방장 교체 (요청 수락·어드민 지정·변경 요청 승인·탈퇴 자동 위임) | PASS | `moim__host_swap` M5:22-38 (이전 → co_host/admin 먼저, 새 → host/owner) · 호출 B2:562·586·619·776 | — | — | |
| P7-11 | 일정 방의 방장 = 일정 호스트 유지 | PASS | M5:21 주석·M5:34 전체 방만 · B2:423-424 | — | — | 4번 묶음 §0 확인 |
| P7-12 | 「메신저 방 권한(공지 고정 등)」 이 역할 권한과 맞는가 — 운영진 | NOT_PROVEN | `moim__cm_role` staff → `member` M2:504 | C:107-111 | — | **NEW**. 운영진은 모임 `pin_notice` 기본 O 이지만 메신저 역할은 `member`. 모임 방 메신저 공지는 4번 묶음 D1 으로 막혔고(`20271128130000_moim_room_notice_guard.sql`), 메시지 고정의 역할 조건은 확인 못 함 |
| P7-13 | 「역할 인원 상한은 D6」 | PASS | 사용자 B2:412-419 `max_co_hosts`·`max_staff` · 어드민 M5:270-274 (NULL = 검사 안 함) | — | 오류 키 `moim_role_limit` | |


## P8 모임장 위임

| ID | 요구 | 판정 | DB | TS | UI | note |
|---|---|---|---|---|---|---|
| P8-01 | 「모임장 → 설정 → [모임장 위임]」 | PASS | `transfer_host` 모임장 고정 B2:29 · B2:525 | C:64 | 허브 `canOpenMoimTransfer` `MoimManageHub.tsx:23-25`, ⋮ `MoimDetailScreen.tsx:192-195` | |
| P8-02 | 「활성 멤버 선택」 | PASS | B2:527-529 활성 확인 · swap M5:26 재확인 | — | `MoimManageTransfer.tsx:66` 활성 멤버 목록(Q:488 `status=active`)에서 모임장 제외 | |
| P8-03 | 「상대에게 수락 요청」 | PASS | B2:532-533 `requested` 행 (하나만 열림 M2:320 uidx) | — | 알림 `moim_host_transfer_requested` `host-transfer/route.ts:21-28`, 배너 `MoimDetailScreen.tsx` `incomingHostTransferId`(Q:472) | |
| P8-03b | 요청은 받는 사람이 그 뒤에도 활성 멤버로 계속 있었을 때만 유효 | FAIL | `moim_host_transfer_respond` B2:540-565 상태·받는 사람·보낸 사람 모임장만 검사. 내보내기·나가기·`moim__deactivate_member` B2:36 이 요청을 취소하지 않음 | — | 재가입 뒤 배너 다시 보임 | prior **P1-1**. 시나리오: 위임 요청 → 모임장이 대상 내보냄 → 대상 즉시 재가입 → 수락 → 모임장 됨 |
| P8-04 | 「수락하면 즉시 교체되고」 | PASS | B2:561-562 | — | 배너 수락 `respondHostTransfer` | 수락은 가입 완료 필요(Owner 결정 1, route) |
| P8-05 | 「이전 모임장은 부모임장이 된다」 | PASS | M5:29-30 `role='co_host'` | — | `moim_manage_transfer_after` 안내 | B12 상한과 함께 아래 P8-B12-* |
| P8-06 | 「전체 멤버에게 `moim_host_changed`」 | PASS | — | `host-transfers/[transferId]/route.ts:26-38` (새 모임장 본인 제외) · 어드민 지정 `members/[userId]/route.ts` · 변경 요청 승인 `host-requests/[transferId]/route.ts` · 탈퇴 `moim-account-cleanup.server.ts:17-29` | — | 4경로 모두 |
| P8-07 | 「모임에 경고가 걸려 있으면 위임할 수 없다」 | PASS | 요청 `moim_actor_can` warned→transfer_host 거부 M2:688 · 수락 B2:560 warned·blocked 거부 | C:92 | `MoimManageTransfer.tsx:51-55,98` 경고 안내·버튼 비활성 | 어드민 지정은 막지 않음 = 설계 「제재 때 어드민이 직접 지정」과 맞음 |
| P8-08 | 「30일 이상 접속하지 않으면 … 부모임장·운영진이 [모임장 변경 요청]」 | PASS | `moim_host_inactive_request` M5:153-182 (역할 co_host·staff, `last_login_at` 30일) | — | `canRequestMoimHostChange` `MoimManageHub.tsx:28-30`, `MoimManageHostRequest.tsx:153` | `last_login_at` NULL 이면 미접속으로 보고 허용(M5:168-169) — 계약에 정의 없음 |
| P8-09 | 「어드민 큐에 등록」 | PASS | M5:175-177 `kind='inactive_request'` | — | `app/admin/community/moims/host-requests` · `AdminMoimHostRequestsPage.tsx` | |
| P8-10 | 「어드민이 확인하고 지정한다」 | PASS | `moim_admin_host_request_decide` B2:594-629 | — | 승인·거절 + 요청자 알림 `moim_host_request_result` | |
| P8-11 | 「최근 7일 안에 접속한 기록이 있으면 요청이 거부된다」 | PASS | B2:614-615 (어드민 처리 시점) | — | — | 요청 시점 검사는 30일(M5:169) |
| P8-12 | 「자동 위임은 하지 않는다(D8)」 | PASS | `moim_cron_tick`·`moim_policy_executors` 에 host 관련 처리 없음(grep) | — | — | 탈퇴 자동 위임은 별도 조항 P8-14 |
| P8-13 | 「어드민 위임: … `kind='admin'`, 사유 필수」 | PASS | `moim_admin_assign_host` B2:567-592 `moim__admin_reason`·`kind='admin'` | 라우트 `moimAdminReason` 필수 | `AdminMoimDetailPage.tsx:431` 모임장 지정 시트 | |
| P8-14 | 「부모임장 중 가장 먼저 지정된 사람 → 운영진 → 가장 오래된 멤버」 | PASS | `moim_account_cleanup` B2:768-773 (역할 순 → `role_changed_at` → `joined_at`) | — | — | 호출: `app/api/admin/users/[id]/delete/route.ts:127,137` (withdraw·purge 둘 다, 실패 시 중단) |
| P8-15 | 「멤버가 없으면 모임을 종료한다」 | PASS | B2:787-798 (활성 = 종료·일정 취소·방 읽기 전용, 삭제 모임 = closed_at 만) | — | — | |
| P8-16 | 「모임장이 DIBAY 를 탈퇴하면」 — 모든 탈퇴 경로가 정리를 부르는가 | NOT_PROVEN | — | 호출처는 어드민 삭제 라우트 하나. `app/api/me/leave-request` 는 요청만 접수 | — | 다른 계정 상태 변경 경로(어드민 상태 바꾸기 등)가 `withdrawn` 을 만들면서 정리를 건너뛰는지 확인 못 함 |
| P8-17 | 탈퇴 위임도 전체 멤버 알림 | PASS | B2:779 handovers 반환 | `moim-account-cleanup.server.ts:17-29` | — | |
| P8-B12-01 | 부모임장 상한이면 위임 요청 단계에서 거부 (B12) | PASS | `moim__assert_host_swap_cap` B2:494-516 · 요청 B2:530 | — | 오류 문구 `moim_err_moim_transfer_co_host_full` ko·en `moim-core.ts:117,321` | 2번 묶음 B12 |
| P8-B12-02 | 받는 사람이 부모임장이면 허용 | PASS | B2:510-513 (−1 +1) | — | — | |
| P8-B12-03 | 수락 시점에도 같은 검사 | PASS | B2:561 | — | — | |
| P8-B12-04 | 어드민 지정·변경 요청 승인도 같은 거부 | PASS | B2:584, B2:618 | — | — | 탈퇴 자동 위임은 검사 안 함(B2:776) — 이전 모임장이 바로 나가므로 상한 초과가 남지 않음 |


## 집계

| 구간 | 행 | PASS | FAIL | NOT_PROVEN | N/A |
|---|---|---|---|---|---|
| §5.1 | 9 | 6 | 0 | 1 | 2 |
| §5.2 칸 (14행동×4역할 + 일정관리 4) | 60 | 53 | 7 | 0 | 0 |
| §5.2 규칙 | 2 | 2 | 0 | 0 | 0 |
| P7 | 15 | 10 | 4 | 1 | 0 |
| P8 | 22 | 20 | 1 | 1 | 0 |
| **합계** | 108 | 91 | 12 | 3 | 2 |

FAIL 칸 ID: S5.2-join-co_host, S5.2-link-co_host, S5.2-invite-co_host, S5.2-invite-staff, S5.2-notice-co_host, S5.2-sched-co_host, S5.2-sched-staff, P7-03, P7-05b, P7-07b, P7-09, P8-03b.
- §5.2 의 FAIL 7칸 + P7-05b 는 **원인 하나**(조정 상한 없음: DB `moim_permissions_set` M2:1182-1183 · TS C:101 · UI `MoimManagePermissions.tsx:64`)다.
