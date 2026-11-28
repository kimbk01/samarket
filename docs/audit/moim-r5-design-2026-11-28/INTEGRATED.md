# 모임 R5 — 통합 수정 계획 (설계 A·BC·D·E 합본) — 2026-11-28

- 이 문서는 **계획**이다. 저장소·운영 DB·기기·네트워크는 건드리지 않았다(읽기만: 설계 4개, `fn/` 함수 추출본, 저장소 `samarket-wt-moim-r4` = 운영 main `eac581f07`).
- 입력: `design-A.md`(메신저 모임 방) · `design-BC.md`(사용자·운영 관리 화면, §4 S-1~S-8) · `design-D.md`(어드민, §3) · `design-E.md`(서버·DB, §2 #1~#33, R-1~R-5, Q1~Q8, S-01~S-39) · 결함 목록 `docs/audit/moim-full-defect-audit-2026-11-28.md`.
- 네 설계를 다시 쓰지 않는다. 같은 것은 절 번호로 가리키고, **겹치거나 부딪히는 것만** 여기서 하나로 정한다.
- 이 계획이 따르는 리드 결정(설계와 다르면 이것이 이긴다):
  1. **D1/D2 상태 맞추기** — `public.sanctions` 에 트리거를 달지 않는다. `moim_sanctions.community_sanction_id` 열도, 커뮤니티 쪽에서 모임 표에 쓰는 길도 만들지 않는다. 이용 제한 행의 상태는 **읽을 때** 연결된 커뮤니티 제재를 붙여 읽는다. 콘텐츠 숨김 행의 상태는 콘텐츠의 지금 상태로 읽는다. 「해제」 버튼은 모임 단위 행에만 둔다.
  2. **`moim_report_result` 이동 위치** — E §3-2 의 상태별 규칙을 쓴다. 계약 §7 의 「알림 상세」 문구를 그 규칙으로 고친다.
  3. **어드민이 삭제한 모임의 글·댓글·사진은 작성자도 지울 수 없다**(BC 기본값 · BC §6 Owner 결정 1 종결).
  4. **지문** — 지문 쿼리는 `moim_cron_tick` 을 빼고 센다 → 지금 **109**. 합친 마이그레이션 뒤 예상 수는 §A-8.

## 0. 작업자 잘못·설계 오류 먼저

- 이 통합 작업에서 작업자가 만든 문제: 없음(읽기만, 출력 파일 1개).
- 설계끼리 맞지 않거나 빠진 곳(이 계획에서 바로잡음):
  1. **E #4·#10·#11 과 D §1-2 가 삭제 모임 규칙이 다르다.** E 는 삭제 모임에서 숨김·삭제를 허용하고 `moim_not_found` 를 낸다. D 는 전부 막고 `moim_deleted` 를 낸다 → D 로 정함(§A-4 K-3).
  2. **E11: E #12 와 D §2 D14·§3-4 가 정반대다.** E 는 연결한 신고를 「조치」로 닫고 신고자에게 알린다. D 는 신고를 그대로 두고 안내 문구에도 그렇게 적는다 → D 로 정함(§A-4 K-5). 계약 D-18 에 「연결하면 닫는다」는 말이 없다. 계약에 없는 새 동작은 넣지 않는다.
  3. **C5: E #14·#15 와 BC S-4 가 다르다.** 재요청을 할 때 E 는 앞 요청을 취소하고 바꿔 넣는다. BC 는 거부한다. 취소 함수 인자도 E `(p_actor, p_moim)`, BC `(p_actor, p_transfer)` 로 다르다 → BC 로 정함(§A-4 K-1).
  4. **C13: E #25·§3-12(자기 자신만 빼고 누구나) 와 BC S-7(낮은 역할만) 이 다르다** → BC 규칙으로 정함(§A-4 K-6).
  5. **C17/E12: 사진 오류 코드가 두 개다.** BC S-5 는 `moim_cover_invalid`, E #31 은 `moim_image_url_invalid` 이다. 검사 규칙은 같다(`moim__assert_images` = https·1000자, `fn/moim__assert_images.sql` 확인) → `moim_image_url_invalid` 하나로 정함.
  6. **C8: BC 는 「SQL 변경 없음, 화면이 코드를 바꿔 읽음」, E #27 은 새 코드 `moim_schedule_request_not_found`** → E 의 새 코드로 정함(근본 수정). BC 의 새 키 `moim_schedule_request_already_handled` 는 만들지 않는다.
  7. **D §3-3 트리거·열·채우기와 §3-7 의 「숨김 해제 시 content_hide 행 해제」** 는 리드 결정 1 로 **뺀다**(§A-1 뷰로 대체).
  8. **A §5-2 가 마이그레이션을 따로 만든다**(`…_moim_r5_room_profile_bio.sql`) → E 의 마이그레이션 1개에 합친다.
  9. **BC S-6(차단·가입 때 초대 행 정리)** 은 E 에 없다. B14 가 E19 를 흡수했는데 E 는 E19 를 뺐다 → 이 계획이 SQL 목록에 넣는다(§A-3).
  10. **D §5 운영기록 종류 키 표에 이번에 새로 생기는 기록 종류가 없다.** 빠진 것: `invite_declined`·`host_transfer_cancelled`·`album_deleted`(E13), `comment_deleted`·`comment_hidden`(기존), `board_reordered`(S-3), `sanction_dedup`(R-2), `admin_messenger_message_hidden/_unhidden`(D23). D17 의 「마이그레이션 문자열 ⊂ 상수」 구조 확인이 실패한다 → A 작업자가 키를 함께 넣는다.
  11. **E §3-13** 은 새 파일 `lib/moim/moim-search-term.ts` 를 만든다. 그런데 같은 일을 하는 `lib/moim/moim-search-query.ts` `normalizeMoimSearchQuery` 가 이미 있다 → 그 파일에 `moimSearchTerm` 을 두고, 두 함수가 같은 정리 함수를 쓴다(정의 둘 금지).
  12. **E §3-9(위임 보낸 요청 조회 +1)** 와 **BC R-H(기존 조회 한 번에 +0)** → BC 로 정함. E §6-3 의 「모임장 조회 +1」 예산 메모는 지운다.

---

## A. SQL 변경 목록 (마이그레이션 1개)

### A-0. 파일·공통 규칙

- 파일: `supabase/migrations/20271128260000_moim_r5_full_fix.sql` 1개. A §5-2 의 bio 마이그레이션도 이 파일에 합친다.
- 함께 만드는 파일:
  - `docs/audit/moim-r5-backup-definitions-2026-11-28.sql` — 적용 직전 운영 `pg_get_functiondef` 로 만든다. 되돌림용(E §6-4).
  - `docs/audit/moim-r5-local-verify-scenarios-2026-11-28.sql` — §A-9.
- 공통 규칙: E §2 머리 그대로.
  - 본문은 ASCII 만 쓴다.
  - `security definer`, `set search_path to 'public'` 를 붙인다.
  - 새 함수·서명을 바꾼 함수: `revoke … from public, anon, authenticated; grant execute … to service_role`.
  - 반환 JSON 은 **키만 더한다**(옛 웹이 읽는 키는 그대로).
- 순서(한 트랜잭션):
  1. 백업 표
  2. 구조(§A-1)
  3. 새 함수(§A-2)
  4. 바뀌는 함수(§A-3)
  5. 데이터 보정(§A-6) — 순서 R-4 → R-1 → R-2 → R-3 → R-5 → R-6 → R-7
  6. 권한

### A-1. 구조 (표·열·인덱스·뷰·트리거)

| 대상 | 변경 | 출처 |
|---|---|---|
| `public.moim_r5_backup_20271128` | 새 백업 표 (`tbl, row_id uuid, row_data jsonb`, RLS 켬, service_role 만). 2026-12-28 삭제 | E §2-0 |
| `moim_reports` 인덱스 | 새 `moim_reports_open_dedupe_moim_uidx (reporter_id, moim_id, target_type, target_id) where status in ('received','reviewing')` 를 먼저 만들고, 그다음 옛 `moim_reports_open_dedupe_uidx` 를 drop | E §2-1 (E1) |
| `moim_bans.source` | `text not null default 'moim'` + CHECK `('moim','admin')` | E §2-1 (E3) |
| **새 뷰 `public.moim_admin_sanction_rows_v`** | 리드 결정 1. `moim_sanctions` 모든 열 + 아래 읽기 열. `revoke all … from public, anon, authenticated; grant select … to service_role`. 쓰기 경로 없음 | 이 계획 (D1·D2·신규2) |
| 트리거 | **추가 없음**. D §3-3 의 `public.sanctions` AFTER UPDATE 트리거는 만들지 않는다 | 리드 결정 1 |
| `moim_sanctions.community_sanction_id` | **만들지 않는다** | 리드 결정 1 |

**뷰 `moim_admin_sanction_rows_v` 의 읽기 열** (조회 1회로 상태 필터·쪽 넘김이 되게)

- `report_target_type`
  - `left join moim_reports r on r.id = s.source_report_id` 로 얻는다.
  - 콘텐츠 숨김 행은 대상 종류를 따로 저장하지 않는다. 그래서 근거 신고에서 읽는다.
- `community_sanction_id`, `cs_end_at`, `cs_revoked_at` — 이용 제한(`level='user_restrict'`) 행만
  - `left join lateral (select id, end_at, revoked_at from public.sanctions cs where cs.source_report_kind = 'moim' and cs.source_report_id = s.source_report_id and cs.user_id = s.target_id order by cs.created_at desc limit 1)` 로 얻는다.
  - 이 열 이름은 `admin_apply_community_sanction` insert 열 목록(`20270521120400_…:92-98`)에서 확인했다.
  - 운영 현재 정의는 Q14 로 다시 확인한다.
- `content_now` — 콘텐츠 숨김 행만, 대상의 지금 상태
  - 글·댓글·사진 = 그 표의 `status`
  - 일정 = `moim_schedules.status`
  - 채팅 메시지 = `case when is_hidden_by_admin then 'hidden' else 'active' end`
- `live_state` — `'active' | 'expired' | 'revoked' | 'lifted' | 'unlinked'`. 위에서부터 차례로 본다.

  | 행 종류 | 조건 | `live_state` |
  |---|---|---|
  | 모임 단위 행 | (지금 규칙) | `revoked_at` → revoked · `ends_at <= now()` → expired · 그 밖 → active |
  | 이용 제한 행 | `community_sanction_id is null` | **`unlinked`** — 옛 「중복 재사용」 행. 화면은 지금 `ends_at` 기준 상태를 보이고, 링크에는 `userId` 만 넣는다(D §1-3) |
  | 이용 제한 행 | `cs_revoked_at is not null` | revoked |
  | 이용 제한 행 | `cs_end_at <= now()` | expired |
  | 이용 제한 행 | 그 밖 | active |
  | 콘텐츠 숨김 행 | `s.revoked_at is not null` | revoked — R-3 로 정리한 중복 행만 해당. 이 계획 뒤에는 콘텐츠 행의 `revoked_at` 을 쓰는 코드가 없다 |
  | 콘텐츠 숨김 행 | `content_now in ('hidden','deleted','cancelled')` | active |
  | 콘텐츠 숨김 행 | 그 밖 | **lifted** (콘텐츠가 복구됨) |

- 뷰는 함수가 아니어서 지문 수(§A-8)에 들어가지 않는다.
- 어드민 쿼리(`listAdminMoimSanctions`·`loadAdminMoimSection` sanctions)는 표 대신 이 뷰를 읽는다(A 작업자).

### A-2. 새 함수 (7개)

| # | 함수 | 동작 | 출처 |
|---|---|---|---|
| N1 | `moim__assert_image_url(p_url text) returns void` | null 은 통과. `^https://[^\s]+$` 가 아니거나 1000자를 넘으면 `moim_image_url_invalid` | E #31 (BC S-5 흡수) |
| N2 | `moim__assert_birth_years(p_min int, p_max int) returns void` | 1900~올해, 최소 ≤ 최대. 어기면 `moim_age_range_invalid` | E #32 |
| N3 | `moim_host_transfer_cancel(p_actor uuid, p_transfer uuid) returns jsonb` | 대상: `id = p_transfer and kind = 'direct' and status = 'requested' and from_user_id = p_actor`. 맞으면 `cancelled`·`decided_at` + 기록 `host_transfer_cancelled`. 없거나 이미 처리됐으면 `moim_transfer_not_found`. 모임이 차단·종료여도 된다(물러나는 동작) | **BC S-4 서명** + E #15 본문 (K-1) |
| N4 | `moim__admin_assert_state(p_moim uuid, p_need text) returns void` | `p_need in ('active','not_deleted')`. 행 없음 → `moim_not_found` · `deleted` → `moim_deleted` · `p_need='active'` 이고 `closed` → `moim_closed`. 잠금은 부르는 쪽이 먼저 잡는다(`select … for update` 뒤에 부른다) | D §3-1 |
| N5 | `moim_admin_log_room_action(p_admin, p_room, p_type, p_target, p_reason) returns jsonb` | 방 → 모임은 N6 으로 찾는다. 모임 방이 아니면 `{ok:false, error:'moim_room_not_moim'}`. `p_type in ('admin_messenger_message_hidden','admin_messenger_message_unhidden')` 이면 `moim__admin_log` 만 한다. **제재 행은 건드리지 않는다**(리드 결정 1 — D §3-7 의 해제 부분 삭제) | D §3-7 (축소) |
| N6 | `moim__room_moim_id(p_room uuid) returns uuid` (stable) | `owner_domain='moim'` 인 방의 `owner_ref_id` 가 모임이면 그 id, 일정이면 `moim_schedules.moim_id`. 그 밖이면 null. N5·R-7·`moim__room_member_activate` 가 같이 쓴다 | A §5-2 |
| N7 | `moim_board_reorder(p_actor uuid, p_moim uuid, p_board_ids uuid[]) returns jsonb` | `manage_boards` 권한이 있어야 한다. 게시판 행을 잠근다. 배열이 **지금 켜진 게시판 집합과 정확히 같을 때만** `sort_order = 배열 위치(1부터)`. 중복·누락·다른 모임 id → `moim_board_order_invalid`. 닫힌 게시판은 그 뒤 번호로, 원래 순서를 지킨다. 기록 `board_reordered` | BC S-3 |

### A-3. 바뀌는 기존 함수 (37개) — 함수마다 최종 동작 하나

표기: 「출처」는 그 줄을 요구한 설계 절이다. 「조정」은 이 계획이 합치거나 바꾼 것이다.

**신고·제재 (어드민)**

| 함수 | 최종 동작 (지금 정의에서 바뀌는 줄만) | 출처 | 조정 |
|---|---|---|---|
| `moim_admin_report_decide` | ① 같은 대상 함께 닫기에 `moim_id = v_r.moim_id` 를 더한다 (E1) ② 모임 단위 제재: 같은 모임·같은 단계·진행 중인 행이 있으면 새로 넣지 않고 그 id 를 쓴다. action 에 `created:false` (D3) ③ 콘텐츠 숨김: `v_changed=false` 면 새로 넣지 않는다. 같은 대상의 가장 최근 `content_hide` 행 id(없으면 null)를 쓰고 `changed:false` (신규2) ④ 이용 제한: 커뮤니티 함수가 `duplicate=true` 를 돌려주면 `moim_sanctions` 행을 넣지 않는다. `sanction_id` = 같은 사용자의 활성 `user_restrict` 행(없으면 null) ⑤ 삭제 모임 + (숨김 또는 모임 제재) → `moim_deleted`. 지금 위치의 `moim_not_found` 를 바꾼다. 이용 제한·기각은 삭제 모임에서도 된다 (D10) ⑥ `moim_notify_user_ids` 는 모임 `status<>'active'` 면 `[]` (E18) ⑦ 반환에 키를 더한다: `moim_status`·`retention_ended_at`·`reporter_member_ids` (E4) | E #1 · D §3-2 · D10 | 중복 표시 키는 **`created`** 하나로 정한다(D 의 `duplicate:true` 는 쓰지 않음). 라우트는 `created !== false` 일 때만 `moim_sanctioned` 를 보낸다 |
| `moim_admin_sanction_apply` | ① `perform moim__admin_assert_state(p_moim,'not_deleted')` (지금 `moim_not_found` → `moim_deleted`) ② 같은 단계가 진행 중이면 `moim_sanction_already_active` (지금 `moim_conflict`) ③ `p_report` 가 있으면 **같은 모임이고 `status in ('received','reviewing')`** 일 때만 연결한다. 아니면 `moim_report_link_invalid` (E11). **신고 상태는 바꾸지 않는다** ④ 모임 `status<>'active'` 면 `notify_user_ids=[]` (E18) ⑤ 키 추가 `moim_status`·`retention_ended_at` (E4) | E #12 · D §3-4 | E 의 「연결 신고 actioned 로 닫기」·`report_reporter_id`·신고자 알림(E §3-18 둘째 줄)은 **뺀다** (K-5) |
| `moim_admin_sanction_revoke` | 행 없음 → `moim_sanction_not_found` · `target_kind<>'moim'` → `moim_sanction_not_revocable` · 이미 해제 → `moim_conflict` · 삭제 모임 → `moim_deleted` (assert `not_deleted`) · 모임 `status<>'active'` 면 `notify_user_ids=[]` · 키 추가 `moim_status`·`retention_ended_at` | D §3-4 · E #11 | E 의 `moim_not_found`(삭제) → `moim_deleted` |
| `moim_admin_report_review` | 서명 교체 `(p_admin uuid, p_report uuid, p_reason text default null)`. `moim__admin_reason(p_reason)` 필수, 기록에 그 사유를 남긴다. 옛 `(uuid,uuid)` 는 drop | E #26 · D §3-5 | 같음 |
| `moim_admin_content` | ① 내용 행을 찾은 뒤(일정 취소 갈래 포함) `moim__admin_assert_state(v_moim,'not_deleted')` — **모든 동작**(hide·restore·delete·undelete·cancel)을 삭제 모임에서 `moim_deleted` 로 막는다 (D11) ② undelete: 그 대상의 마지막 삭제 기록이 `actor_kind='user'`(작성자 본인 삭제)면 `moim_content_author_deleted` (E8 회귀 막기) | D §1-2·§3-1 · E #10 | E 의 「삭제 모임에서 숨김·삭제는 허용」은 **뺀다** (K-3). D §3-3 의 「복구 시 content_hide 행 해제」는 **뺀다** (리드 결정 1) |
| `moim_admin_member_remove` | ① assert `not_deleted` (D11) ② `p_ban` 이면 `source='admin'` 으로 넣는다. 열린 운영진 차단이 있으면 그 행을 `source='admin'`·`banned_by`·`reason` 으로 넘겨받는다 (E3) ③ `p_ban` 이면 이 모임에서 그 사람에게 간 `moim_invite_targets.status='sent'` 를 `cancelled` 로 (S-6) ④ 키 추가 `was_pending`·`moim_status`·`retention_ended_at` (E10·E4) | E #6 · D §3-1 · BC S-6 | — |
| `moim_admin_member_unban` | ① assert `not_deleted` → `moim_deleted` ② 활성 차단이 없고 풀린 차단 행만 있으면 `moim_conflict`. 차단 기록 자체가 없으면 `moim_ban_not_found` ③ 출처와 상관없이 해제한다 ④ 키 추가 `moim_status`·`retention_ended_at` | E #4 · D §3-4 | E 의 `moim_not_found` → `moim_deleted` |
| `moim_admin_member_role` · `moim_admin_assign_host` · `moim_admin_host_request_decide` | assert `active` 를 넣는다(종료 → `moim_closed`, 삭제 → `moim_deleted`). `platform_state` 검사는 넣지 않는다 — 경고 중에도 허용(Owner E18) | D §3-1 | — |
| `moim_admin_update_info` | ① assert `not_deleted` ② E #20 과 같은 형식 검사 + N1·N2 ③ `lgu_id` 를 주면 `^[0-9A-Za-z:_-]{2,40}$` 가 아닐 때 `moim_region_invalid` ④ 키 추가 `moim_status`·`retention_ended_at` | E #21 · D §3-5 | — |
| `moim_admin_policies_save` | 켜진 신고 사유가 0개면 `moim_policy_report_reason_none_active` (D6) · 금지 유형·신고 사유의 `label_en` 1~80자 필수 (D20) | E #28 · D §3-5 | 합침 |

**신고·차단 (사용자)**

| 함수 | 최종 동작 | 출처 |
|---|---|---|
| `moim_report_create` | 중복 검사에 `moim_id = p_moim` 을 더한다. 동시 두 번 누르기는 `unique_violation` → `moim_report_duplicate` | E #2 |
| `moim_member_unban` | `source='moim'` 행만 해제한다. 어드민 차단이면 `moim_ban_admin_only` | E #3 |
| `moim_member_remove` | 키 추가 `was_active`·`was_pending`·`moim_status`·`retention_ended_at` (E10·E4). 차단 분기에서는 sent 초대를 `cancelled` 로 (S-6) | E #5 · BC S-6 |

**글·댓글·사진**

| 함수 | 최종 동작 | 출처 | 조정 |
|---|---|---|---|
| `moim_post_remove` | 작성자: `status in ('active','hidden')` 이면 `deleted` + 기록(`from` 상태). 멤버 여부 무관. **모임 `status='deleted'` 면 `moim_post_not_found`** (리드 결정 3). 작성자가 아니면 `active` 만 숨긴다(지금 그대로) | E #7 · BC S-2 | 삭제 모임 거부 줄을 더한다 |
| `moim_comment_remove` | 위와 같은 규칙 + **댓글 수는 지울 때 `active` 였던 경우에만 뺀다**(숨김 댓글은 숨길 때 이미 뺐다 — `fn/moim_comment_remove.sql`·`moim_admin_content` 확인) + 삭제 모임 거부 | E #8 · BC S-2 | 같음 |
| `moim_album_remove` | 위와 같은 규칙 + 본인 삭제 기록 `album_deleted` (E13) + 삭제 모임 거부 | E #9 · BC S-2 | 같음 |
| `moim_comment_create` | 모임 `status<>'active'` 면 `moim_closed` (지금은 `moim_post_not_found`) | BC S-1 | 새로 넣음 |
| `moim_post_update` | 모임 `status<>'active'` 면 `moim_closed` (지금은 **저장됨**) | BC S-1 | 새로 넣음 |

**게시판**

| 함수 | 최종 동작 | 출처 |
|---|---|---|
| `moim_board_upsert` | `is_active` 를 false → true 로 바꿀 때: 켜진 사용자 게시판 수 ≥ `max_custom_boards` 면 `moim_board_limit`. 다시 열면 `sort_order = 최대+1` | BC S-3b |

**가입·초대·프로필**

| 함수 | 최종 동작 | 출처 |
|---|---|---|
| `moim_invite_respond` | 거절 기록 `invite_declined` (E13) · 사용자가 보낸 `avatar_url` 에 N1 (E12). 거절 분기는 휴대폰·약관을 보지 않는다(변경 없음 확인 — BC R-J) | E #13 |
| `moim__activate_member` | 활동 멤버가 되면 이 모임에서 그 사람에게 간 `sent` 초대를 `cancelled` 로 (S-6). **구현 확인**: `moim_invite_respond` 수락이 자기 행을 `accepted` 로 바꾸는 시점이 이 함수 호출 전인지 후인지 본다. 후라면 응답 중인 행 id 는 빼고 갱신한다 | BC S-6 |
| `moim_join` | `avatar_url` 에 N1 | E #23 |
| `moim_create` | 표지·사진에 N1. 정원·출생 연도는 형식 사전 검사 + N2 | E #22 |
| `moim_update_info` | E #20 그대로(정원·카테고리·출생 연도 형식 → 각 코드, N2, 표지 N1) | E #20 (BC S-5 흡수, 코드는 `moim_image_url_invalid`) |
| `moim_profile_update` | ① 종료 모임 → **`moim_closed`**, 없음·삭제 → `moim_not_found` ② `platform_state='blocked'` → `moim_blocked` ③ `avatar_url` 에 N1 (E12·E18) ④ 방 프로필 update 에 `bio = left(moim_members.bio,300)` (A18) | E #18 · A §5-2 ③ | 종료 코드를 E 의 `moim_not_found` 에서 `moim_closed` 로 바꾼다(S-1 과 같은 어휘) |
| `moim__room_member_activate` | 방 프로필 insert·`on conflict` 에 `bio = coalesce(left(mm.bio,300),'')` (`moim__room_moim_id` 로 모임을 찾는다). 인자는 그대로 | A §5-2 ② |
| `moim_member_note_set` | `p_actor = p_target` → `moim_cannot_target_self`. 대상 행이 있고 `moim__role_rank(대상 역할) >= moim__role_rank(내 역할)` 이면 `moim_forbidden`. 대상 상태는 묻지 않는다(나간 사람·신청자 행은 역할 `member` 라 운영진이 쓸 수 있음) | **BC S-7** (E #25 의 자기 자신 거부 포함) |
| `moim_member_role_set` | 같은 역할이면 `{ok:true, changed:false}` 를 돌려주고 기록하지 않는다 | E #24 |

**위임·일정·정리**

| 함수 | 최종 동작 | 출처 | 조정 |
|---|---|---|---|
| `moim_host_transfer_request` | 열린 요청(`status='requested'`, 종류 무관)이 있으면 **취소하지 않고** `moim_transfer_pending` 으로 거부한다. 지금 있는 말없는 `update … set status='cancelled'` 줄은 지운다. 고유 인덱스 `moim_host_transfers_one_open_uidx`(모임당 열린 요청 1개)와 맞는다 | BC S-4 · E #14 | E 의 「direct 는 바꿔 넣기 + 기록」은 **뺀다** (K-1). E13 의 「덮어쓰기 취소 기록 누락」은 덮어쓰기 자체가 없어지고 N3 가 기록하므로 닫힌다 |
| `moim_host_inactive_request` | 차단 모임이면 `moim_blocked`, 경고는 허용 | E #16 | — |
| `moim__release_member` | 일정 호스트 재지정 조건에서 `starts_at > now()` 를 지운다(시작했지만 안 끝난 일정 포함) | E #17 | — |
| `moim_schedule_leave` | 차단 검사를 없앤다(물러나는 동작). 종료·삭제 모임은 지금처럼 거부 | E #19 | — |
| `moim_schedule_decide` | 처리된 신청 → `moim_schedule_request_not_found` | E #27 | BC C8 은 이 코드를 읽는다 (K-7) |
| `moim_account_cleanup` | 넘겨줄 정보에 `moim_status`·`to_nickname` 을 더한다 | E #30 | — |
| `cm_moim_guard_rooms` | 막는 칸에 `room_status` 를 더한다 | E #29 · D §3-6 | 같음 |

- 바뀌는 함수 수 확인: 이름은 위 표 순서와 같다.
  - E 29개
  - BC 4개(`moim_comment_create`·`moim_post_update`·`moim_board_upsert`·`moim__activate_member`)
  - D 3개(`moim_admin_member_role`·`moim_admin_assign_host`·`moim_admin_host_request_decide`)
  - A 1개(`moim__room_member_activate`)
  - 합계 **37개**. 모두 `fn/` 에 지금 정의가 있다(확인함).

### A-4. 설계 간 충돌과 결정 (SQL)

| K | 충돌 | 결정 | 이유 |
|---|---|---|---|
| K-1 | C5 재요청: E #14 「direct 는 취소 후 새로」 vs BC S-4 「거부」. 취소 인자 `(p_moim)` vs `(p_transfer)` | **BC**: 거부 + `(p_actor, p_transfer)`. 라우트는 `DELETE /api/moim/host-transfers/[transferId]`. E 의 `DELETE /api/moim/[moimId]/host-transfer` 는 만들지 않는다 | 화면(BC R-H)이 보낸 요청 카드에서 그 id 로 취소한다 → 본 것만 취소한다. 결함 C5 의 「말없이 취소」를 경로째 없앤다 |
| K-2 | D3 중복 표시 키: E `created:false` vs D `duplicate:true` | `created` 하나 | 옛 DB 에서 키가 없으면 「만든 것」(E 의 호환 규칙) |
| K-3 | 삭제 모임 콘텐츠 조치: E #10 「복구만 막음, 숨김·삭제 허용, `moim_not_found`」 vs D §1-2 「전부 막음, `moim_deleted`」 | **D** | 한 규칙(「삭제 모임은 복구 전까지 조회만, 신고의 이용 제한·기각은 예외」)으로 버튼·서버·문구가 1:1 이 된다. 계약 P15 「복구 가능」과 맞다(복구한 뒤 처리). 계약 §8 문장은 D §4-1 대로 더한다 |
| K-4 | `moim_admin_report_decide` 를 D3·E1·E11·D10·D11·신규2·E4·E18 이 함께 바꾼다 | §A-3 첫 줄 정의 하나(①~⑦). S 작업자 한 사람이 쓴다 | D §8-7 이 요구한 것 |
| K-5 | E11 직접 제재 연결: E 「연결 신고를 actioned 로 닫고 신고자에게 알림」 vs D 「신고 그대로, 코드 `moim_report_link_invalid`」 | **D**. 처리 전·같은 모임만 연결, 신고 상태는 바꾸지 않는다. D14 새 문구 그대로 | 계약 D-18 은 「연결할 수 있다」까지만 말한다. 닫기·알림은 계약에 없는 새 동작이다(설계 규정 1). E 가 든 「다시 처리하면 D3 중복」은 K-4 ② 가 막는다 |
| K-6 | C13 메모: E #25 「자기 빼고 누구나」 vs BC S-7 「낮은 역할만」 | **BC**(대상 상태 무관으로 조금 넓힘) | 멤버 탭이 이미 이 규칙이다(BC §R-I C13). 바꾸는 곳이 가장 적다. E §3-12 의 멤버 탭 변경은 **하지 않는다** |
| K-7 | C8 코드: BC 「SQL 변경 없음」 vs E #27 새 코드 | **E** 코드 + BC 화면 처리(다시 불러오기) | 코드 뜻을 바로잡는 근본 수정. 문구 키는 `moim_err_moim_schedule_request_not_found` 하나 |
| K-8 | 사진 코드 `moim_cover_invalid`(BC) vs `moim_image_url_invalid`(E) | E | 같은 규칙, 코드는 하나 |
| K-9 | D1 동기화: D §3-3 트리거·열 vs 리드 결정 1 | 뷰(§A-1). 커뮤니티 표에는 쓰지 않는다 | 리드 결정 |
| K-10 | 모임 방 `room_status` 가 이미 active 가 아님: E Q5 「보정 안 함·목록만」 vs D §3-6 「active 로 되돌림」 | **조건부 R-6**: Q5 가 0건이면 할 일 없음. 1건 이상이면 DB 적용 승인 요청에 행 목록(방·모임·지금 값)을 적는다. 승인을 받으면 백업 후 `active` 로 되돌린다 | 트리거가 들어간 뒤에는 아무도 그 값을 못 바꾼다(D). 그래도 운영 값을 바꾸는 것이므로 미리 보이고 승인받는다(허위 보고 금지 8번) |
| K-11 | 댓글 수: 작성자가 숨김 댓글을 지움(E8·S-2) | 지울 때 `active` 였던 경우에만 뺀다. 어드민 undelete 가 `+1` 하는 경로는 K-3·E8 규칙(작성자 삭제는 undelete 불가)으로 생기지 않는다 | 두 번 빼기·되살림 `+1` 둘 다 막음 |
| K-12 | 종료 모임 사용자 쓰기 코드: E #18 `moim_not_found` vs BC S-1 `moim_closed` | 새로 막는 곳(`moim_comment_create`·`moim_post_update`·`moim_profile_update`)은 `moim_closed`. 기존 코드가 있는 곳(`moim_schedule_leave` 등)은 그대로 | 화면이 「종료된 모임」 문장을 보일 수 있다 |

### A-5. 오류 코드 최종 목록 (`lib/moim/moim-error-codes.ts` — 계약 시험이 SQL 과 대조)

- **SQL 이 새로 내는 코드(14)**
  - E: `moim_ban_admin_only` · `moim_content_author_deleted` · `moim_image_url_invalid` · `moim_age_range_invalid` · `moim_region_invalid` · `moim_schedule_request_not_found` · `moim_policy_report_reason_none_active`
  - D: `moim_closed` · `moim_deleted` · `moim_sanction_not_revocable` · `moim_sanction_already_active` · `moim_report_link_invalid`
  - BC: `moim_board_order_invalid`
  - N5 응답 전용: `moim_room_not_moim`
- **라우트 전용(`MOIM_ROUTE_ERROR_CODES`)**: `moim_invalid_input` · `moim_duplicate`(E §3-14) · `moim_join_answer_too_long`(BC B11) · `moim_rooms_unavailable`(A §2-1, 화면에 띄우지 않음)
- **메신저 어드민 가드 코드**: `moim_room_managed_by_moim`(D5, TS). 트리거가 내는 `moim_room_settings_managed_by_moim` 은 지금 그대로.
- **HTTP 번호**
  - 사용자 `moimRpcResponse`: `moim_ban_admin_only` → 403 · `moim_unknown` → 500 · 나머지는 지금 규칙(E §3-4·§3-14)
  - 어드민 `moimAdminRpcResponse`: D §1-1 표 하나. 422 목록에 `moim_content_author_deleted`·`moim_report_link_invalid` 를 더한다. `moim_region_invalid`·`moim_policy_report_reason_none_active` 는 400

### A-6. 데이터 보정 (마이그레이션 안 · 백업 먼저 · 두 번 돌려도 같은 결과)

| 보정 | 규칙 | 출처 |
|---|---|---|
| R-4 E3 차단 출처 | Q4 의 **열린** 어드민 차단 → `source='admin'`. 이미 풀린 것은 목록만 보고 | E §2-3 |
| R-1 E1 잘못 닫힌 신고 되살림 | Q1 ∪ Q1b 를 `received` 로 되돌린다. **새 인덱스를 만든 뒤** 실행하고, 새 인덱스와 부딪히는 행(Q12)은 되살리지 않고 목록만 보고 | E §2-3 |
| R-2 D3 중복 모임 제재 | Q2 묶음마다 `ends_at` 이 가장 늦은 1행을 남긴다. 나머지는 `revoked_at=now(), revoked_by=null` + 기록 `sanction_dedup`. 적용 뒤 `platform_state` 가 같은지 대조 | E §2-3 |
| R-3 신규2 중복 숨김 기록 | Q3 묶음마다 가장 이른 1행을 남긴다. 나머지는 `revoked_at=created_at`. 신고 `action_id` 는 남긴 행으로 옮긴다. 뷰는 이 행을 `revoked` 로 보인다(§A-1) | E §2-3 |
| R-5 E14 일정 호스트 | Q6 일정 → 모임장으로 재지정(모임장이 없거나 같은 사람이면 건너뜀) | E §2-3 |
| R-6 D5 방 상태 | **조건부**(K-10): Q5 가 1건 이상이고 승인을 받았을 때만 `room_status='active'` | D §3-6 |
| R-7 A18 방 프로필 소개 | A §5-2 ④ 채워 넣기(활성 멤버, 값이 다른 행만). **백업 표에 먼저 담는다**(A 설계에는 백업이 없었다 — `community_messenger_room_profiles.id` 는 uuid 라 백업 표 키에 맞다) | A §5-2 |
| (뺌) D §3-3 `community_sanction_id` 채우기 | 하지 않는다(리드 결정 1). 대신 Q9 로 연결 안 되는 행 수만 보고 | — |
| (뺌) S-6 남은 초대 행 정리 | 하지 않는다. 화면 거르기(BC R-E)가 앞뒤로 맞다. Q13 으로 수만 보고 | BC R-E |

- 적용 뒤 보고: 단계별 바뀐 행 수 · 백업 행 수 · 열 단위 대조(바뀌어야 할 열만 다름) · 백업 삭제 기한 2026-12-28.

### A-7. 적용 전 확인 (운영 읽기 전용 · 작업자 1회씩)

- 모든 조회는 이렇게 감싼다: `begin read only; set local statement_timeout = '30s'; … rollback;`
- 처음 보는 표는 `information_schema.columns` 를 먼저 본다. `sql-guard` 훅을 통과해야 한다.

| Q | 내용 | 출처 |
|---|---|---|
| Q0 | 지문 쿼리(`moim_cron_tick` 제외): 이름 수 = **109**, md5 = `b6b7e8d7…` 인지. 바뀌는 37개의 `pg_get_functiondef` 를 저장소 마지막 정의와 대조하고, 백업 정의 파일로 저장 | E §6-2 · 리드 결정 4 |
| Q1·Q1b | E1 다른 모임 결정으로 닫힌 신고 | E |
| Q2·Q3 | D3·신규2 중복 제재 | E |
| Q4 | E3 어드민 차단 | E |
| Q5 | D5 `owner_domain='moim'` 이고 `coalesce(room_status,'active')<>'active'` 인 방 — 방 id·모임·값 목록 | E · D |
| Q6 | E14 호스트가 나간 진행 일정 | E |
| Q7 | E12·C17 새 검사가 거부할 저장값(표지·사진·연령). 1건 이상이면 그대로 두고 보고. 함께 저장소 업로드 코드를 grep 해서 http 주소를 보내는 경로가 없는지 본다 | E |
| Q8 | D6 켜진 신고 사유 수 ≥ 1 | E |
| Q9 | 리드 결정 1: `level='user_restrict'` 행 중 뷰 연결(`source_report_kind='moim'`·같은 `source_report_id`·같은 `user_id`)이 안 되는 행 수 → 화면에 `unlinked` 로 남는 수 | 이 계획 |
| Q10 | D20 `label_en` 이 빈 정책 줄. 1건 이상이면 Owner 에게 그 줄을 알리고, 채운 뒤 적용 | D §3-5 |
| Q11 | A18 R-7 대상 행 수 · 바뀔 행 수 | A §5-2 |
| Q12 | R-1 되살릴 행 중 새 인덱스(신고자·모임·대상)와 부딪히는 열린 신고 | 이 계획 |
| Q13 | 남은 `sent` 초대 중 차단 모임·이미 멤버·차단된 사람 수(보고만) | BC R-E |
| Q14 | `public.sanctions` 열(`source_report_id`·`source_report_kind`·`end_at`·`revoked_at`·`created_at`)이 운영에 있는지 — 뷰 정의 전 | 이 계획 |
| Q15 | 열린 위임 요청의 종류별 수(재요청 거부 규칙에 걸릴 모임 수, 보고만) | 이 계획 |

### A-8. 지문 예상 (리드 결정 4)

- 지금(운영 · `moim_cron_tick` 제외): **109**
  - 저장소 마지막 정의로 이름을 세면 110개다(`moim%` 106 + `cm_moim%` 4). 그중 `moim_cron_tick` 을 빼면 109 로 맞다. E §6-2 의 「1 차이 이유 확인 못 함」은 이것으로 풀린다.
- 더해지는 이름 **7개**
  - `moim__assert_image_url`
  - `moim__assert_birth_years`
  - `moim_host_transfer_cancel`
  - `moim__admin_assert_state`
  - `moim_admin_log_room_action`
  - `moim__room_moim_id`
  - `moim_board_reorder`
- 없어지는 이름 **0개**
  - `moim_admin_report_review` 는 옛 2인자를 drop 하고 3인자를 만든다. 이름 수도, 함수 수도 그대로다.
  - D §3-3 의 트리거 함수는 만들지 않는다(리드 결정 1).
- **적용 뒤 예상 = 116** (109 + 7).
- md5 는 바뀐 37 + 새 7 = 44개 정의 때문에 달라진다. 적용 직후 같은 쿼리로 「116 + `pg_get_functiondef` md5 전후 비교 = 정확히 위 44개 이름」을 보고한다.
- 뷰 `moim_admin_sanction_rows_v` 는 함수가 아니라 지문에 들어가지 않는다. 존재 확인은 따로 보고한다.

### A-9. 로컬 PG17 시나리오

- 파일: E §5 틀(`pg_temp.r`)을 쓴다.
- 운영·테스트 DB(`dibay-test`·`dibay-reset-qa`)는 쓰지 않는다. 로컬 Postgres 에서만 돌린다.

**E 시나리오 S-01~S-39 그대로 쓰되, 아래는 기대값을 바꾼다**

| ID | 바꾼 기대값 |
|---|---|
| S-14 | 처리된 신고를 연결 → `moim_report_link_invalid` |
| S-15 | 열린 신고를 연결 → 제재만 생기고 **신고 상태는 그대로**(K-5) |
| S-31 | 삭제 모임 제재 해제·숨김 복구·차단 해제 → `moim_deleted` ×3 |
| S-32 | 직접 위임 요청이 열려 있어도 `moim_transfer_pending` |
| S-33 | 인자를 `p_transfer` 로 |
| S-35 | 자기 자신 → `moim_cannot_target_self`, 같거나 높은 역할 → `moim_forbidden` |

**새 시나리오**

| ID | 시나리오 → 기대 |
|---|---|
| S-40 | 종료 모임 댓글 쓰기·글 수정 → `moim_closed` ×2 (S-1) |
| S-41 | 게시판 순서: 정확한 집합 → ok · 누락·중복·다른 모임 id → `moim_board_order_invalid` (S-3) |
| S-42 | 상한에서 닫은 게시판 다시 열기 → `moim_board_limit` · 상한 아래 → `sort_order` 최대+1 (S-3b) |
| S-43 | 미접속 요청이 열린 채 직접 요청 → `moim_transfer_pending`, 미접속 요청 그대로 (S-4) |
| S-44 | 차단 → `sent` 초대 `cancelled` · 승인 가입 → `cancelled` · 초대 수락 → 그 행 `accepted` (S-6) |
| S-45 | 어드민이 삭제한 모임에서 작성자가 글·댓글·사진 삭제 → `*_not_found` ×3 (리드 결정 3) |
| S-46 | assert: 종료 모임 역할·지정·미접속 승인 → `moim_closed` ×3 · 삭제 모임 10개 함수 → `moim_deleted` |
| S-47 | 같은 제재를 두 번 해제 → 둘째 `moim_conflict` · 콘텐츠 행 해제 → `moim_sanction_not_revocable` · 두 번 차단 해제 → 둘째 `moim_conflict` (D13) |
| S-48 | 직접 제재 같은 단계 진행 중 → `moim_sanction_already_active` |
| S-49 | `label_en` 빈 줄 저장 → 거부 (D20) |
| S-50 | 뷰: 커뮤니티 제한 해제 → 그 행 `revoked` · 숨긴 글 복구 → `lifted` · R-3 중복 행 → `revoked` · 연결 없는 옛 행 → `unlinked` |
| S-51 | A18: 소개 있는 가입·소개 수정·일정 확정 → 방 프로필 소개가 같음 · R-7 두 번째 실행 0행 |
| S-52 | N5: 모임 방 → 기록 1행 · 일반 방 → `ok:false` · 제재 행 변화 0 |
| S-53 | 지문: 적용 뒤 같은 쿼리 = 116 |
| S-54 | 권한: anon·authenticated 로 새 함수 7개 호출·뷰 select → permission denied |

---

## B. TS 쪽 겹침 — 같은 파일을 여러 설계가 바꾸는 곳

| 파일 | 바꾸는 설계 | 합친 방법 | 담당 |
|---|---|---|---|
| `lib/moim/server/moim-queries.server.ts` | E §3-2(`canViewMoim` 꺼내기)·§3-4(`listMoimBans` 출처)·§3-9·§3-13 / BC R-E(`listReceivedMoimInvites` 거르기)·R-F(멤버에게 닫은 게시판까지·`boardName`)·R-H(`outgoingHostTransfer`)·B18(`is_pinned=false`)·C14(`capped`) | 한 사람이 한 번에 고친다. 위임 조회는 **BC 한 번 조회**(`to_user_id=나 or from_user_id=나`, direct, requested). E §3-9 의 +1 조회는 하지 않는다. `canViewMoim` 은 `lib/moim/moim-view-rule.ts` `moimViewable` 을 부른다 | S |
| `lib/moim/moim-api-types.ts` | E(`MoimBannedDto.byPlatform`) · BC(`MoimPostDto.boardName`, `viewer.outgoingHostTransfer`, 내 글 항목 DTO, `MoimStaffReportDto.viewerIsAuthor`, 멤버 목록 `capped`, 알림 설정 `chatMuted`) | S 가 **1단계에서** 모든 칸을 한 번에 넣는다(§D 계약 고정표). M·U·A 는 그 타입을 쓴다 | S |
| `lib/moim/moim-error-codes.ts` | E · BC S-8 · D | §A-5 목록 하나 | S |
| `lib/moim/moim-client-api.ts` | A(`call()` 의 GET 아닌 요청 뒤 `markMoimRoomOwnersStale()`) · BC(`myContent`·순서 저장·위임 취소·초대 확인·`moimRoutes.myContent`) | U 가 혼자 고친다. `markMoimRoomOwnersStale` 은 M 이 `use-moim-room-owner.ts` 에서 내보낸다. U 는 import 1줄과 호출 1줄만 쓴다 | U |
| `lib/moim/use-moim-room-owner.ts` | A 만 | 다른 설계는 손대지 않는다. `moimRoomOwnerShowsHome` 의 뜻이 `homeOpen` 으로 바뀐다 — 쓰는 곳(머리글·서랍·방 정보·`CommunityMessengerHome`)은 M 안 | M |
| `app/api/moim/rooms/route.ts` (`MoimRoomOwnerDto`) | A 만 | D23 은 다른 함수(`lib/admin/moim/moim-room-ref.server.ts` `resolveMoimRooms`)를 쓰므로 503 변경의 영향이 없다 | M |
| `lib/moim/server/moim-route-guard.server.ts` | BC R-G(`guardMoimRead` 로그인 필수·`allowGuest`) · E §3-4·§3-14(`moimRpcResponse` 403·500) | 합쳐 한 번에. `requireLogin` 인자는 없앤다 → 그 인자를 넘기던 라우트는 U 가 같은 PR 에서 고친다 | S |
| `lib/moim/server/moim-rpc.server.ts` | E §3-14 | — | S |
| `lib/moim/server/moim-notify.server.ts` | E §3-2(`moimNotifyLink`)·§3-3(`BELL_ONLY_KINDS`)·§3-11(`notifyMoimHostChanged`) | 함수 서명은 §D 계약 고정표대로. 부르는 라우트는 U·A 가 고친다 | S |
| `lib/moim/moim-search-query.ts` | E §3-13 | 새 파일 대신 이 파일에 `moimSearchTerm` 을 둔다(§0-11) | S |
| `app/api/moim/invites/[inviteId]/route.ts` | E §3-16 · BC R-J · BC B11 | 같은 변경이다(거절 = `phone:false, consentExempt:true` · 수락 = 약관 → 가입 → `guardMoimAcceptGate`). 답변 1000자 초과면 400 | U |
| `app/api/moim/host-transfers/[transferId]/route.ts` | E §3-11(알림) · BC R-H(DELETE) | 한 파일에 POST 의 알림 교체 + 새 DELETE | U |
| `app/api/moim/[moimId]/members/**`·`remove` | E9 · E10 · E4 | `changed !== false`, `was_pending` → `moim_join_rejected`, 링크는 `moimNotifyLink` | U |
| `app/api/admin/moim/reports/[reportId]/decision/route.ts` | D3 · E §3-18 · E4 | `created !== false` 일 때만 `moim_sanctioned`. 신고자는 `reporter_member_ids` 로 둘로 나눠 보낸다 | A |
| `app/api/admin/moim/moims/[moimId]/sanctions/route.ts` | E §3-18(신고자 알림) · D | E 의 신고자 알림은 **뺀다**(K-5). 링크는 `moimNotifyLink` | A |
| `app/api/admin/moim/members/[userId]/route.ts` | E10 · E16 · E4 · D4 | 한 파일 | A |
| `app/api/admin/moim/moims/[moimId]/route.ts` · `reports/[reportId]/review/route.ts` | D7·D15·D9 = E §3-7·§3-8 | 같은 변경 | A |
| `lib/admin/moim/moim-admin-route.server.ts` | D §1-1 번호표 · E §3-14 | D 표 하나 + Postgres 코드 매핑(E 표). `moim_unknown` → 500 은 둘 다 같다 | A |
| `lib/admin/moim/moim-admin-queries.server.ts` | D(D1·D2·D15·D17·D21·D25·신규1·신규3) · E §3-1(`openSame` 에 `moim_id`) | 제재 읽기는 표 대신 뷰 `moim_admin_sanction_rows_v`(리드 결정 1). `openSame` 수정을 같이 한다 | A |
| `lib/admin-community-messenger/moim-room-admin-guard.ts` | D5 · E §3-17 | **D 판**: 동작 6개(`block_room·unblock_room·archive_room·unarchive_room·readonly_on·readonly_off`), 코드 `moim_room_managed_by_moim`, 422, 새 키. E 의 「키 그대로」는 버린다 | A |
| `components/admin/chats/AdminChatActionSheet.tsx` | D 만(§1-1 `message` 칸 · D5 코드) | M 은 손대지 않는다 | A |
| `components/moim/manage/MoimManageMembers.tsx` | BC(C10·C13·C14·C22) · E §3-4(차단 목록 `byPlatform`) · E §3-12 | E §3-12 는 **뺀다**(K-6). `byPlatform` 이면 사유 대신 「운영팀이 차단했어요」, [차단 해제] 숨김 | U |
| `components/moim/MoimScheduleDetailScreen.tsx` | BC(R-A·C8·R-C) | C8 오류는 E 코드 `moim_schedule_request_not_found` 로 읽는다 | U |
| 문구 `lib/i18n/catalog/moim-core.ts` | A §6 · BC §5 의 `moim_err_*` · D §5 의 `moim_err_*` · E 의 `moim_err_*` | S 가 혼자 쓴다. 겹치는 키는 하나만: `moim_err_moim_closed` = 「종료된 모임이라 할 수 없어요 / This group has ended, so you can't do this」(사용자·어드민 둘 다 맞음) · `moim_err_moim_age_range_invalid` = BC 문장 · `moim_err_moim_image_url_invalid` = 「사진을 다시 올려 주세요 / Please upload the photo again」(BC `moim_err_moim_cover_invalid` 대체) · `moim_err_moim_schedule_request_not_found` = E §3-10 문장. A 의 `moim_room_managed_in_moim` 은 지운다 | S |
| 문구 `moim-screens.ts`·`moim-manage.ts` | BC §5 · E §3-4 「운영팀이 차단했어요」 키 | BC 의 `moim_schedule_request_already_handled` 는 만들지 않는다(K-7) | U |
| 문구 `admin-moim.ts`·`admin-community-messenger.ts` | D §5 + §0-10 의 빠진 기록 종류 키 | — | A |
| `lib/notifications/policy/notification-preference-policy-registry.ts` | E §3-3 | — | S |
| `lib/notifications/display/*`·`lib/community-messenger/notifications/*`·`group-room-pin-notify.ts` | A §4 | — | M |
| `lib/community-messenger/service.ts` (`resolveRoomProfileLite`) vs `lib/admin-community-messenger/service.ts` | A §5-1 / D5·D23 | 이름만 같고 다른 파일이다 | M / A |
| 계약 `docs/design/moim/moim-design-v1-2026-11-12.md` | E §3-3(§7 줄)·§3-15 · D §4-1(§8·P14) · BC R-K(P2 정렬·로그인) · 리드 결정 2(§7 이동 위치) | 한 사람이 한 번에 고친다. §7 `moim_report_result` 의 이동 「알림 상세」 → 「모임 활동 중·활동 모임 비멤버 = `/moim/{id}`, 종료 모임 비멤버·열람 끝·삭제 = 모임 탭(E §3-2 표)」. `moim_admin_info_updated` 행을 더한다 | S |
| `docs/dibay-messenger-domain-group-hard-lock.md` | A §1-3(표면 규칙·결정 1) · D §3-6(`room_status`) | 두 줄을 한 번에 | S |

---

## C. 결함 ID → 설계 절 (하나씩만)

- 112건 + Owner 결정 7건.
- 「SQL」 칸은 §A-3 에서 그 동작을 맡는 함수다.
- 겹쳐 설계됐던 것은 「정리」 칸에 버린 쪽을 적는다.

**A 메신저 모임 방 (25)**

| ID | 절 | SQL | 정리 |
|---|---|---|---|
| A1·A2·A3·A4·A5·A6·A7 | A §3 (각 ID) + §1 표면 규칙 | — | — |
| A8 | A §3 A8 | — | — |
| A9 | A §2-1 `homeOpen` | — | B25 = A9 |
| A10 | A §3 A10 | — | — |
| A11 · 신규2 | A §2-1 · §2-2 | — | — |
| A13 | A §2-2 | — | — |
| A14 | A §4-1 | — | — |
| A16 · 신규1 | A §3 A16 | — | — |
| A17 · 신규4 | A §3 A17 | — | — |
| A18 | A §5-2 | `moim__room_member_activate`·`moim_profile_update`·N6·R-7 | 마이그레이션은 하나로 합침 |
| A19 | A §5-1 | — | — |
| A20·A21·A22·A24 | A §3 (각 ID) | — | A20·A24 는 실제 화면이 확인 안 됨(가드·시안대로) |
| A23 | A §4-2 | — | — |

**B 사용자 모임 화면 (21)**

| ID | 절 | SQL | 정리 |
|---|---|---|---|
| B1 | BC R-B | `moim_post/comment/album_remove`(+리드 결정 3) | 서버 절반 = E8 |
| B2 | BC R-A | `moim_comment_create`·`moim_post_update` | — |
| B3·B4·B10·B11·B12·B18·B20·B21·B22·B24 | BC R-I | — | — |
| B5 | BC R-J | 없음 | E §3-16 은 같은 변경이라 버림 (= E7) |
| B7·B15·B17 | BC R-A | — | — |
| B8·B9 | BC R-C | — | — |
| B14 · 신규(배너 개수) | BC R-E | `moim_member_remove`·`moim_admin_member_remove`·`moim__activate_member` (S-6) | = E19 |
| B19 | BC R-F | — | — |

**C 운영 관리 화면 (21)**

| ID | 절 | SQL | 정리 |
|---|---|---|---|
| C1·C22 | BC R-D | — | — |
| C2 | BC R-E | — | — |
| C3·C10·C11·C14·C18·C19·C21 | BC R-I | — | — |
| C4 | BC R-F | N7 | — |
| C5 | BC R-H | `moim_host_transfer_request`·N3 | E #14·#15·§3-9 버림 (K-1) |
| C6·C9·C16 | BC R-A | — | B23 = C9 |
| C7 | BC R-A | — | — |
| C8 | BC R-I | `moim_schedule_decide` | 코드는 E #27 (K-7) |
| C12·C15 | BC R-F | C15 = `moim_board_upsert` | — |
| C13 | BC R-I | `moim_member_note_set` | E #25·§3-12 버림 (K-6) |
| C17 | BC R-I | `moim_update_info`·N1·N2 | BC S-5 코드 버림 (K-8) |

**D 어드민 (30)**

| ID | 절 | SQL | 정리 |
|---|---|---|---|
| D1·D2 | D §2 | 뷰 (리드 결정 1) | D §3-3 버림 (K-9) |
| D3 · 신규2 | D §2 (화면·라우트) | `moim_admin_report_decide` ②③ | = E2 · E #1 과 합침 |
| D4 | D §2 | `moim_admin_member_role`·`assign_host`·`host_request_decide` | — |
| D5 | D §2 | `cm_moim_guard_rooms` + R-6 | E #29·§3-17 합침 |
| D6 | D §2 | `moim_admin_policies_save` | = E #28 |
| D7 | D §2 | `moim_admin_update_info` | = E #21·§3-7 |
| D8·D12·D16·D18·D19·D21·D22·D24·D25·D26·D27 · 신규1 · 신규3 | D §2 (각 ID) | — | — |
| D9 | D §2 | `moim_admin_report_review` | = E #26·§3-8 |
| D10 | D §2 | `moim_admin_report_decide` ⑤ | — |
| D11 | D §2 | `moim_admin_content`·`sanction_revoke`·`member_unban`·`member_remove` | E #4·#10·#11 의 삭제 모임 규칙 버림 (K-3) |
| D13 | D §2 | `moim_admin_sanction_revoke`·`member_unban` | — |
| D14 | D §2 (문구 그대로) | — | E11 자동 닫기 없음 (K-5) |
| D15 | D §2 | — | — |
| D17 | D §2 | — | 기록 종류 키 보완 (§0-10) |
| D20 | D §2 | `moim_admin_policies_save` | — |
| D23 | D §2 | N5 (기록만) | — |

**E 서버·DB·알림 (15)**

| ID | 절 | SQL |
|---|---|---|
| E1 | E #1·#2·§2-1·§3-1 | `moim_admin_report_decide` ①·`moim_report_create`·인덱스·R-1 |
| E3 | E #3·#4·#6·§3-4 | `moim_bans.source`·R-4 |
| E4 | E §3-2 (+ 리드 결정 2) | 반환 키 |
| E5 | E §3-3 | — |
| E8 | E #7~#10 (+ 리드 결정 3) | — |
| E9 | E #24·§3-5 | — |
| E10 | E #5·#6·§3-6 | — |
| E11 | E #12 (D §3-4 로 바꿈 — K-5) | — |
| E12 | E #31·#13·#18·#20~#23 | — |
| E13 | E #9·#13 (+ C5 로 덮어쓰기 자체 제거) | — |
| E14 | E #17·R-5 | — |
| E16 | E §3-11 | — |
| E17 | E §3-13 (`moim-search-query.ts` 에) | — |
| E18 | E #16·#18·#19 + #1⑥·#11·#12④ | — |
| E20 | E #20~#22·§3-14 | — |

**Owner 결정 (7)**

| 결정 | 절 |
|---|---|
| A12 | A §0 결정 1 · §2-2 |
| B6 | BC R-G |
| B26 | BC R-K |
| D-충돌 | D §0 · D5 |
| E6 | E §3-3 |
| E15 | E §3-15 |
| E18 일부 | E #16(경고 허용) + D §4-1 P14 문장 |

- **고칠 곳이 없는 ID: 0건.**
- 「결함 아님」 5건(A15·A25·B13·B16·C20)은 고치지 않는다.
- 두 설계가 같이 다룬 것은 위 「정리」에서 하나로 정했다: B5·B14·C5·C8·C13·C17·D3·D5·D6·D7·D9·D11·D14·E8·E11.

---

## D. 작업자 4명 분할 (파일이 겹치지 않음) · 순서

### D-1. 계약 고정표 (S 가 1단계에 먼저 올리고, M·U·A 는 이것만 보고 짠다)

- **RPC 반환 키**: §A-3 의 「키 추가」 전부. 예: `created`·`changed`·`moim_status`·`retention_ended_at`·`reporter_member_ids`·`was_pending`·`changed:false`(역할)·`to_nickname`.
- **새 RPC 서명**: N3 `moim_host_transfer_cancel(p_actor, p_transfer)` · N5 `moim_admin_log_room_action(p_admin, p_room, p_type, p_target, p_reason)` · N7 `moim_board_reorder(p_actor, p_moim, p_board_ids uuid[])` · `moim_admin_report_review(p_admin, p_report, p_reason)`.
- **뷰 열**: §A-1. **오류 코드**: §A-5.
- **TS 서명**
  - `moimViewable(state, receiverIsActiveMember)` · `moimNotifyLink(state, isMember, intended, {result})` · `notifyMoimHostChanged(sb, moimId, toUserId, recipients, dedupeRef, opts)` (E §3-2·§3-11)
  - `guardMoimRead(req, { allowGuest?: true })`
  - `markMoimRoomOwnersStale()`(M 이 내보냄)
- **DTO 칸**: §B 의 `moim-api-types.ts` 줄. **문구 키**: `moim-core.ts` 전체(S).

### D-2. 파일 담당

| 작업자 | 맡는 파일 (이 밖은 손대지 않는다) |
|---|---|
| **S** (SQL·서버·알림 정책·공용 계약) | `supabase/migrations/20271128260000_moim_r5_full_fix.sql` · `docs/audit/moim-r5-backup-definitions-2026-11-28.sql` · `docs/audit/moim-r5-local-verify-scenarios-2026-11-28.sql` · `lib/moim/server/**`(queries·route-guard·rpc·notify·account-cleanup·staff-reports) · `lib/moim/moim-api-types.ts` · `lib/moim/moim-error-codes.ts` · 새 `lib/moim/moim-view-rule.ts` · `lib/moim/moim-search-query.ts` · `lib/notifications/policy/**` · `lib/i18n/catalog/moim-core.ts` · 계약 문서 · hard-lock 문서 · R4 설계 #14 정정 줄 · 이 파일들의 시험(정책 판정·`moimNotifyLink`·`moimSearchTerm`·RPC 오류 매핑·`guardMoimRead` 401·`listReceivedMoimInvites`·`listMoimBans`) |
| **M** (메신저) | `app/api/moim/rooms/route.ts` · `lib/moim/use-moim-room-owner.ts` · 새 `lib/moim/moim-room-surface-policy.ts` · `lib/auth/client-session-wipe.ts` · `lib/community-messenger/room/phase2/use-messenger-room-phase2-room-presentation.ts` · `components/community-messenger/room/phase2/CommunityMessengerRoomPhase2{RoomSheets,MemberActionModal,MessageTimeline,Header,Composer}.tsx` · `components/community-messenger/room/CommunityMessengerRoomPass1ComposerShell.tsx` · `components/community-messenger/MessengerChatListItem.tsx`·`MessengerChatRoomActionSheet.tsx` · `lib/messenger-policy/chat-room-swipe-actions.ts` · `components/moim/MoimRoomNoticeMenuItem.tsx` · `lib/community-messenger/service.ts`(`resolveRoomProfileLite` 만) · `lib/notifications/display/{load-message-notification-display-context,build-message-notification-display}.ts` · `lib/community-messenger/notifications/{messenger-in-app-banner-content,cm-participant-unread-full-effects}.ts` · `lib/community-messenger/group/group-room-pin-notify.ts` · A §7 시험 + 기존 `moim-r4-m.test.ts`·`moim-bundle4-messenger-room.test.ts` 고침. **SQL 없음**(A18 SQL 은 S) |
| **U** (모임 사용자·운영 관리) | `components/moim/**`(`MoimRoomNoticeMenuItem.tsx` 제외) · `components/moim/manage/**` · `components/common/media/DibayImageViewer.tsx` + 그 SSOT 시험 · `app/(main)/moim/my-content/page.tsx` · `app/api/moim/**`(`rooms/route.ts` 제외 — my-content·`invites/check`·boards PUT·host-transfers DELETE·invite·join·invites·join-requests·invite-links·notification-prefs·members·remove 포함) · `lib/moim/moim-client-api.ts` · 새 `lib/moim/moim-state-gate.ts` · 새 `lib/time/pht-input.ts` · `lib/auth/member-consent-mutation-policy.ts` · `lib/i18n/catalog/moim-screens.ts`·`moim-manage.ts` · BC 시험 |
| **A** (어드민) | `components/admin/moim/**` · `components/admin/chats/{AdminChatActionSheet,AdminChatSheets,AdminChatReportQueuePage}.tsx` · `components/admin/community-messenger/AdminCommunityMessengerDetailPage.tsx` · `components/admin/community/kit/CommunityAdminKit.tsx` · `lib/admin/moim/**`(contract·새 errors·route.server·queries.server·moim-room-ref.server) · `lib/admin-community-messenger/{moim-room-admin-guard,admin-chat-moderation-cas,service}.ts` · `app/api/admin/moim/**` · `lib/i18n/catalog/admin-moim.ts`·`admin-community-messenger.ts` · D §6 시험 |

- 겹침 확인
  - `lib/moim/` 최상위: S(api-types·error-codes·view-rule·search-query) / M(use-moim-room-owner·room-surface-policy) / U(client-api·state-gate) 로 파일마다 나뉜다.
  - `lib/i18n/catalog/`: S(moim-core) / U(moim-screens·moim-manage) / A(admin-moim·admin-community-messenger) 로 나뉜다.
  - `lib/moim/__tests__/`: 새 파일 이름이 작업자별로 다르다. 기존 파일 2개는 M 만 고친다.
- 작업 폴더: 같은 작업 브랜치 `fix/moim-r5-full-fix` 1개. 작업자별 worktree 로 나눠 고치고, 마지막에 한 브랜치로 합친다. **PR 은 1개**(한 작업 = 한 PR · 병합 1회).

### D-3. 순서

1. **S 1단계 — SQL 먼저**
   - Q0·Q14 정의 확인(운영 읽기 전용).
   - 마이그레이션 작성.
   - 로컬 PG17 에서 차례로 돌린다: R4 반영 DB → R5 적용 → S-01~S-54 → 회귀(R4 시나리오 파일 전부, 의도한 변경 칸만 다름) → 두 번 적용해도 같은지.
   - 로컬 지문 116 확인.
   - 이것이 통과하기 전에는 TS 를 병합 브랜치에 올리지 않는다.
2. **S 1단계 — 계약 고정표 파일 올리기**: 타입·코드·`moim-core` 키·`moimViewable`/`moimNotifyLink`/`notifyMoimHostChanged` 서명·`guardMoimRead` 서명.
3. **M · U · A 동시 진행** + S 는 나머지 서버 lib(queries·notify·rpc 매핑·정책)를 진행한다.
   - 10분 넘는 일은 백그라운드로 돌린다.
   - 의존: U → `markMoimRoomOwnersStale`(M), U·A → `moimNotifyLink`(S).
4. **합치기**: 최종 HEAD 에서 1회만 돌린다.
   - `typecheck:build` · `typecheck:test`
   - 바뀐 파일 vitest · 바뀐 파일 eslint
   - `check:i18n-quality` · `verify:routes`(새 `/moim/my-content`) · `verify:call-surface-cta-ssot`(통화 무변경 확인) · `verify:native-version-bump`
   - `test:ci` 1회
   - `git show HEAD:<file>` 로 커밋에 들어갔는지 확인. `"use client"` 파일이 서버 전용 모듈을 import 하지 않는지 확인.
5. **독립 재감사 → PR 만들기**(자동 병합 등록 안 함 — §E).
6. **DB 적용 승인 요청**
   - Q1~Q15 결과를 함께 낸다. R-6 이 필요한지, Q7·Q9·Q10·Q12 건수도 적는다.
   - 승인을 받으면 적용한다.
   - 적용 직후 보고: 지문(116·44개 이름) · 보정 행 수 · 백업 행 수 · 열 대조.
7. **DB 적용 확인 뒤에만 병합**한다 → 운영 배포 1회.

---

## E. 남은 위험 · 배포 구분

- **배포 구분: 웹 + 운영 DB**(마이그레이션 1개). 네이티브 변경 없음 → 배포 뒤 앱 재시작만. 보고 첫 줄은 `npm run verify:native-version-bump` 의 `[배포 구분]` 으로 쓴다.
- **PR 은 DB 적용 전에 자동 병합할 수 없다.** 개발 프로세스 1번 예외(「운영 DB 적용이 먼저 필요한 변경」)에 해당한다.
  - 웹이 먼저 나가면 다음이 실패한다: 순서 저장(N7) · 위임 취소(N3) · 숨김 콘텐츠 삭제 · 「검토 시작」(새 인자) · 제재 뷰 읽기(뷰 없음 → 어드민 제재 탭 오류).
  - 또 이 PR 은 메신저 방 화면·메시지 알림 표시를 바꾼다. 그래서 채팅 PR 규칙(독립 감사·보고 → Owner 병합 지시 뒤 병합)도 적용된다.
- **DB 먼저 ~ 웹 반영 사이 (옛 웹 + 새 DB)**: 몇 분, 아래 정도로 끝난다.
  - 「검토 시작」 버튼이 사유 없음으로 실패한다(E #26).
  - 새 오류 코드(`moim_closed` 등)가 옛 문구표에 없다 → 일반 실패 문구로 보인다.
  - 위임 재요청이 「이미 처리 중인 요청」으로 거부된다(기존 키 있음).
- **되돌리기**: E §6-4 그대로. 더할 것:
  - 새 함수 7개를 drop 한다.
  - 뷰를 drop 한다(옛 웹은 안 읽음).
  - R-6·R-7 은 백업 표로 되돌린다.
  - 웹 Instant Rollback 뒤에는 「검토 시작」 실패가 남는다(어드민 1버튼).

**남은 위험**

1. **A §2-1·§2-2 결정 1**
   - `/api/moim/rooms` 가 오류(503)를 내는 동안에는 **일반 비공개 그룹방에서도** 메신저 관리 UI 가 숨는다.
   - `/api/moim/rooms` 요청 수가 늘어난다. 예상 숫자는 없고, 병합 7일 뒤 실측한다. 예산값은 그대로 둔다.
2. **A §4-1 알림 표시**
   - 방 행 조회에 묶음 조회를 넣는다. 문자열이 틀리면 모든 메시지 알림 방 이름이 대체 이름으로 바뀐다. 시험으로 select 문자열을 고정한다.
   - 통화 푸시 경로는 바꾸지 않는다. 통화 규정 적용 대상 아님 — 호출처 2곳(`notify-message-pipeline.ts`·`persistence-consumer.ts`)만.
3. **BC R-C 공용 사진 뷰어** 변경은 메신저·상품·매장 화면에도 배포된다. 선택 속성만 더한다. 시트·뷰어 겹침과 ◁ 2단은 Android·iPhone 실기에서 NOT_PROVEN.
4. **BC R-G 로그인 필수**: 비로그인이 모임 API 6개를 부르면 401. 화면 변화는 없다고 판단한다(코드 근거). 실기 NOT_PROVEN.
5. **리드 결정 1 뷰**
   - Q9 로 연결 안 되는 옛 이용 제한 행은 `unlinked` 로 남는다. 지금 `ends_at` 기준 상태를 보여서 실제 해제를 따라가지 못한다. 건수는 미조회.
   - 뷰는 `now()` 를 쓴다. 상태 필터는 어드민 경로라 행 수가 작다.
6. **E8**: 예전 사진 본인 삭제는 기록이 없다. 그래서 어드민 undelete 를 막지 못한다(E §6).
7. **R-1**: 이미 보낸 「다른 모임 이름」 결과 알림은 되돌릴 수 없다. 건수만 보고한다.
8. **R-6** 이 필요하면 운영 값을 바꾼다 → 승인 요청에 행 목록을 붙인다(K-10).
9. **K-1**: 미접속 요청이 진행 중이면 모임장은 직접 위임을 보낼 수 없다(이유 문구 있음).
10. **K-5**: 직접 제재에 신고를 연결해도 신고는 열린 채 남는다. 신고자 알림은 「모임 신고 처리」에서만 나간다(D14 문구가 그렇게 안내).
11. **K-3**: 삭제 모임에서는 어드민도 숨김·삭제를 못 한다. 증거 정리가 필요하면 먼저 복구해야 한다.
12. **D23**: 메신저 메시지 숨김과 모임 운영기록이 한 트랜잭션이 아니다 → 드물게 기록이 빠진다.
13. **E12**: http 주소를 보내는 업로드 경로가 있으면 저장이 실패한다(Q7·grep 으로 미리 확인).
14. **B24 PHT 입력**: 기기 시간대가 한국인 iPhone 실기 NOT_PROVEN.
15. **E17**: 이모지·기호로는 검색할 수 없다.

**이 계획 단계의 NOT_PROVEN**

- 운영 DB 정의 = 저장소(감사 문서 근거만, 이 작업에서 재확인 안 함).
- Q0~Q15 운영 건수(미조회).
- 지문 116(계산값, 미실행).
- 로컬 PG17 결과(미실행).
- 모든 화면·실기기 결과.

**범위 밖(고치지 않음 · 보고만 — 설계들이 적은 것)**

- A §9 1~4
- BC §6: 이용 제한 계정의 자기 글 삭제가 막힘 · 위임 거절에도 약관을 요구함
- D §8-6: 회원 상세 링크 권한
- E §7: 같은 대상 신고 이력에 다른 모임 신고가 섞임 · 차단 모임 어드민 지정 허용
