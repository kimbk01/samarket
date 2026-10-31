-- 필수 동의 약관 버전 1회 조회 — 요청 증폭 근본 수정 순서 2.
-- 설계: docs/audit/supabase-request-fanout-full-root-cause-2026-11-01.md 순서 2 (Owner 승인 2026-11-01)
-- 이전: `readRequiredConsentVersions` 가 약관·개인정보를 각각 최대 20행 **본문 포함** 읽은 뒤 TS 에서 현재 문서 1건을 골라
--       버전만 썼다 (쓰기 검사·회원 접근 판정마다, 30초 인스턴스 기억 · 운영 10-31 24시간 3,237회).
-- 이 함수는 같은 규칙을 그대로 옮겨 버전 번호만 돌려준다 (본문 안 읽음):
--   kind·locale·status=published, effective_at 내림차순(null 은 뒤) 최신 20행 → 적용 시각 없음 또는 now 이전만
--   → effective_at(없으면 0) 내림차순, published_at(없으면 0) 내림차순 첫 행 = `pickCurrentPublishedLegalDoc`.

create or replace function public.required_consent_versions(p_locale text)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with k(kind) as (values ('terms'), ('privacy')),
  recent as (
    select d.kind, d.version, d.effective_at, d.published_at,
           row_number() over (partition by d.kind order by d.effective_at desc nulls last) as rn
      from public.app_legal_documents d
     where d.locale = p_locale and d.status = 'published' and d.kind in ('terms', 'privacy')
  ),
  picked as (
    select distinct on (r.kind) r.kind, r.version
      from recent r
     where r.rn <= 20 and (r.effective_at is null or r.effective_at <= now())
     order by r.kind,
              coalesce(r.effective_at, 'epoch'::timestamptz) desc,
              coalesce(r.published_at, 'epoch'::timestamptz) desc
  )
  select jsonb_build_object(
    'terms', (select p.version from picked p where p.kind = 'terms'),
    'privacy', (select p.version from picked p where p.kind = 'privacy')
  );
$$;

revoke all on function public.required_consent_versions(text) from public, anon, authenticated;
grant execute on function public.required_consent_versions(text) to service_role;
