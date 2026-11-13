-- 롤백: 20271114100000_cm_lite_bundle_room_avatar_url (홈 목록 그룹 사진 · group-chat-full-fix-design G3)
-- 재감사 R5 (docs/design/group-chat-reaudit-2026-11-13.md): 원래 마이그레이션은 주석으로만 롤백 방법을 적었다 — 실행 파일로 둔다.
-- 방법: 운영 정의를 읽어, 적용 때 넣은 문장 2곳(새 문장)을 원래 문장으로 되돌린다. 각 문장이 정확히 1회가 아니면 중단.
-- 이미 되돌려져 있으면(방 객체에 avatar_url 없음) 아무것도 하지 않는다.
-- 주의: 되돌리면 홈 목록 그룹 사진이 다시 기본 아이콘만 나온다(G3 결함 재발). 운영 적용은 Owner 승인 후.

do $$
declare
  v_def text;
  v_old_a text := E'      r.title,\n      r.created_by,\n';
  v_new_a text := E'      r.title,\n      r.avatar_url,\n      r.created_by,\n';
  v_old_b text := E'          ''title'', c.title,\n          ''created_by'', c.created_by,\n';
  v_new_b text := E'          ''title'', c.title,\n          ''avatar_url'', c.avatar_url,\n          ''created_by'', c.created_by,\n';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'community_messenger_bootstrap_lite_my_rooms_bundle';
  if v_def is null then raise exception 'lite bundle 없음'; end if;
  if position('''avatar_url'', c.avatar_url' in v_def) = 0 then return; end if;
  if (length(v_def) - length(replace(v_def, v_new_a, ''))) / length(v_new_a) <> 1 then raise exception 'lite bundle 새 문장 A 불일치'; end if;
  if (length(v_def) - length(replace(v_def, v_new_b, ''))) / length(v_new_b) <> 1 then raise exception 'lite bundle 새 문장 B 불일치'; end if;
  execute replace(replace(v_def, v_new_a, v_old_a), v_new_b, v_old_b);
end $$;
