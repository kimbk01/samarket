# 모임 R5 — 계약 고정표 (작업자 S · 2026-11-28)

INTEGRATED §D-1 의 고정 내용을 실제 코드 이름으로 적었다. M·U·A 는 이 이름만 쓴다. 이 밖의 값은 만들지 않는다.

## 1. DB (마이그레이션 `supabase/migrations/20271128260000_moim_r5_full_fix.sql`)

### 1-1. 새 RPC (service_role 만)

| RPC | 인자 | 반환 | 오류 |
|---|---|---|---|
| `moim_host_transfer_cancel` | `p_actor uuid, p_transfer uuid` | `{ok, transfer_id, moim_id, to_user_id}` | `moim_transfer_not_found`(없음·이미 처리·남의 요청·미접속 요청) |
| `moim_board_reorder` | `p_actor uuid, p_moim uuid, p_board_ids uuid[]` | `{ok}` | `moim_forbidden` · `moim_board_order_invalid`(켜진 게시판 집합과 다름·중복·누락·다른 모임 id) |
| `moim_admin_log_room_action` | `p_admin, p_room, p_type, p_target, p_reason` · `p_type` = `admin_messenger_message_hidden` \| `admin_messenger_message_unhidden` | `{ok:true, moim_id}` 또는 모임 방이 아니면 `{ok:false, error:"moim_room_not_moim"}` | 제재 행은 건드리지 않음 |
| `moim_admin_report_review` (서명 교체) | `p_admin, p_report, p_reason text default null` | `{ok}` | 사유 없음 `moim_admin_reason_required` |

내부 도우미(라우트에서 부르지 않음): `moim__assert_image_url(text)` · `moim__assert_birth_years(int,int)` · `moim__admin_assert_state(uuid,text)` · `moim__room_moim_id(uuid)`.

### 1-2. 반환 키 추가 (옛 키는 그대로)

| RPC | 더한 키 |
|---|---|
| `moim_admin_report_decide` | `moim_status` · `retention_ended_at` · `reporter_member_ids`(신고자 중 활동 멤버) · `actions[].created`(모임 제재: false = 같은 단계가 진행 중이라 그 행을 씀) · `actions[].changed:false` 면 `sanction_id` 는 기존 숨김 행 또는 **null** · 이용 제한 `duplicate:true` 면 새 행 없음(`sanction_id` = 활성 행 또는 null) · `moim_notify_user_ids` = 모임이 활동 중이 아니면 `[]` |
| `moim_admin_sanction_apply` | `moim_status` · `retention_ended_at` · `notify_user_ids` = 활동 중이 아니면 `[]` · 연결 신고 상태는 **바뀌지 않음** |
| `moim_admin_sanction_revoke` | `moim_status` · `retention_ended_at` · `notify_user_ids` 동일 규칙 |
| `moim_admin_member_remove` | `was_pending` · `moim_status` · `retention_ended_at` |
| `moim_admin_member_unban` | `moim_status` · `retention_ended_at` |
| `moim_admin_update_info` | `moim_status` · `retention_ended_at` |
| `moim_member_remove` | `was_pending` · `moim_status` · `retention_ended_at` |
| `moim_member_role_set` | `changed`(false = 같은 역할, 기록·알림 없음) |
| `moim_account_cleanup` | `handovers[].moim_status` · `handovers[].to_nickname` |
| `moim_host_transfer_request` | 바뀐 동작: 열린 요청(종류 무관)이 있으면 `moim_transfer_pending`(취소하지 않음) |

옛 DB(키 없음) 호환 규칙: `created`·`changed` 키가 없으면 「새로 만듦/바뀜」, `moim_status` 가 없으면 원래 이동 위치.

### 1-3. 읽기 뷰 `public.moim_admin_sanction_rows_v` (service_role select 만, security_invoker)

`moim_sanctions` 모든 열 + `report_target_type` · `community_sanction_id` · `cs_end_at` · `cs_revoked_at` · `content_now` · `live_state`(`active` \| `expired` \| `revoked` \| `lifted` \| `unlinked`). 어드민 제재 목록(`listAdminMoimSanctions`·`loadAdminMoimSection` sanctions)은 표 대신 이 뷰를 읽는다(A). 「해제」 버튼은 `target_kind='moim'` 이고 `live_state='active'` 이고 모임이 삭제가 아닐 때만.

### 1-4. 구조

`moim_bans.source`(`moim` \| `admin`) — `listMoimBans` 가 읽는다. 신고 중복 인덱스는 `(reporter_id, moim_id, target_type, target_id)`.

