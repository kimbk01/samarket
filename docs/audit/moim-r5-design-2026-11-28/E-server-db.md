# 모임 R5 — 서버·DB·알림 수정 설계 (E 묶음 + 다른 묶음의 서버 쪽 절반) — 2026-11-28

- 이 문서는 **설계**다. 저장소 파일·운영 DB·기기는 건드리지 않았다(읽기만).
- 기준 코드: `samarket-wt-moim-r4` = 운영 main `eac581f07`. DB 기준 = `supabase/migrations/*moim*` 의 함수별 마지막 정의(감사 문서가 「운영 = 저장소」로 대조 완료라 적음. **이 설계 작성자는 운영 DB 를 다시 보지 않았다 → 적용 직전 `pg_get_functiondef` md5 재대조 필요**).
- 대상 결함: 감사 `docs/audit/moim-full-defect-audit-2026-11-28.md` §6 E 15건 + §1 E1, 그리고 D3·D5(트리거)·D6·D7·D9·D11·C5·C8·C13·C17·B5 의 서버 쪽 절반(근거 줄은 `…-raw.md`).
- Owner 가 정한 것(이 설계는 그대로 따름):
  - E6 어드민 정보 수정 알림 = 끌 수 없음(D-22 와 같게)
  - E15 비노출(unlist) 기간이 **저절로 끝날 때는 알리지 않음** — 계약 §7 에 적는다
  - E18 경고(warned) 모임에서도 어드민 모임장 지정·미접속 요청 승인 **허용**
  - D-36 확장: 작성자 본인 삭제는 글·댓글·사진이 **숨김(hidden)** 이어도 된다(어드민이 삭제한 것은 아님), 나간 뒤에도
  - E3 플랫폼 어드민이 건 모임 차단은 **어드민만 해제**, 어드민 차단 사유는 모임 운영진에게 **돌려주지 않음**
