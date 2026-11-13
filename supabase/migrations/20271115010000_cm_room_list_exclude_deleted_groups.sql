-- 삭제된 그룹을 대화 목록에서 제외 (docs/audit/cm-deleted-group-list-leak-design-2026-11-14.md D1 · Owner 「D1 진행」 2026-11-14)
-- 운영 실측 2026-11-14: 방장이 삭제한 그룹(rooms.deleted_at 있음)이 멤버 목록에 계속 나오고, 누르면 방 진입이 거부되어 목록으로 돌아감.
-- 원인: S2-4(20261011150000) 는 deleted_at 을 테이블 직접 조회(대체 경로)에만 넣었고,
--   운영이 쓰는 목록 원천 함수 2개는 deleted_at 으로 거르지도 응답에 넣지도 않음 → 서버 목록 제외가 한 번도 동작하지 않음.
--   · community_messenger_bootstrap_lite_my_rooms_bundle — home-sync·critical·full 스냅샷·?lite=1
--   · community_messenger_bootstrap_my_room_ids — full 목록(rooms_v2 는 이 id 만 받음)·공유 대상
-- 변경: 두 함수의 목록 조건에 「삭제 안 된 방」 1줄씩 **추가만** (운영 정의를 읽어 정확한 문장만 교체 — 20271114100000 과 같은 방식, 문장이 1회가 아니면 중단).
--   운영 사전 확인 2026-11-14: 문장 A 1회 · 문장 B 1회 · CR 없음.
-- 계약 유지: 참여자·메시지 행은 보존(S2-4) — 행은 바꾸지 않고 목록 조회에서만 뺌. 응답 모양 변화 없음(구 앱 호환).
-- 롤백: 같은 방식으로 v_new_* → v_old_* 로 되돌리는 replace 를 실행.

do $$
declare
  v_def text;
  v_old_a text := E'      and p.blocked_hidden_at is null\n';
  v_new_a text := E'      and p.blocked_hidden_at is null\n      and r.deleted_at is null\n';
  v_old_b text := E'    WHERE p.user_id = p_user_id\n';
  v_new_b text := E'    WHERE p.user_id = p_user_id\n      AND r.deleted_at IS NULL\n';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'community_messenger_bootstrap_lite_my_rooms_bundle';
  if v_def is null then raise exception 'lite bundle 없음'; end if;
  if position(v_new_a in v_def) = 0 then
    if (length(v_def) - length(replace(v_def, v_old_a, ''))) / length(v_old_a) <> 1 then
      raise exception 'lite bundle 문장 A 불일치';
    end if;
    execute replace(v_def, v_old_a, v_new_a);
  end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'community_messenger_bootstrap_my_room_ids';
  if v_def is null then raise exception 'my_room_ids 없음'; end if;
  if position(v_new_b in v_def) = 0 then
    if (length(v_def) - length(replace(v_def, v_old_b, ''))) / length(v_old_b) <> 1 then
      raise exception 'my_room_ids 문장 B 불일치';
    end if;
    execute replace(v_def, v_old_b, v_new_b);
  end if;
end $$;