## 2. 오류 코드 (`lib/moim/moim-error-codes.ts`)

- SQL 새 코드 14 (`MOIM_ERROR_CODES`): `moim_ban_admin_only` · `moim_content_author_deleted` · `moim_image_url_invalid` · `moim_age_range_invalid` · `moim_region_invalid` · `moim_schedule_request_not_found` · `moim_policy_report_reason_none_active` · `moim_closed` · `moim_deleted` · `moim_sanction_not_revocable` · `moim_sanction_already_active` · `moim_report_link_invalid` · `moim_board_order_invalid` · `moim_room_not_moim`
- 라우트 코드 (`MOIM_ROUTE_ERROR_CODES`에 추가): `moim_invalid_input` · `moim_join_answer_too_long` · `moim_rooms_unavailable` · `moim_room_managed_by_moim`. (`moim_duplicate` 는 이미 SQL 코드라 그대로)
- 새 함수 `moimErrorFromRpcError({message, code})` — Postgres 번호 매핑(23514·23502·23503·22P02·22003·22007·22008 → `moim_invalid_input` · 23505 → `moim_duplicate` · 40001·40P01·55P03 → `moim_conflict` · 그 밖 `moim_unknown`). `callMoimRpc` 가 이미 쓴다.
- 사용자 HTTP 번호: `moimRpcStatus(code)` (`moim-route-guard.server.ts`) — `moim_ban_admin_only` 403 · `moim_unknown` 500 · `moim_duplicate` 409 · `*_not_found` 404 · 나머지 기존. 어드민 번호표(`moimAdminRpcResponse`)는 A 가 D §1-1 대로.

## 3. 문구 키 (`lib/i18n/catalog/moim-core.ts`, ko·en)

- `moim_err_<code>` : 위 SQL 14 + 라우트 4 전부. (`moim_err_moim_closed` = 「종료된 모임이라 할 수 없어요」 · `moim_err_moim_image_url_invalid` = 「사진을 다시 올려 주세요」 · `moim_err_moim_schedule_request_not_found` = 「참여 신청을 찾을 수 없어요. 이미 처리됐을 수 있어요」)
- 모임 방(A §6, M 이 씀): `moim_room_type_moim` · `moim_room_type_schedule` · `moim_room_profile_label` · `moim_room_join_via_moim` · `moim_room_join_via_schedule` · `moim_room_members_view` · `moim_room_members_view_all` · `moim_room_caption_main` · `moim_room_caption_schedule` · `moim_room_readonly_closed` · `moim_room_readonly_blocked` · `moim_room_readonly_deleted` · `moim_room_readonly_schedule_done` · `moim_room_readonly_schedule_cancelled` · `moim_room_notice_load_failed` · `moim_room_header_members`({count})
- **지운 키**: `moim_room_managed_in_moim` — M 은 `CommunityMessengerRoomPhase2RoomSheets.tsx` 748·1280줄의 사용을 같은 PR 에서 없앤다(지금은 그 두 줄이 타입 오류).
- 화면 문구(`moim-screens.ts`·`moim-manage.ts`)는 U, 어드민 문구는 A.

## 4. RPC 래퍼 (`lib/moim/server/moim-rpc.server.ts`)

| 함수 | 서명 |
|---|---|
| 새 `moimHostTransferCancel` | `(actorId, transferId, sb?)` |
| 새 `moimBoardReorder` | `(actorId, moimId, boardIds: string[], sb?)` |
| 새 `moimAdminLogRoomAction` | `(adminId, roomId, type, targetId \| null, reason \| null, sb?)` |
| **바뀜** `moimAdminReportReview` | `(adminId, reportId, reason: string, sb?)` — A 는 `app/api/admin/moim/reports/[reportId]/review/route.ts` 를 고친다(지금 3번째 인자로 `sb` 를 넘겨 타입 오류) |
| 반환 타입 추가 | `MoimRpcViewKeys = { moim_status?, retention_ended_at? }` 를 위 §1-2 함수에 붙임. `MoimAdminReportDecideAction.created?` · `sanction_id: string \| null` · decide 반환 `reporter_member_ids?` |

## 5. 공용 TS 서명