- 배포 구분(예상): **웹 + 운영 DB**(마이그레이션 1개). 네이티브 변경 없음 → 앱 재시작만. 통화 코드(`call*`·`lib/push/**` 통화 발송) 손대지 않음.
- 순서: DB 적용(Owner 「DB 적용 승인」) → 웹 PR 병합. DB 가 먼저 나가도 지금 웹이 깨지지 않게 만든다(반환값은 키 추가만, 함수 서명 변경은 1개 — §2-2 #26 참고).

---

## 0. 작업자 잘못 먼저

- 이 설계 작성 중 작업자가 만든 문제: 없음(읽기만 함).
- 앞선 R1~R4 설계·감사가 놓친 것으로 이번에 새로 확인한 것(감사 목록에 없던 것, **범위 밖이라 고치지 않고 적기만** 하는 것은 §7):
  - E1 은 함수 2개만이 아니다. 신고 중복 **고유 인덱스** `moim_reports_open_dedupe_uidx (reporter_id, target_type, target_id)` 에도 `moim_id` 가 없다 → 함수만 고치면 다른 모임에서 같은 사람 신고가 인덱스에서 막힌다. 인덱스도 바꾼다(§2-1).
  - E1 은 어드민 화면의 「같은 대상 열린 신고 N건」 수(`moim-admin-queries.server.ts:603-607`)도 모임 조건이 없어 닫히는 범위와 같은 잘못된 수를 보여 준다 → 같이 고친다(§3-1).
  - E8 을 고치면 새 회귀가 생긴다: 숨긴 글을 작성자가 지운 뒤 어드민이 「삭제 취소(undelete)」하면 `active` 로 돌아와 **숨김이 풀린다**. 같은 단계에서 막는다(§2-2 #10).

---

## 1. 결함 → 고치는 곳 한눈표

| 번호 | 결함(요약) | DB 함수/구조 | TS(웹 서버·알림) |
|---|---|---|---|
| E1 | 같은 대상 닫기·신고 중복 검사가 모임 무관 | `moim_admin_report_decide` · `moim_report_create` · 인덱스 교체 · 잘못 닫힌 신고 되살림 | 어드민 「같은 대상 열린 신고 수」 쿼리 |
| E3 | 부모임장이 어드민 차단을 풂 · 어드민 사유 노출 | `moim_bans.source` 열 · `moim_member_unban` · `moim_admin_member_remove` · `moim_admin_member_unban` | `listMoimBans` 사유 숨김·`byPlatform` |
| E4 | 알림 이동 위치가 열리지 않는 곳 | 반환값에 모임 상태 추가(5개 함수) | `moimNotifyLink()` 규칙 1개로 모든 발송 |
| E5 | 신고 결과 알림이 푸시·끌 수 있음 | — | 벨 전용 + 필수 |
| E6 | 어드민 정보 수정 알림 끌 수 있음 | — | 필수 |
| E8 | 숨겨진 내 글·댓글·사진 못 지움 | `moim_post_remove` · `moim_comment_remove` · `moim_album_remove` · `moim_admin_content`(undelete 막기) | — |
| E9 | 같은 역할 재저장도 기록·알림 | `moim_member_role_set` | 역할 라우트 `changed` 확인 |
| E10 | 신청자 내보내기·차단 결과 알림 없음 | `moim_member_remove` · `moim_admin_member_remove` 가 `was_pending` | `moim_join_rejected` 발송 |
| E11 | 직접 제재에 이미 처리된 신고 연결 | `moim_admin_sanction_apply` | 신고자 결과 알림 |
| E12 | 표지·멤버 사진 주소 검사 없음 | 새 `moim__assert_image_url` + 5개 함수 | — |
| E13 | 운영 기록 누락 3곳 | `moim_album_remove` · `moim_invite_respond` · `moim_host_transfer_request` | — |
| E14 | 시작한 일정 호스트가 나가도 유지 | `moim__release_member` + 데이터 보정 | — |
| E15 | 비노출 만료 알림 | 변경 없음 | 계약 §7 문장 |
| E16 | 모임장 변경 알림 이름 빈칸 | — | `notifyMoimHostChanged()` 1개로 4곳 |
| E17 | 동네 모임 검색어 정리 약함 | — | `moimSearchTerm()` |
| E18 | 상태별 빈틈 | `moim_schedule_leave` · `moim_profile_update` · `moim_host_inactive_request` · 제재 알림 대상 | — |
| E20 | DB 제약 위반이 `moim_unknown` 400 | 입력 형식 사전 검사(정보 수정 3곳) | RPC 오류 코드 매핑 + 모르는 오류 500 |
| D3·신규2 | 신고 처리가 같은 제재 중복 생성·재알림 | `moim_admin_report_decide` + 중복 행 정리 | 「새로 만든 것」만 알림 |
| D5(트리거) | 메신저 어드민이 모임 방 차단·보관 | `cm_moim_guard_rooms` 에 `room_status` | `moim-room-admin-guard.ts` 동작 3개 추가 |
| D6 | 신고 사유 전부 끄기 저장됨 | `moim_admin_policies_save` | — |
| D7 | 어드민 동네 자유 문자열 | `moim_admin_update_info` 형식 검사 | 라우트가 LGU 목록으로 확인 |
| D9 | 「검토 시작」 사유 없음 | `moim_admin_report_review` 에 `p_reason` | 리뷰 라우트·폼 사유 |
| D11 | 삭제 모임 제재 해제·숨김 해제·차단 해제 | `moim_admin_sanction_revoke` · `moim_admin_content` · `moim_admin_member_unban` | — |
| C5 | 보낸 위임 요청 안 보임·재요청이 미접속 요청까지 취소·취소 없음 | `moim_host_transfer_request` · 새 `moim_host_transfer_cancel` | 보낸 요청 조회·취소 라우트 |
| C8 | 일정 신청 처리됨 → 「가입 신청을 찾을 수 없어요」 | `moim_schedule_decide` 새 코드 | 오류 문구 키 |
| C13 | 메모 권한 세 곳 다름 | `moim_member_note_set` 자기 자신 거부 | 멤버 탭 표시 규칙 |
| C17 | 정보 수정 사진 주소·출생 연도 검사 없음 | `moim_update_info` · `moim_admin_update_info` · `moim_create` | — |
| B5 | 초대 거절도 휴대폰 인증·약관 | — | 초대 응답 라우트 |

---

## 2. 마이그레이션 `20271128260000_moim_r5_full_fix.sql`

공통 규칙(AGENTS.md · R4 와 같음):
- 함수 본문은 **ASCII 만**. 한국어가 필요하면 `U&'\XXXX'`(이번 설계에는 한국어 문자열 없음 — 문구는 모두 TS 키).
- 모든 새·바뀐 함수: `security definer`, `set search_path to 'public'`, `revoke all … from public, anon, authenticated; grant execute … to service_role;`.
- 반환 JSON 은 **키 추가만**(지금 웹이 읽는 키는 그대로) → DB 가 먼저 나가도 지금 웹이 동작한다.
- 새 오류 코드(SQL 이 내는 것 — `lib/moim/moim-error-codes.ts` `MOIM_ERROR_CODES` 와 문구 키 `moim_err_*` ko·en 에 같은 PR 로 추가, 계약 시험이 SQL ↔ 목록을 대조):
  `moim_ban_admin_only` · `moim_content_author_deleted` · `moim_image_url_invalid` · `moim_age_range_invalid` · `moim_region_invalid` · `moim_schedule_request_not_found` · `moim_policy_report_reason_none_active`
  (TS 라우트 전용: `moim_invalid_input` → `MOIM_ROUTE_ERROR_CODES`)

### 2-0. 백업 표 (데이터 보정 전, 같은 트랜잭션 맨 앞)

```sql
create table if not exists public.moim_r5_backup_20271128 (
  tbl text not null, row_id uuid not null, row_data jsonb not null,
  backed_up_at timestamptz not null default now(), primary key (tbl, row_id));
alter table public.moim_r5_backup_20271128 enable row level security;
revoke all on table public.moim_r5_backup_20271128 from public, anon, authenticated;
grant all on table public.moim_r5_backup_20271128 to service_role;
-- each repair step below inserts to_jsonb(old row) before it updates (on conflict do nothing)
```
삭제 기한: 2026-12-28(다른 백업 표와 같은 30일). 보고서에 기한을 적는다.

### 2-1. 구조 변경

```sql
-- E1: open-report dedupe is per moim
create unique index if not exists moim_reports_open_dedupe_moim_uidx
  on public.moim_reports (reporter_id, moim_id, target_type, target_id) where status in ('received', 'reviewing');
drop index if exists public.moim_reports_open_dedupe_uidx;
-- (create new first, then drop old: no window without a dedupe index)

-- E3: who placed the ban
alter table public.moim_bans add column if not exists source text not null default 'moim';
alter table public.moim_bans drop constraint if exists moim_bans_source_check;
alter table public.moim_bans add constraint moim_bans_source_check check (source in ('moim', 'admin'));
```
- `moim_reports` 행 수가 적어(모임 신규 기능) 인덱스 생성 잠금은 짧다. 기존 행 중 새 인덱스와 충돌할 수 있는 경우는 없다(새 인덱스가 옛 인덱스보다 느슨함).
- 새 CHECK·NOT NULL 은 기본값으로 채워져 바로 유효하다.

### 2-2. 함수 변경 (기존 29개 바꿈 · 3개 새로 · 그중 1개 서명 교체)

> 아래 「핵심 줄」은 바뀌는 줄만 적은 윤곽이다. 나머지 본문은 현재 정의 그대로 둔다.

**#1 `moim_admin_report_decide`** (E1 · D3 · 신규2 · E4 · E18)
```sql
-- E1: close only the same moim's open reports on the same target
     where id = p_report
        or (v_close and moim_id = v_r.moim_id and target_type = v_r.target_type
            and target_id = v_r.target_id and status in ('received', 'reviewing'))
-- D3: reuse an active same-level moim sanction instead of inserting a second one
  if v_level is not null then
    select s.id into v_sid from public.moim_sanctions s
     where s.moim_id = v_r.moim_id and s.target_kind = 'moim' and s.level = v_level
       and s.revoked_at is null and s.starts_at <= now() and (s.ends_at is null or s.ends_at > now())
     order by s.created_at limit 1;
    v_created := v_sid is null;
    if v_created then insert ... returning id into v_sid; end if;
    v_state := public.moim__platform_refresh(v_r.moim_id);
    v_actions := v_actions || jsonb_build_object('kind', 'moim_' || v_level, 'sanction_id', v_sid,
                                                 'platform_state', v_state, 'created', v_created);
  end if;
-- new2: content_hide row only when the content actually changed now
  if v_hide then
    ... (hide updates unchanged, sets v_changed)
    if v_changed then
      insert into public.moim_sanctions (... 'content_hide' ...) returning id into v_sid;
    else
      select s.id into v_sid from public.moim_sanctions s
       where s.target_kind = 'content' and s.target_id = v_r.target_id and s.level = 'content_hide'
         and s.revoked_at is null order by s.created_at desc limit 1;   -- may stay null
    end if;
    v_actions := v_actions || jsonb_build_object('kind', 'content_hide', 'sanction_id', v_sid, 'changed', v_changed);
  end if;
-- E18: a closed moim gets no sanction notices
    'moim_notify_user_ids', case when v_m.status <> 'active' then '[]'::jsonb
                                 when v_level = 'block' then public.moim__active_member_ids(v_r.moim_id)
                                 when v_level is not null then jsonb_build_array(v_m.host_user_id) else '[]'::jsonb end,
-- E4: receiver state for links (added keys only)
    'moim_status', v_m.status, 'retention_ended_at', v_m.retention_ended_at,
    'reporter_member_ids', (select coalesce(jsonb_agg(mm.user_id), '[]'::jsonb) from public.moim_members mm
                             where mm.moim_id = v_r.moim_id and mm.status = 'active'
                               and mm.user_id in (select jsonb_array_elements_text(v_reporters)::uuid)),
```
- `v_first_sanction` 이 null 일 수 있다(이미 숨겨졌고 숨김 제재 기록도 없는 경우) → `moim_reports.action_id` null 로 닫힘. 지금도 「기각」은 null 이라 화면이 처리한다.
- 이용 제한(`user_restrict`)은 이미 `admin_apply_community_sanction` 의 `duplicate` 로 걸러져 있다. 단 `moim_sanctions` 행은 중복이어도 지금처럼 넣는다 → **같이 고친다**: `duplicate = true` 면 `moim_sanctions` 행을 넣지 않고 `sanction_id` = 같은 사용자의 활성 `user_restrict` 행(없으면 null).

**#2 `moim_report_create`** (E1)
```sql
  if exists (select 1 from public.moim_reports
              where reporter_id = p_actor and moim_id = p_moim and target_type = v_type
                and target_id = v_target and status in ('received', 'reviewing')) then
    perform public.moim__fail('moim_report_duplicate');
  end if;
  begin
    insert into public.moim_reports ... ;
  exception when unique_violation then
    perform public.moim__fail('moim_report_duplicate');   -- concurrent double tap
  end;
```

**#3 `moim_member_unban`** (E3)
```sql
  update public.moim_bans set released_at = now(), released_by = p_actor
   where moim_id = p_moim and user_id = p_target and released_at is null and source = 'moim'
  returning id into v_id;
  if v_id is null then
    if exists (select 1 from public.moim_bans where moim_id = p_moim and user_id = p_target
                and released_at is null and source = 'admin') then
      perform public.moim__fail('moim_ban_admin_only');
    end if;
    perform public.moim__fail('moim_ban_not_found');
  end if;
```

**#4 `moim_admin_member_unban`** (E3 · D11)
```sql
  if not exists (select 1 from public.moims where id = p_moim and status <> 'deleted') then
    perform public.moim__fail('moim_not_found');
  end if;
  ... (unban both sources, unchanged)
  return jsonb_build_object('ok', true, 'moim_status', v_status, 'retention_ended_at', v_ret);  -- E4
```

**#5 `moim_member_remove`** (E3 · E10 · E4)
```sql
  -- E3: existing admin ban stays admin (insert-where-not-exists already keeps it); nothing else changes
  -- E10 / E4 added keys:
  return jsonb_build_object('ok', true,
    'was_active', coalesce(v_found and v_target.status = 'active', false),
    'was_pending', coalesce(v_found and v_target.status = 'pending', false),
    'moim_status', (select status from public.moims where id = p_moim),
    'retention_ended_at', (select retention_ended_at from public.moims where id = p_moim));
```

**#6 `moim_admin_member_remove`** (E3 · E10 · E4)
```sql
  if p_ban then
    insert into public.moim_bans (moim_id, user_id, banned_by, reason, source)
    select p_moim, p_user, p_admin, v_reason, 'admin'
     where not exists (select 1 from public.moim_bans where moim_id = p_moim and user_id = p_user and released_at is null);
    -- staff ban already open: the admin takes it over (only an admin can lift it now)
    update public.moim_bans set source = 'admin', banned_by = p_admin, reason = v_reason
     where moim_id = p_moim and user_id = p_user and released_at is null and source = 'moim';
  end if;
  return ... || jsonb_build_object('was_pending', ..., 'moim_status', ..., 'retention_ended_at', ...);
```

**#7 `moim_post_remove`** (E8)
```sql
  select * into v_po from public.moim_posts where id = p_post for update;
  if not found or v_po.status = 'deleted' then perform public.moim__fail('moim_post_not_found'); end if;
  if v_po.author_id = p_actor then          -- active or hidden: the author may delete (D-36, also after leaving)
    update public.moim_posts set status = 'deleted', is_pinned = false, updated_at = now() where id = p_post;
    perform public.moim__log(v_po.moim_id, p_actor, 'user', 'post_deleted', p_post,
                             jsonb_build_object('from', v_po.status));
    return jsonb_build_object('ok', true, 'result', 'deleted');
  end if;
  if v_po.status <> 'active' then perform public.moim__fail('moim_post_not_found'); end if;   -- staff hide: active only
```
- 「어드민이 삭제한 것」은 이미 `deleted` 라 작성자도 못 건드린다(첫 줄).

**#8 `moim_comment_remove`** (E8)
```sql
  if not found or v_c.status = 'deleted' then perform public.moim__fail('moim_comment_not_found'); end if;
  if v_c.author_id is distinct from p_actor then
    if v_c.status <> 'active' then perform public.moim__fail('moim_comment_not_found'); end if;
    if not public.moim_actor_can(v_c.moim_id, p_actor, 'hide_post') then perform public.moim__fail('moim_forbidden'); end if;
  end if;
  update ... set status = case when v_c.author_id = p_actor then 'deleted' else 'hidden' end ...;
  if v_c.status = 'active' then              -- a hidden comment was already subtracted
    update public.moim_posts set comment_count = greatest(comment_count - 1, 0) where id = v_c.post_id;
  end if;
```

**#9 `moim_album_remove`** (E8 · E13)
```sql
  if not found or v_i.status = 'deleted' then perform public.moim__fail('moim_album_not_found'); end if;
  if v_i.uploader_id = p_actor then
    update public.moim_album_items set status = 'deleted', is_pinned = false where id = p_item;
    perform public.moim__log(v_i.moim_id, p_actor, 'user', 'album_deleted', p_item,
                             jsonb_build_object('from', v_i.status));          -- E13
    return jsonb_build_object('ok', true, 'result', 'deleted');
  end if;
  if v_i.status <> 'active' then perform public.moim__fail('moim_album_not_found'); end if;
```

**#10 `moim_admin_content`** (E8 회귀 막기 · D11)
```sql
  -- D11: no restore/undelete inside a deleted moim (hide/delete stay allowed for evidence handling)
  if p_action in ('restore', 'undelete')
     and (select status from public.moims where id = v_moim) = 'deleted' then
    perform public.moim__fail('moim_not_found');
  end if;
  -- E8: an author's own delete is not undone by an admin
  if p_action = 'undelete' and coalesce((
       select e.actor_kind = 'user' from public.moim_events e
        where e.moim_id = v_moim and e.target_id = p_id
          and e.type in ('post_deleted', 'comment_deleted', 'album_deleted', 'admin_' || p_type || '_delete')
        order by e.created_at desc limit 1), false) then
    perform public.moim__fail('moim_content_author_deleted');
  end if;
```
- 사진 본인 삭제는 지금까지 기록이 없었다(E13) → 옛 사진 본인 삭제는 「작성자 삭제」로 판정 못 함 → 그 행은 지금처럼 undelete 가 된다(남는 위험 §6).

**#11 `moim_admin_sanction_revoke`** (D11)
```sql
  select platform_state, status into v_before, v_mstatus from public.moims where id = v_s.moim_id;
  if v_mstatus = 'deleted' then perform public.moim__fail('moim_not_found'); end if;
  ...
  'notify_user_ids', case when v_mstatus <> 'active' then '[]'::jsonb when ... (as now) end,   -- E18 closed
```

**#12 `moim_admin_sanction_apply`** (E11 · E18)
```sql
  if p_report is not null then
    select * into v_rep from public.moim_reports where id = p_report and moim_id = p_moim for update;
    if not found then perform public.moim__fail('moim_report_not_found'); end if;
    if v_rep.status not in ('received', 'reviewing') then perform public.moim__fail('moim_conflict'); end if;
  end if;
  insert into public.moim_sanctions (...) returning id into v_id;
  if p_report is not null then   -- a linked report is the report this sanction answers (D-18)
    update public.moim_reports set status = 'actioned', action_id = v_id, handled_by = p_admin, handled_at = now()
     where id = p_report;
  end if;
  return ... || jsonb_build_object(
    'notify_user_ids', case when v_m.status <> 'active' then '[]'::jsonb when p_level = 'block' then ... end,
    'report_reporter_id', v_rep.reporter_id, 'moim_status', v_m.status, 'retention_ended_at', v_m.retention_ended_at,
    'reporter_is_member', exists (select 1 from public.moim_members where moim_id = p_moim and user_id = v_rep.reporter_id and status = 'active'));
```
- 연결된 신고를 「조치」로 닫는 것은 규정·설계로 정했다: D-18 「처리 전 신고를 골라 연결」 = 그 신고의 처리다. 열어 두면 같은 신고를 다시 처리해 D3 중복이 또 생긴다.

**#13 `moim_invite_respond`** (E13 · E12)
```sql
  if not p_accept then
    update public.moim_invite_targets set status = 'declined', responded_at = now() where id = p_invite_target;
    perform public.moim__log(v_t.moim_id, p_actor, 'user', 'invite_declined', p_invite_target, '{}'::jsonb);   -- E13
    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;
  perform public.moim__assert_image_url(nullif(p->>'avatar_url', ''));   -- E12 (only the value the user sent)
```

**#14 `moim_host_transfer_request`** (C5 · E13)
```sql
  select * into v_open from public.moim_host_transfers where moim_id = p_moim and status = 'requested' for update;
  if found then
    if v_open.kind <> 'direct' then perform public.moim__fail('moim_transfer_pending'); end if;  -- never cancel an inactive request silently
    update public.moim_host_transfers set status = 'cancelled', decided_at = now() where id = v_open.id;
    perform public.moim__log(p_moim, p_actor, 'user', 'host_transfer_cancelled', v_open.to_user_id,
                             jsonb_build_object('transfer_id', v_open.id, 'replaced', true));        -- E13
  end if;
  insert ... returning id into v_id;
  return jsonb_build_object('ok', true, 'transfer_id', v_id, 'replaced_transfer_id', v_open.id);
```

**#15 새 `moim_host_transfer_cancel(p_actor uuid, p_moim uuid)`** (C5)
```sql
  update public.moim_host_transfers set status = 'cancelled', decided_at = now()
   where moim_id = p_moim and status = 'requested' and kind = 'direct' and from_user_id = p_actor
  returning id, to_user_id into v_id, v_to;
  if v_id is null then perform public.moim__fail('moim_transfer_not_found'); end if;
  perform public.moim__log(p_moim, p_actor, 'user', 'host_transfer_cancelled', v_to, jsonb_build_object('transfer_id', v_id));
  return jsonb_build_object('ok', true, 'transfer_id', v_id);
```
- 모임장 권한 확인은 `from_user_id = p_actor` 로 충분하다(보낸 사람만 취소). 모임이 차단·종료여도 취소는 된다(물러나는 동작).

**#16 `moim_host_inactive_request`** (E18)
```sql
  if not found or v_m.status <> 'active' then perform public.moim__fail('moim_not_found'); end if;
  if v_m.platform_state = 'blocked' then perform public.moim__fail('moim_blocked'); end if;
  -- warned stays allowed (Owner E18)
```

**#17 `moim__release_member`** (E14)
```sql
  for v_s in
    select * from public.moim_schedules
     where moim_id = p_moim and host_user_id = p_user and status in ('recruiting', 'full', 'closed')
       -- removed: and starts_at > now()   (a started but unfinished schedule also needs a present host)
     for update
  loop ... (unchanged body)
```
- 참여 취소(`moim__deactivate_member` 의 시작 전 일정만 취소)는 그대로 — 시작한 일정의 참여 기록은 남긴다.

**#18 `moim_profile_update`** (E18 · E12)
```sql
  if not exists (select 1 from public.moims where id = p_moim and status = 'active') then
    perform public.moim__fail('moim_not_found');
  end if;
  if (select platform_state from public.moims where id = p_moim) = 'blocked' then perform public.moim__fail('moim_blocked'); end if;
  if p ? 'avatar_url' then perform public.moim__assert_image_url(nullif(p->>'avatar_url', '')); end if;
```

**#19 `moim_schedule_leave`** (E18 — 차단 모임에서도 참여 취소)
```sql
  select s.*, m.status as moim_status into v_s
    from public.moim_schedules s join public.moims m on m.id = s.moim_id where s.id = p_schedule for update of s;
  if not found or v_s.moim_status <> 'active' then perform public.moim__fail('moim_schedule_not_found'); end if;
  if v_s.status in ('done', 'cancelled') then perform public.moim__fail('moim_schedule_finished'); end if;
  if v_s.starts_at <= now() then perform public.moim__fail('moim_schedule_started'); end if;
  -- no blocked check: leaving is a retreat action (same as moim_leave)
```
- 차단 모임 일정 방은 잠겨 있지만 `moim__room_member_deactivate` 는 `moim__writer_on` 으로 쓴다 → 방 나감도 된다.

**#20 `moim_update_info`** (E12 · C17 · E20)
```sql
  if p ? 'capacity' and coalesce(p->>'capacity', '') !~ '^([0-9]{1,6})?$' then perform public.moim__fail('moim_capacity_invalid'); end if;
  if p ? 'category_id' and coalesce(p->>'category_id', '') !~* '^([0-9a-f-]{36})?$' then perform public.moim__fail('moim_category_invalid'); end if;
  if (p ? 'age_min_birth_year' and coalesce(p->>'age_min_birth_year', '') !~ '^([0-9]{4})?$')
     or (p ? 'age_max_birth_year' and coalesce(p->>'age_max_birth_year', '') !~ '^([0-9]{4})?$') then
    perform public.moim__fail('moim_age_range_invalid');
  end if;
  v_min := case when p ? 'age_min_birth_year' then nullif(p->>'age_min_birth_year', '')::int else v_m.age_min_birth_year end;
  v_max := ... same for max ...;
  perform public.moim__assert_birth_years(v_min, v_max);
  if p ? 'cover_image_url' then perform public.moim__assert_image_url(nullif(p->>'cover_image_url', '')); end if;
  ... update uses v_min / v_max
```

**#21 `moim_admin_update_info`** (E12 · C17 · D7) — #20 과 같은 검사 + 동네:
```sql
  if p ? 'lgu_id' and btrim(coalesce(p->>'lgu_id', '')) !~ '^[0-9A-Za-z:_-]{2,40}$' then
    perform public.moim__fail('moim_region_invalid');      -- same form as moim_create
  end if;
```
- 실제 LGU 목록 확인은 TS 라우트(§3-7)가 한다. DB 에는 LGU 목록 표가 없다(목록은 `lib/neighborhood` 코드 단일 정의).
- 반환에 `'moim_status', v_m.status, 'retention_ended_at', v_m.retention_ended_at` 추가(E4).

**#22 `moim_create`** (E12 · C17)
```sql
  perform public.moim__assert_image_url(nullif(p->>'cover_image_url', ''));
  perform public.moim__assert_image_url(nullif(p->>'avatar_url', ''));
  -- same regex pre-checks as #20 for capacity / birth years, then:
  perform public.moim__assert_birth_years(nullif(p->>'age_min_birth_year', '')::int, nullif(p->>'age_max_birth_year', '')::int);
```

**#23 `moim_join`** (E12)
```sql
  perform public.moim__assert_image_url(nullif(p->>'avatar_url', ''));
```

**#24 `moim_member_role_set`** (E9)
```sql
  if v_cur = p_role then return jsonb_build_object('ok', true, 'changed', false); end if;   -- before limits, no log
  ...
  return jsonb_build_object('ok', true, 'changed', true);
```
- 어드민 쪽 `moim_admin_member_role` 은 이미 `changed:false` 를 돌려주고 라우트도 확인한다(변경 없음).

**#25 `moim_member_note_set`** (C13)
```sql
  if p_actor = p_target then perform public.moim__fail('moim_cannot_target_self'); end if;
```
- 서버 규칙 하나로 맞춘다: 「메모 권한(`write_note`)이 있으면 **자기 자신을 뺀** 이 모임 기록이 있는 모든 사람(역할·상태 무관)」. 멤버 탭·메모 탭이 이 규칙을 따른다(§3-12).

**#26 `moim_admin_report_review`** (D9 — 서명 교체)
```sql
drop function if exists public.moim_admin_report_review(uuid, uuid);
create or replace function public.moim_admin_report_review(p_admin uuid, p_report uuid, p_reason text default null) ...
  v_reason text := public.moim__admin_reason(p_reason);    -- required
  ...
  perform public.moim__admin_log(v_r.moim_id, p_admin, 'admin_report_reviewing', p_report, v_reason, ...);
```
- 지금 웹은 이름 붙인 인자 2개로 부른다 → 새 함수가 받는다(기본값 null) → 사유 없음 오류. **DB 적용 ~ 웹 반영 사이 「검토 시작」만 실패**(어드민 1개 버튼, 몇 분). 다른 버튼 영향 없음.

**#27 `moim_schedule_decide`** (C8)
```sql
  if v_cur is distinct from 'requested' then perform public.moim__fail('moim_schedule_request_not_found'); end if;
```
- `moim_request_not_found` 는 가입 신청(`moim_join_decide`)에만 남는다.

**#28 `moim_admin_policies_save`** (D6)
```sql
  if p ? 'report_reasons' and not exists (
       select 1 from jsonb_array_elements(v_reasons) x where (x->>'is_active')::boolean) then
    perform public.moim__fail('moim_policy_report_reason_none_active');
  end if;
```

**#29 `cm_moim_guard_rooms`** (D5 트리거)
```sql
     or new.is_readonly is distinct from old.is_readonly
     or new.room_status is distinct from old.room_status then      -- added
    raise exception 'moim_room_settings_managed_by_moim' using errcode = 'P0001';
```
- 모임 함수는 `room_status` 를 쓰지 않는다(저장소 grep: m2 `moim__room_create` 의 insert 열 목록뿐 — INSERT 는 이 검사 밖). 보관은 참여자 행 `is_archived` 로 한다 → 모임 동작 영향 없음.

**#30 `moim_account_cleanup`** (E4 · E16)
```sql
      v_handovers := v_handovers || jsonb_build_array(jsonb_build_object(
        'moim_id', v_m.id, 'to_user_id', v_next, 'moim_status', v_m.status,
        'to_nickname', (select nickname from public.moim_members where moim_id = v_m.id and user_id = v_next)));
```

**#31 새 `moim__assert_image_url(p_url text)`** (E12)
```sql
 returns void language plpgsql immutable set search_path to 'public'
begin
  if p_url is null then return; end if;
  if p_url !~ '^https://[^\s]+$' or char_length(p_url) > 1000 then perform public.moim__fail('moim_image_url_invalid'); end if;
end
```
- 글 사진(`moim__assert_images`)·앨범(`moim_album_add`)과 같은 기준(https · 1000자). 호스트 제한은 넣지 않는다(지금 기준과 같게 — 새 값 임의 추가 금지).

**#32 새 `moim__assert_birth_years(p_min int, p_max int)`** (C17)
```sql
 returns void language plpgsql stable set search_path to 'public'
declare v_now int := extract(year from now())::int;
begin
  if (p_min is not null and (p_min < 1900 or p_min > v_now)) or (p_max is not null and (p_max < 1900 or p_max > v_now))
     or (p_min is not null and p_max is not null and p_min > p_max) then
    perform public.moim__fail('moim_age_range_invalid');
  end if;
end
```
- 1900 은 「검사 없음」보다 넓은 형식 하한일 뿐이다. 실제 나이 정책 값이 계약에 없어 넣지 않는다.

**#33** `moim_admin_member_unban`·`moim_admin_sanction_revoke`·`moim_admin_content` 의 D11 은 위 #4·#10·#11 에 포함.

> 바뀌는 함수 수 정리: 기존 함수 29개(#1~#14, #16~#30 — 번호 29개) + 새로 3(#15, #31, #32). #26 은 옛 서명 삭제 + 새 서명 생성(개수 그대로). #33 은 번호만 있고 함수가 아니다.

### 2-3. 데이터 확인(운영 읽기 전용) · 보정

**확인 쿼리**(적용 전 작업자가 `begin read only; set local statement_timeout = '30s'; … rollback;` 으로 1회씩 · 처음 보는 표는 `information_schema.columns` 먼저 — 운영 DB 임의 조회 규칙):

```sql
-- Q1 E1: reports closed by another moim's decision
select e.moim_id as decided_moim, e.target_id as decided_report, r.id as closed_report,
       r.moim_id as closed_moim, r.status, r.reporter_id, r.handled_at
  from public.moim_events e
  cross join lateral jsonb_array_elements_text(coalesce(e.payload->'after'->'closed_report_ids', '[]'::jsonb)) x(id)
  join public.moim_reports r on r.id = x.id::uuid
 where e.type in ('admin_report_actioned', 'admin_report_dismissed') and r.moim_id <> e.moim_id;
-- Q1b cross-check (also catches rows if an event is missing): same handler, same second, same target, other moim
select r2.id, r2.moim_id, r1.id as decided_report, r1.moim_id as decided_moim
  from public.moim_reports r1 join public.moim_reports r2
    on r2.target_type = r1.target_type and r2.target_id = r1.target_id and r2.moim_id <> r1.moim_id
   and r2.handled_by = r1.handled_by and r2.handled_at = r1.handled_at
 where r1.status in ('actioned', 'dismissed');
-- Q2 D3: duplicate active moim-level sanctions
select moim_id, level, count(*), array_agg(id order by created_at) from public.moim_sanctions
 where target_kind = 'moim' and level in ('unlist', 'warn', 'block') and revoked_at is null
   and starts_at <= now() and (ends_at is null or ends_at > now())
 group by 1, 2 having count(*) > 1;
-- Q3 new2: duplicate content_hide rows for one target
select target_id, count(*), array_agg(id order by created_at) from public.moim_sanctions
 where level = 'content_hide' and revoked_at is null group by 1 having count(*) > 1;
-- Q4 E3: open bans placed by a platform admin (source backfill) / admin bans already lifted by staff
select b.id, b.moim_id, b.user_id, b.released_at, b.released_by from public.moim_bans b
 where exists (select 1 from public.moim_events e where e.moim_id = b.moim_id and e.target_id = b.user_id
                and e.type = 'admin_member_banned' and e.actor_kind = 'admin' and e.actor_id = b.banned_by);
-- Q5 D5: moim rooms whose room_status was changed outside moim functions
select id, owner_ref_id, room_status from public.community_messenger_rooms
 where owner_domain = 'moim' and room_status <> 'active';
-- Q6 E14: unfinished schedules whose host is no longer an active member
select s.id, s.moim_id, s.host_user_id, s.starts_at from public.moim_schedules s
  join public.moim_members mm on mm.moim_id = s.moim_id and mm.user_id = s.host_user_id
 where s.status in ('recruiting', 'full', 'closed') and mm.status <> 'active';
-- Q7 E12/C17: stored values the new checks would reject
select 'cover' k, count(*) from public.moims where cover_image_url is not null and (cover_image_url !~ '^https://[^\s]+$' or char_length(cover_image_url) > 1000)
union all select 'avatar', count(*) from public.moim_members where avatar_url is not null and (avatar_url !~ '^https://[^\s]+$' or char_length(avatar_url) > 1000)
union all select 'age', count(*) from public.moims where (age_min_birth_year is not null and (age_min_birth_year < 1900 or age_min_birth_year > extract(year from now())))
                                                    or (age_max_birth_year is not null and (age_max_birth_year < 1900 or age_max_birth_year > extract(year from now())));
-- Q8 D6: policy with zero active reasons
select count(*) from public.moim_policies pol, jsonb_array_elements(pol.report_reasons) r where pol.id = 1 and coalesce((r->>'is_active')::boolean, true);
```

**보정(마이그레이션 안 · 백업 먼저 · 다시 돌려도 같은 결과)**:

| 보정 | 규칙 | 이유 |
|---|---|---|
| R-1 E1 잘못 닫힌 신고 되살림 | Q1 ∪ Q1b 의 행 → `status='received', action_id=null, handled_by=null, handled_at=null`. 단 같은 신고자·같은 모임·같은 대상의 열린 신고가 이미 있으면(새 인덱스 충돌) 되살리지 않고 목록만 보고 | 그 신고는 그 모임에서 아무도 검토하지 않았다. 「다른 모임 이름」 결과 알림은 이미 갔다 → 지울 수 없음, 건수만 보고 |
| R-2 D3 중복 모임 제재 | Q2 묶음마다 `ends_at` 이 가장 늦은 1행(null = 무기한이 가장 늦음)을 남기고 나머지 `revoked_at = now(), revoked_by = null` + `moim__log(…'system', 'sanction_dedup'…)` | 남긴 행만으로 `platform_state` 가 같게 나온다(같은 단계·같거나 더 긴 기간) → 적용 뒤 `moim__platform_refresh` 결과가 전과 같은지 대조 |
| R-3 신규2 중복 숨김 기록 | Q3 묶음마다 가장 이른 1행을 남기고 나머지 `revoked_at = created_at, revoked_by = null` | 숨김 기록은 상태 계산에 안 쓰인다(화면 표시만). 신고 `action_id` 가 가리키는 행은 남긴 행으로 바꾼다 |
| R-4 E3 차단 출처 | Q4 의 **열린** 차단 → `source='admin'` | 이미 풀린 어드민 차단(부모임장이 푼 것)은 되돌리지 않고 목록만 보고(다시 거는 것은 어드민 판단) |
| R-5 E14 호스트 | Q6 의 일정마다 `moim__release_member` 와 같은 재지정(모임장으로) — 모임장이 없거나(종료·삭제) 같은 사람이면 건너뜀 | 나간 사람이 일정 방장으로 남은 상태 정리 |
| Q5·Q7·Q8 | **보정하지 않는다** — 0건이면 끝. 1건 이상이면 목록을 보고(Q5 는 어드민이 한 조치일 수 있음, Q7 은 지금 화면에서 보이는 사진일 수 있음) | 원래 값을 임의로 바꾸지 않는다 |

- 보정 SQL 은 같은 트랜잭션에서 위 순서로, 각 단계 전에 `insert into moim_r5_backup_20271128 select '<tbl>', id, to_jsonb(t) from … on conflict do nothing`.
- 적용 뒤 보고: 단계별 바뀐 행 수 · 백업 행 수 · 열 단위 대조(백업 jsonb vs 현재 행, 바뀌어야 할 열만 다름).

### 2-4. 권한
- 새 함수 3개·바뀐 서명 1개: `revoke all on function … from public, anon, authenticated; grant execute … to service_role;`
- 백업 표: RLS 켜기 + service_role 만.

---

## 3. TS 변경 (웹 서버·알림 · 같은 PR)

### 3-1. E1 어드민 「같은 대상 열린 신고 수」
`lib/admin/moim/moim-admin-queries.server.ts:603-607` `openSame` 에 `.eq("moim_id", report.moim_id)`. 닫는 범위(#1)와 화면 수가 같아진다. 「같은 대상 신고 이력」(:592-597)은 그대로 둔다(§7 범위 밖 기록).

### 3-2. E4 알림 이동 위치 — 받는 사람 상태별 규칙 (단일 함수)

화면이 여는 조건의 단일 정의 `canViewMoim`(`moim-queries.server.ts:475-479`)을 순수 함수로 꺼내 둘이 같이 쓴다:

```ts
// lib/moim/moim-view-rule.ts (no server import — shared by queries and notify)
export type MoimViewState = { status: "active" | "closed" | "deleted"; retentionEndedAt: string | null };
export function moimViewable(s: MoimViewState, receiverIsActiveMember: boolean): boolean {
  if (s.status === "deleted") return false;
  if (s.status === "closed") return !s.retentionEndedAt && receiverIsActiveMember;
  return true; // active (normal · unlisted · warned · blocked): public page or member home
}

// lib/moim/server/moim-notify.server.ts
/** E4: 받는 사람이 열 수 있으면 원래 위치, 아니면 모임 탭. 결과 알림이 아니면 열 수 없을 때 보내지 않는다(null). */
export function moimNotifyLink(
  s: MoimViewState,
  receiverIsActiveMember: boolean,
  intended: string,
  opts: { result: boolean }
): string | null {
  if (moimViewable(s, receiverIsActiveMember)) return intended;
  return opts.result ? moimPaths.list() : null;
}
```

| 알림 | 받는 사람 상태 | 이동 위치 |
|---|---|---|
| `moim_report_result`(신고자) | 모임 활동 중 / 활동 모임의 비멤버 | 모임 홈 / 모임 공개 페이지(같은 주소 `/moim/{id}`) |
| | 종료 모임의 비멤버 · 열람 기간 끝남 · 삭제 모임 | 모임 탭 `/moim` |
| `moim_member_removed`·E10 `moim_join_rejected` | 방금 나간 사람(비멤버) — 활동 모임 / 종료·삭제 모임 | 공개 페이지 / 모임 탭 |
| `moim_unbanned` | 활동 모임 / 종료 모임(삭제 모임은 #4 가 막음) | 공개 페이지 / 모임 탭 |
| `moim_sanctioned`·`moim_sanction_released`·`moim_admin_info_updated` | 모임장·멤버 — 활동 / 종료(열람 중) / 열람 끝 | 모임 홈 / 모임 홈 / 모임 탭 (종료 모임 제재 알림은 #1·#12 가 대상 0명) |
| `moim_host_changed`(계정 정리 포함) | 활동 멤버 / 삭제 모임 | 모임 홈 / **보내지 않음**(결과 알림 아님 — 삭제 모임은 이미 삭제 알림을 받았음) |

- 필요한 상태는 RPC 반환값(#1 `moim_status`·`retention_ended_at`·`reporter_member_ids`, #4·#5·#6·#12·#21·#30)으로 받는다 → **추가 조회 0**. 옛 DB(키 없음)면 지금처럼 `intended` 를 쓴다(DB 먼저 적용하므로 실제로는 없음).
- 신고 결과는 신고자를 `reporter_member_ids` 로 두 묶음으로 나눠 `notifyMoimMany` 2번(같은 dedupeRef — 받는 사람이 다르므로 키가 겹치지 않음).
- 계약 §7 의 `moim_report_result` 이동 위치는 「알림 상세」로 적혀 있으나 모임 신고는 「내 신고 내역」 출처(`MY_REPORT_SOURCES`)가 없어 구현된 적이 없다 → §8 Owner 결정 1.

### 3-3. E5·E6 알림 정책 레지스트리

| 파일 | 바꿈 |
|---|---|
| `lib/moim/server/moim-notify.server.ts` `BELL_ONLY_KINDS` | `moim_report_result` 추가(푸시·소리 없이 벨에만 — 계약 §7 「푸시 X」). 주석 「여기서 바꾸지 않는다」 삭제 |
| `lib/notifications/policy/notification-preference-policy-registry.ts` `META_KIND_PREFERENCE_POLICY_OVERRIDES` | `moim_report_result: row("member", "community_social", "mandatory", MANDATORY)` · `moim_admin_info_updated: row(…mandatory…)` |
| `lib/notifications/notification-item-registry.ts` | 그대로(`moim_report_result` 는 「커뮤니티 신고 처리 결과」 항목에 남아 알림함 분류·아이콘 유지) |
| 계약 `moim-design-v1-2026-11-12.md` §7 | `moim_report_result` 끌 수 있음 = **X (벨 전용 — D-7)** · `moim_admin_info_updated` 행 추가: 모임장 · 벨 O · 푸시 O · community_social · **X(결과 — D-22)** · 모임 홈 · E15 문장(§3-15) |

사용자 기존 설정에 미치는 효과(저장된 설정 행은 **하나도 바뀌지 않음**):
- 「커뮤니티 신고 처리 결과」를 **켠** 사람: 모임 신고 결과 **푸시가 더 이상 오지 않는다**(벨에는 그대로). 커뮤니티(필라이프) 신고 결과 푸시는 그대로.
- 그것을 **끈** 사람: 변화 없음(전에도 푸시 없음, 벨은 늘 저장 — D-7 플랫폼 규칙).
- 「모임 활동(community_social)」 푸시를 **끈** 모임장: 어드민 정보 수정 알림 푸시가 **이제 온다**(필수). 켠 사람: 변화 없음.
- 시험: `lib/notifications/policy/__tests__` 에 두 종류의 판정 시험 추가(설정 꺼짐이어도 mandatory · `moim_report_result` 는 `bell_only`).

### 3-4. E3 차단 목록
- `listMoimBans`(`moim-queries.server.ts:682-700`): select 에 `source` 추가 → `source === "admin"` 이면 `reason: null`, `byPlatform: true`. DTO `MoimBannedDto` 에 `byPlatform` 추가.
- 운영 › 멤버 › 차단 목록 화면: `byPlatform` 이면 사유 칸 대신 「운영팀이 차단했어요」 키, [차단 해제] 버튼 숨김(서버도 #3 이 거부 — 403).
- `moimRpcResponse`: `moim_ban_admin_only` → 403.

### 3-5. E9 역할 라우트
`app/api/moim/[moimId]/members/[userId]/route.ts:24` `if (result.ok)` → `if (result.ok && result.changed !== false)`(옛 DB = 키 없음 = 바뀜).

### 3-6. E10 신청자 내보내기·차단 알림
`remove/route.ts` 와 어드민 `members/[userId]/route.ts` remove·ban 분기: `was_pending` 이면 `moim_join_rejected`(이미 있는 결과 알림 · 필수) 를 신청자에게, 이동 위치 = §3-2 규칙(비멤버). 차단이어도 문구는 「가입 신청이 거절됐어요」(차단 사실을 따로 알리지 않음 — 지금 비회원 차단을 알리지 않는 규칙과 같음).

### 3-7. D7 어드민 동네
`app/api/admin/moim/moims/[moimId]/route.ts:80` `lguId` 가 있으면 `lguPublicName(lguId)`(`lib/neighborhood/lgu-location.server.ts:30`)가 null 이면 400 `moim_region_invalid`. DB(#21)는 형식만.

### 3-8. D9 검토 시작 사유
`moimAdminReportReview(adminId, reportId, reason, sb)` → `p_reason` 전달. 리뷰 라우트 `reports/[reportId]/review/route.ts` 가 `moimAdminReason(body.reason)` 필수. 어드민 폼에 사유 입력(기존 처리 폼과 같은 컴포넌트).

### 3-9. C5 보낸 위임 요청
- `getMoimDetail`(또는 위임 화면 쿼리)에 보낸 요청 1행: `moim_host_transfers` `kind='direct' and status='requested' and from_user_id = viewer` — **모임장일 때만** 읽는다(이미 같은 Promise.all 안 — 추가 왕복 0, 행 읽기 1).
- 새 라우트 `DELETE /api/moim/[moimId]/host-transfer` → `moim_host_transfer_cancel`.
- 재요청 시 `moim_transfer_pending`(미접속 요청 진행 중) 문구 키는 이미 있다.

### 3-10. C8 오류 문구
`moim_err_moim_schedule_request_not_found` ko「참여 신청을 찾을 수 없어요. 이미 처리됐을 수 있어요」·en 짧게. 일정 상세 승인·거절 실패 시 목록 다시 불러오기.

### 3-11. E16 모임장 변경 알림 — 보내는 곳 4곳을 함수 1개로
```ts
export async function notifyMoimHostChanged(sb, moimId, toUserId, recipients, dedupeRef, opts?: { actorId?: string; toNickname?: string }) {
  const nick = (opts?.toNickname ?? (await readNickname(sb, moimId, toUserId))).trim();
  await notifyMoimMany(sb, recipients.filter((id) => id !== opts?.actorId), {
    kind: "moim_host_changed", moimId, linkUrl: moimPaths.home(moimId), dedupeRef,
    vars: { moim: await loadMoimName(sb, moimId), ...(nick ? { name: nick } : {}) },
    ...(nick ? {} : { keyVars: { name: "notify_member_fallback_name" as MessageKey } }),
  });
}
```
호출: `host-transfers/[transferId]/route.ts:36` · 어드민 `members/[userId]/route.ts:101` · `host-requests/[transferId]/route.ts:35` · `moim-account-cleanup.server.ts:24`(#30 `to_nickname`·`moim_status` 사용, 삭제 모임 건너뜀).

### 3-12. C13 메모 표시 규칙
`MoimManageMembers.tsx:157` 의 「대상 역할 ≥ 내 역할이면 대화만」 분기에서 메모 항목은 빼낸다: `c.write_note && m.userId !== myId` 이면 역할과 상관없이 [메모] 표시. 메모 탭도 `m.userId !== myId`. 서버 #25 와 같은 규칙.

### 3-13. E17 검색어
```ts
// lib/moim/moim-search-term.ts
export function moimSearchTerm(raw: string | null | undefined): string {
  return (raw ?? "").normalize("NFKC").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 40);
}
```
`moim-queries.server.ts:352` 의 `replace(/[%_,()]/g, " ")` 를 이 함수로. 글자·숫자·공백만 남아 PostgREST `or()` 예약 문자(`, . : ( ) " \ *`)와 `ilike` 와일드카드가 모두 빠진다.

### 3-14. E20 DB 오류 매핑
`callMoimRpc`(`moim-rpc.server.ts:24`)·어드민 RPC(:793): 메시지에 `moim_` 코드가 없을 때만 Postgres `error.code` 로:
- `23514`·`23502`·`23503`·`22P02`·`22003`·`22007`·`22008` → `moim_invalid_input`(400)
- `23505` → `moim_duplicate`(409)
- `40001`·`40P01`·`55P03` → `moim_conflict`(409)
- 그 밖 → `moim_unknown` + 응답 **500**(`moimRpcResponse`·`moimAdminRpcResponse` 에 `moim_unknown → 500`). 원래 메시지는 `detail` 로 서버 로그만(지금과 같음, 응답에 넣지 않음).

### 3-15. E15 계약 문장 (코드 변경 없음)
계약 §7 아래 줄에 추가: 「추천 제외(unlist)에 끝나는 날이 있으면, 그날이 지나 저절로 풀릴 때는 알리지 않는다(2026-11-28 Owner 결정 E15). 어드민이 직접 풀면 `moim_sanction_released` 를 보낸다.」 — 지금 동작(`moim_sanctions_expire_due` 가 기록만 남김)과 같다.

### 3-16. B5 초대 거절
`app/api/moim/invites/[inviteId]/route.ts:15` `guardMoimWrite(req, { …, phone: true })` → `phone: false, consentExempt: true`. 수락 분기는 이미 `requireRegistrationForAction` + `guardMoimAcceptGate`(휴대폰) — 약관 확인을 잃지 않게 수락 분기에 `requireSignupCompleteForUser` 를 더한다(지금 수락이 받던 검사와 같은 묶음 유지).

### 3-17. D5 메신저 어드민 쪽
`lib/admin-community-messenger/moim-room-admin-guard.ts` `cmRoomAdminActionTouchesReadonly` → 이름 `cmRoomAdminActionManagedByMoim`, 대상 동작에 `block`·`unblock`·`archive`(CAS 의 `room_status` 로 가는 동작 — `admin-chat-moderation-cas.ts:45-50`) 추가. 안내 문구 키 그대로(「모임 어드민에서」).

### 3-18. D3·E11 알림
- 신고 처리 라우트 2번 블록: `levelAction.created !== false` 일 때만 `moim_sanctioned`(옛 DB = 키 없음 = 만든 것).
- 직접 제재 라우트(`moims/[moimId]/sanctions/route.ts`): `report_reporter_id` 가 있으면 그 사람에게 `moim_report_result`(actioned, 링크 §3-2).

---

## 4. 결함별 — 바꿈 · 그대로 동작해야 하는 호출처 · 시험 · 위험

| 번호 | 바꿈 | 그대로 동작해야 하는 호출처 | 시험 | 위험 |
|---|---|---|---|---|
| E1 | #1·#2·인덱스·R-1·§3-1 | 같은 모임 안 같은 대상 닫기(그대로) · 신고 버튼 전 화면(`moim_report_create` 하나) | S-01·S-02·S-03 | 인덱스 교체 중 잠금(작은 표) · 되살린 신고가 어드민 큐에 다시 뜸(의도) |
| E3 | 열 · #3·#4·#6 · R-4 · §3-4 | 운영진 차단·해제(모임 출처만) · 어드민 차단·해제 · `moim__assert_joinable` 등 차단 판정(열 안 봄 — `released_at` 만) | S-04·S-05·S-06 | 이미 부모임장이 푼 어드민 차단은 되돌리지 않음(목록 보고) |
| E4 | 반환 키 · §3-2 | 모든 모임 알림 발송(규칙 1개) · `canViewMoim` 동작 그대로(함수만 옮김) | vitest `moimNotifyLink` 표 전 칸 · S-07(반환 키) | 링크를 정하는 시점과 사용자가 누르는 시점 사이 상태 변화는 못 따라감(지금과 같음) |
| E5·E6 | §3-3 | 다른 신고 결과(필라이프·메신저)·다른 모임 알림 | vitest 정책 판정 | §3-3 사용자 체감 변화(신고 결과 푸시 없어짐) |
| E8 | #7·#8·#9·#10 | 운영진 숨김(active 만) · 어드민 숨김·복구·삭제 · 나간 뒤 삭제(D-36 그대로) · 댓글 수 | S-08~S-11 | 옛 사진 본인 삭제는 기록이 없어 어드민 undelete 가 됨 |
| E9 | #24 · §3-5 | 실제 역할 변경·한도 검사 | S-12 | 없음 |
| E10 | #5·#6 반환 · §3-6 | 활동 멤버 내보내기 알림(그대로) · 비회원 차단 무알림(그대로) | S-13 · vitest 라우트 | 알림 1건 추가 |
| E11 | #12 · §3-18 | 신고 없는 직접 제재(그대로) · 신고 처리(#1) | S-14·S-15 | 연결 신고가 자동으로 닫힘(규칙으로 정함) |
| E12 | #31 + #13·#18·#20~#23 | 빈 값(사진 지우기) 허용 · 프로필 기본 사진 대체(검사 안 함 — 사용자가 보낸 값만) | S-16·S-17 | 지금 http 주소를 보내는 업로드 경로가 있으면 저장 실패 → 적용 전 Q7·업로드 코드 grep(저장소 업로드는 https 공개 URL) |
| E13 | #9·#13·#14 | 운영 기록 화면(종류 3개 추가 — 어드민 문구 키 3개 추가) | S-18 | 운영기록 종류 원문 노출(D17)과 같은 화면 → 키 함께 추가 |
| E14 | #17 · R-5 | 시작 전 일정 재지정(그대로) · 모임장 본인 나가기 금지(그대로) | S-19 | 시작한 일정 방 방장이 모임장으로 바뀜(의도) |
| E16 | §3-11 | 4곳 발송 | vitest 이름 없음 → 대체 이름 키 | 없음 |
| E17 | §3-13 | 검색·커서 결합식(그대로) | vitest `moimSearchTerm` 특수문자 표 | 한글·영문·숫자 외 문자(이모지 등) 검색 불가 — 이름에 쓰인 기호 검색 안 됨 |
| E18 | #16·#18·#19·#1·#11·#12 | 경고 모임 어드민 지정·승인(허용 유지) · 종료 모임 제재 기록(기록은 남고 알림만 0) | S-20~S-23 | 차단 모임 일정 방에서 나간 사람 방 행 처리 — `writer_on` 으로 됨(S-21 확인) |
| E20 | #20~#22 사전 검사 · §3-14 | 모든 RPC 오류 응답 | vitest 매핑 표 · S-24 | 지금 400 을 기대하는 클라이언트 분기 — `moim-client-api.ts` 는 상태 코드가 아니라 `error` 문자열로 판정(:55-67) → 영향 없음 |
| D3·신규2 | #1 · R-2·R-3 · §3-18 | 다른 단계 제재 추가(경고 중 차단 등 — 그대로 새로 만듦) | S-25·S-26 | 비노출 기간 연장은 이제 「해제 후 다시 걸기」로만(새 행을 만들지 않으므로) |
| D5 | #29 · §3-17 | 모임 함수(room_status 안 씀) · 메신저 어드민의 일반 방 조치 | S-27 | Q5 결과가 있으면 그 방은 지금 상태로 굳음(목록 보고) |
| D6 | #28 | 사유 하나 끄기·켜기(그대로) | S-28 | 없음 |
| D7 | #21 · §3-7 | 동네 안 바꾸는 저장 | S-29 · vitest 라우트 | LGU 목록에 없는 기존 값은 그대로(바꿀 때만 검사) |
| D9 | #26 · §3-8 | 처리 폼(사유 이미 필수) | S-30 | DB~웹 사이 「검토 시작」 실패(몇 분) |
| D11 | #4·#10·#11 | 활동·종료 모임 해제·복구(그대로) · 어드민 복구(`moim_admin_restore`) 뒤에는 다시 가능 | S-31 | 삭제 모임 정리가 필요하면 먼저 모임 복구 |
| C5 | #14·#15 · §3-9 | 받는 사람 수락·거절(`moim_host_transfer_respond` 그대로) · 미접속 요청 | S-32·S-33 | 미접속 요청 진행 중엔 모임장이 직접 위임을 못 보냄(그 요청이 끝날 때까지 — 이유 문구 있음) |
| C8 | #27 · §3-10 | 가입 신청 처리 문구(그대로) | S-34 | 없음 |
| C13 | #25 · §3-12 | 메모 저장·삭제 | S-35 | 자기 메모가 이미 있으면 남음(보이기만, 새로 못 씀) |
| C17 | #20~#22·#32 | 연령 제한 없는 모임(null 허용) | S-36 | 없음 |
| B5 | §3-16 | 수락 검사 묶음(그대로) | vitest 라우트(거절 = 휴대폰 미인증도 200) | 없음 |

---

## 5. 로컬 검증 시나리오 (PG17 · R4 반영 DB 에서 R5 적용 전·후 비교 · R4 파일 형식)

파일(작업 때 만듦): `docs/audit/moim-r5-local-verify-scenarios-2026-11-28.sql` — R4 와 같은 `pg_temp.r(label, query)` 틀, 모임 M1·M2(같은 사람 e2 가 둘 다 멤버), 어드민 e6.

| ID | 시나리오 | 적용 전 | 적용 후 기대 |
|---|---|---|---|
| S-01 | e3 이 M1 에서 e2 신고 · e4 가 M2 에서 e2 신고 → M1 신고를 「같은 대상 닫기」로 처리 | M2 신고도 닫힘 | M2 신고 `received` 그대로 · `closed_report_ids` 1개 |
| S-02 | e3 이 M1 에서 e2 신고 후 M2 에서 e2 신고 | `moim_report_duplicate` | ok |
| S-03 | 같은 모임에서 같은 대상 두 번 | duplicate | duplicate(그대로) |
| S-04 | 어드민이 M1 에서 e5 차단 → 부모임장 e2 가 해제 | ok | `moim_ban_admin_only` |
| S-05 | 운영진이 먼저 차단 → 어드민 차단 → 운영진 해제 | ok | `moim_ban_admin_only` · 행 `source='admin'` |
| S-06 | 운영진 차단 → 운영진 해제 | ok | ok(그대로) |
| S-07 | 신고 처리 반환에 `moim_status`·`retention_ended_at`·`reporter_member_ids` | 키 없음 | 있음 · 비멤버 신고자는 빠짐 |
| S-08 | 운영진이 숨긴 글을 작성자가 삭제 | `moim_post_not_found` | deleted |
| S-09 | 숨긴 댓글을 작성자가 삭제 → 글 `comment_count` | not_found | deleted · 수 그대로(두 번 빼지 않음) |
| S-10 | 숨긴 사진을 나간 작성자가 삭제 · `moim_events` 에 `album_deleted` | not_found | deleted · 기록 1행 |
| S-11 | S-08 글을 어드민 undelete / 어드민 삭제 글을 undelete | active(숨김 풀림) / active | `moim_content_author_deleted` / active |
| S-12 | 같은 역할로 다시 저장 | 기록 1행 | `changed:false` · 기록 0행 |
| S-13 | 신청 대기자 내보내기 | `was_active:false` | `was_pending:true` |
| S-14 | 이미 처리된 신고를 직접 제재에 연결 | ok | `moim_conflict` |
| S-15 | 열린 신고를 직접 제재에 연결 | 신고 열린 채 | 신고 `actioned` · `action_id` = 새 제재 |
| S-16 | 표지 `http://x` / `javascript:x` / 1001자 / 빈 값 | 저장됨 ×3 / ok | `moim_image_url_invalid` ×3 / ok |
| S-17 | 가입·초대 수락·프로필에 사진 `ftp://x` | 저장됨 | `moim_image_url_invalid` |
| S-18 | 초대 거절 · 위임 재요청 기록 | 기록 없음 | `invite_declined` · `host_transfer_cancelled`(replaced) |
| S-19 | 시작했지만 안 끝난 일정 호스트가 모임 나감 | 호스트 유지 | 호스트 = 모임장 · `schedule_host_reassigned` |
| S-20 | 차단 모임에서 일정 참여 취소 | `moim_blocked` | ok |
| S-21 | S-20 뒤 일정 방 참여자 행 `left_at` | — | 값 있음(트리거 통과) |
| S-22 | 종료·차단 모임 프로필 수정 | ok | `moim_not_found` / `moim_blocked` |
| S-23 | 차단 모임 미접속 요청 / 경고 모임 미접속 요청 → 어드민 승인 | ok / ok | `moim_blocked` / ok(허용 유지) |
| S-24 | 정보 수정 `capacity:"abc"`·출생 연도 `"19x0"`·최소>최대 | ERROR(형 변환·CHECK) | `moim_capacity_invalid` · `moim_age_range_invalid` ×2 |
| S-25 | 같은 모임 경고를 신고 2건으로 따로 처리 | 경고 행 2개 | 1개 · 둘째 `created:false` |
| S-26 | 이미 숨긴 글을 다른 신고로 숨김 처리 | 숨김 기록 2행 | 1행 · `changed:false` |
| S-27 | 메신저 쪽 직접 `update rooms set room_status='blocked'` (모임 방) / 일반 방 | 바뀜 / 바뀜 | `moim_room_settings_managed_by_moim` / 바뀜 |
| S-28 | 신고 사유 전부 끄고 저장 | ok | `moim_policy_report_reason_none_active` |
| S-29 | 어드민 동네 `"a b;c"` | 저장됨 | `moim_region_invalid` |
| S-30 | 검토 시작 사유 없음 / 있음 | ok / — | `moim_admin_reason_required` / ok · 기록 사유 = 입력값 |
| S-31 | 삭제 모임 제재 해제 · 숨김 복구 · 차단 해제 | ok ×3 | `moim_not_found` ×3 |
| S-32 | 미접속 요청 진행 중 모임장이 직접 위임 요청 | 미접속 요청 말없이 취소 | `moim_transfer_pending` · 미접속 요청 그대로 |
| S-33 | 보낸 위임 요청 취소 / 남의 요청 취소 | 함수 없음 | ok · 기록 / `moim_transfer_not_found` |
| S-34 | 처리된 일정 신청 다시 승인 | `moim_request_not_found` | `moim_schedule_request_not_found` |
| S-35 | 자기 자신 메모 | ok | `moim_cannot_target_self` |
| S-36 | 출생 연도 1850 / 올해+1 / null·null | 저장됨 ×2 / ok | `moim_age_range_invalid` ×2 / ok |
| S-37 | 보정 R-1~R-5 를 시드 데이터에 두 번 실행 | — | 두 번째 0행 · 백업 행 = 바뀐 행 |
| S-38 | 권한: anon·authenticated 로 새 함수 3개 호출 | — | permission denied |
| S-39 | 회귀: R4 시나리오 파일 C-01~ 전부 다시 | R4 결과 | 같음(E1·E8 로 의도적으로 바뀐 칸만 다름 — PR 본문에 목록) |

코드 검사(최종 HEAD 1회): `typecheck:build` · `typecheck:test` · 바뀐 파일 vitest(정책 판정 · `moimNotifyLink` · `moimSearchTerm` · RPC 오류 매핑 · 라우트 4개) · `check:i18n-quality` · 바뀐 파일 eslint · `test:ci` 1회(main 반영 전). `verify:call-surface-cta-ssot` 는 통화 파일을 안 건드려 해당 없음(돌려도 됨).

---

## 6. 끝 정리

### 6-1. 함수 목록
- **바뀌는 기존 함수 29개**(그중 `moim_admin_report_review` 1개는 서명 교체): `moim_admin_report_decide` · `moim_report_create` · `moim_member_unban` · `moim_admin_member_unban` · `moim_member_remove` · `moim_admin_member_remove` · `moim_post_remove` · `moim_comment_remove` · `moim_album_remove` · `moim_admin_content` · `moim_admin_sanction_revoke` · `moim_admin_sanction_apply` · `moim_invite_respond` · `moim_host_transfer_request` · `moim_host_inactive_request` · `moim__release_member` · `moim_profile_update` · `moim_schedule_leave` · `moim_update_info` · `moim_admin_update_info` · `moim_create` · `moim_join` · `moim_member_role_set` · `moim_member_note_set` · `moim_admin_report_review`(서명 교체) · `moim_schedule_decide` · `moim_admin_policies_save` · `cm_moim_guard_rooms` · `moim_account_cleanup`
- **새로 3**: `moim__assert_image_url(text)` · `moim__assert_birth_years(int, int)` · `moim_host_transfer_cancel(uuid, uuid)`
- **삭제 0**(서명 교체로 옛 `moim_admin_report_review(uuid, uuid)` 1개가 없어지고 새 3인자 1개가 생김 — 개수 그대로)
- 구조: 인덱스 1 교체 · `moim_bans.source` 열+CHECK · 백업 표 1

### 6-2. 지문(fingerprint) 쿼리 예상
- 저장소 마지막 정의로 센 이름에 `moim` 이 들어간 함수: **110개**(`moim%` 106 + `cm_moim%` 4, 삭제된 3개 제외). 감사 문서의 운영 지문은 **109**다. 지문 쿼리 정의가 저장소 문서에 없어 1 차이의 이유는 **확인 못 함**.
- 예상: 같은 쿼리로 **+3**(109 → 112). md5 는 바뀐 29개 정의 때문에 전부 달라진다.
- 적용 직전·직후 같은 쿼리를 1회씩 돌려 「전 109(또는 그때 값) → 후 +3」과 바뀐 함수 이름 목록(`pg_get_functiondef` md5 전후 비교 = 정확히 위 29+3)을 보고한다.

### 6-3. 요청 예산 (`lib/perf/request-budget.ts`)
- 예산에 등록된 모임 라우트(`/api/moim` · `/api/moim/[moimId]` · `/api/moim/[moimId]/search` · `/api/moim/rooms` · `/api/cron/moim-schedules`): 
  - `/api/moim`(동네 검색): 검색어 정리만 → **변화 0**.
  - `/api/moim/[moimId]`: C5 보낸 요청 1행을 기존 `Promise.all` 안에 **모임장일 때만** 추가 → 모임장 조회 1회당 +1 요청(평균값 영향 미미 — 모임장 비율만큼). 예산 12.0 안. 줄이는 변경이 아니라 예산 값은 그대로.
  - 나머지: 변화 0. 크론(E15 알림 없음 유지) 변화 0.
- 예산 미등록 쓰기·어드민 라우트: 알림 링크 상태는 RPC 반환값으로 받아 추가 조회 0. 추가 발송: E10(대기자 내보내기 1건) · E11(연결 신고자 1건) · E16 대체 이름(조회 0). D3 로 중복 알림은 줄어든다.

### 6-4. 되돌리기
1. 웹: Vercel Instant Rollback(재빌드 없음) — 새 반환 키·새 코드가 없어도 옛 웹은 동작한다(키 추가만). 단 롤백 뒤 「검토 시작」은 옛 웹이 사유 없이 불러 실패 → DB 2단계까지 같이 되돌리거나 그대로 둠(어드민 버튼 1개).
2. DB: 되돌림 마이그레이션 1개 — 함수 29개를 R4 직후 정의로 다시 만든다(백업 정의 파일 `docs/audit/moim-r5-backup-definitions-2026-11-28.sql` 를 적용 직전 운영 `pg_get_functiondef` 로 만들어 둠 — R1·R4 와 같은 방식). 새 함수 3개 drop · `moim_admin_report_review` 2인자 복원 · 인덱스: 옛 인덱스 다시 만들고 새 것 drop(되살린 신고 때문에 옛 인덱스와 충돌하는 행이 생겼으면 먼저 목록 확인) · `moim_bans.source` 는 남겨 둬도 무해(옛 함수는 안 읽음).
3. 데이터: 백업 표 `moim_r5_backup_20271128` 의 `row_data` 로 R-1~R-5 행을 되돌린다(열 단위 `jsonb_populate_record`). 2026-12-28 까지 보관.

### 6-5. Owner 결정이 남은 것 (최소)
1. **계약 §7 `moim_report_result` 이동 위치** — 계약은 「알림 상세」인데 모임 신고는 「내 신고 내역」 출처가 없어 한 번도 그렇게 동작한 적이 없다(지금 = 모임 홈). 이 설계는 §3-2 상태별 규칙(모임 홈/공개 페이지/모임 탭)으로 구현하고 계약 문장을 그 규칙으로 정정하는 안이다. 「내 신고 내역에 모임 출처를 새로 만든다」를 원하면 별도 작업이다(규정 7번: 계약과 구현 충돌이라 보고).

### 6-6. NOT_PROVEN (이 설계 단계)
- 운영 DB 정의 = 저장소: 감사 문서 근거만, 작성자 미확인.
- §2-3 Q1~Q8 운영 건수: 미조회(읽기 전용 조회는 구현 단계에서 1회).
- 화면 결과·실기기: 없음.

---

## 7. 범위 밖으로 본 것 (고치지 않음 · 기록만)
- 어드민 「같은 대상 신고 이력」(`moim-admin-queries.server.ts:592-597`)은 다른 모임 신고까지 보여 준다(멤버 대상). 어드민에게 유용할 수 있어 E1 범위에서 바꾸지 않았다 — 모임 이름 열이 없어 헷갈릴 수 있음.
- B1(나간 사람이 자기 글에 **닿는** 읽기 경로)은 TS 읽기 라우트 문제다. 이 설계의 #7~#9 는 「닿으면 지울 수 있다」까지만 보장한다.
- D1(제재 탭 숨김·이용 제한 줄 「해제」)·D10·D13 은 화면·라우트 쪽이라 이 설계에 넣지 않았다.
- 어드민 차단·지정은 **차단(blocked) 모임**에서도 지금 허용된다(Owner 는 경고만 정함) — 바꾸지 않았다.
