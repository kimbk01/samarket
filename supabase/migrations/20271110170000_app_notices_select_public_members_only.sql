-- 사장님 전용 공지(audience <> 'all')·숨김·삭제 글이 공개 키(anon/authenticated)로 읽히던 문제 차단
-- (감사 A · Owner 「결함 수정 진행」 2026-11-10).
-- 앱은 공지를 서버(service_role)로만 읽고 audience 로 거른다 — 이 정책은 직접 REST 호출 방어선.
-- 기존 정책 app_notices_select 는 대시보드에서 만든 `USING (true)` (저장소에 없음).
drop policy if exists app_notices_select on public.app_notices;
create policy app_notices_select on public.app_notices
  for select
  to anon, authenticated
  using (audience = 'all' and is_active = true and deleted_at is null);
