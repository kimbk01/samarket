-- 홈 목록 그룹 사진 (docs/design/group-chat-full-fix-design-2026-11-13.md G3 · Owner 「PR C 승인」 2026-11-13)
-- 운영 실측 2026-11-13: BK 계정 홈 스냅샷의 그룹방 항목에 avatar_url 필드 없음 → 사진을 저장해도 홈 목록은 항상 기본 아이콘.
-- 원인: community_messenger_bootstrap_lite_my_rooms_bundle 의 방 객체에 avatar_url 이 없음.
--   이 함수의 rooms 는 home-sync 스냅샷 · bootstrap critical/full 스냅샷 · ?lite=1 이 그대로 쓴다(다른 함수는 latest_messages 만 재조립 — 운영 정의 확인).
-- 변경: 방 객체에 avatar_url 1필드 **추가만** (운영 정의를 읽어 정확한 문장 2곳만 교체 — 20271108200100 과 같은 방식, 문장이 1회가 아니면 중단).
--   운영 사전 확인 2026-11-13: 문장 A 1회 · 문장 B 1회 · CR 없음.
-- 하위 호환: 구 앱·구 서버 파서는 이 키를 무시. 옛 스냅샷 행은 TTL(5초) 뒤 새로 만들어짐 — 옛 데이터 채우기 없음.
-- 롤백: 같은 방식으로 v_new_* → v_old_* 로 되돌리는 replace 를 실행.

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
  if position('''avatar_url'', c.avatar_url' in v_def) > 0 then return; end if;
  if (length(v_def) - length(replace(v_def, v_old_a, ''))) / length(v_old_a) <> 1 then raise exception 'lite bundle 문장 A 불일치'; end if;
  if (length(v_def) - length(replace(v_def, v_old_b, ''))) / length(v_old_b) <> 1 then raise exception 'lite bundle 문장 B 불일치'; end if;
  execute replace(replace(v_def, v_old_a, v_new_a), v_old_b, v_new_b);
end $$;