- `lib/moim/moim-view-rule.ts`: `moimViewable(state: MoimViewState, receiverIsActiveMember)` · `moimViewStateFromRpc(row)` → `MoimViewState | null`
- `lib/moim/server/moim-notify.server.ts`:
  - `moimNotifyLink(state | null, receiverIsActiveMember, intended, { result })` → `string | null` (null = 보내지 않음, state null = intended)
  - `notifyMoimHostChanged(sb, moimId, toUserId, recipients, dedupeRef, { actorId?, toNickname?, moimStatus? })` — 위임 수락·어드민 지정·미접속 승인 라우트(U·A)가 직접 `notifyMoimMany(... "moim_host_changed")` 대신 이것을 부른다. 계정 정리는 S 가 이미 바꿈
  - `BELL_ONLY_KINDS` 에 `moim_report_result` 추가(벨 전용)
- `lib/moim/moim-search-query.ts`: `moimSearchTerm(raw)`(동네 검색) · `normalizeMoimSearchQuery(raw)`(모임 안 검색) — 같은 정리 함수
- `lib/moim/server/moim-route-guard.server.ts`: `guardMoimRead(req, { rateKey, limit?, allowGuest?: true })` — **기본 로그인 필수**. `requireLogin` 인자는 없앴다 → U 는 `requireLogin: true` 를 넘기던 라우트 10곳에서 그 칸을 지우고(지금 타입 오류), `app/api/moim/invite/[token]/route.ts` 에만 `allowGuest: true`.
- `markMoimRoomOwnersStale()` 는 M 이 `use-moim-room-owner.ts` 에서 내보낸다(S 아님).

## 6. 조회 함수 (`lib/moim/server/moim-queries.server.ts`)

- `getMoimDetail`: `viewer.outgoingHostTransfer = {id, toUserId, toNickname, createdAt} | null`(모임장만) · 위임 조회는 받은·보낸 요청 1회 · 멤버에게 `boards` 는 닫은 게시판 포함(`isActive` 로 거름) · 최근 글에서 고정 글 제외 · 글 DTO 에 `boardName`
- `listMoimMembers(sb, access, out)`: `out.capped`(멤버 1000 상한, `MOIM_MEMBER_LIST_CAP`)
- `listMoimBans`: `byPlatform`, 어드민 차단은 `reason: null`
- `listReceivedMoimInvites`: 차단 모임 · 이미 멤버 · 차단된 초대 제외
- `listLocalMoims`: `moimSearchTerm` 사용
- 새 `listMyMoimContent(sb, userId, { type, moimId?, before? })` → `{ items: MoimMyContentItemDto[], nextBefore }` (U 의 `GET /api/moim/my-content` 가 부름, 로그인은 라우트가 확인)
- 새 `checkMoimInviteCandidates(sb, moimId, userIds)` → `{ members, unavailable }` (최대 `MOIM_INVITE_CHECK_MAX`=300, 권한 `send_invite` 확인은 U 의 라우트)
- `loadMoimAccess` 의 볼 수 있는가 판정은 `moimViewable`

## 7. DTO (`lib/moim/moim-api-types.ts`)

`MoimPostDto.boardName` · `MoimDetailDto.viewer.outgoingHostTransfer` · `MoimBannedDto.byPlatform` · `MOIM_MEMBER_LIST_CAP` · `MoimNotificationPrefsDto.chatMuted?` · 새 `MoimMyContentType`·`MoimMyContentItemDto` · `MoimStaffReportDto.viewerIsAuthor`(S 가 `moim-staff-reports.server.ts` 에서 채움).

## 8. 알림 정책

`notification-preference-policy-registry.ts` `META_KIND_PREFERENCE_POLICY_OVERRIDES`: `moim_report_result`·`moim_admin_info_updated` = mandatory.

## 9. 라우트 계약 (구현은 U·A)

- U: `DELETE /api/moim/host-transfers/[transferId]` → `moimHostTransferCancel` · `PUT /api/moim/[moimId]/boards` body `{order: string[]}` → `moimBoardReorder` · `GET /api/moim/my-content` → `listMyMoimContent` · `POST /api/moim/[moimId]/invites/check` → `checkMoimInviteCandidates` · 역할 라우트 `result.changed !== false` 일 때만 알림 · remove `was_pending` → `moim_join_rejected` · 링크는 `moimNotifyLink(moimViewStateFromRpc(r), false, intended, {result:true})`
- A: 신고 처리 라우트 `levelAction.created !== false` 일 때만 `moim_sanctioned` · 신고자 알림은 `reporter_member_ids` 로 둘로 나눠 `moimNotifyLink` · 직접 제재 라우트는 신고자 알림 없음(K-5) · 리뷰 라우트 사유 필수 · 메신저 어드민 메시지 숨김 뒤 `moimAdminLogRoomAction`
