-- 필수 약관 개정 유형 + 게시 문서 불변 (Owner 2026-11-05 「필수 약관 동의 정책 확정」 §3).
-- 설계: docs/legal-consent-revision-policy.md
--
-- 1) app_legal_documents.consent_requirement — 개정 유형.
--    'reconsent' = 이 버전부터 모든 회원이 다시 동의해야 한다 (기존 동작 그대로).
--    'notice'    = 공지만 하는 개정 — 직전 'reconsent' 버전 이후의 동의를 계속 유효로 본다.
--    기존 행은 'reconsent' (현재 게시본 2026-04-store-review 가 동의 기준선) — 회원 판정 변화 없음.
-- 2) 한 번이라도 게시된 terms·privacy 문서는 종류·언어·버전·제목·본문·시행일·개정 유형을 바꿀 수 없다.
--    게시 상태 전환(게시 중단·재게시)만 허용한다. 회원이 동의한 문안이 나중에 몰래 바뀌지 않게 한다.
--    marketing(선택 동의) 문서는 기존 같은 버전 문구 수정 정책 유지 — 대상 아님.
-- 3) required_consent_versions(p_locale) — 기존 'terms'·'privacy' 에 더해
--    'terms_accepted'·'privacy_accepted' (현재 버전부터 직전 'reconsent' 버전까지, 최신순) 를 돌려준다.
--    선택 규칙(최신 20행 · 시행 시각 지난 것 · effective_at → published_at 내림차순)은 기존과 같다.
--
-- 비파괴: 회원 동의 기록·마케팅 설정·약관 본문을 바꾸지 않는다. 회원 데이터 쓰기 없음.
-- 롤백: 함수는 20271101020000 정의로 되돌리고, 트리거·컬럼은 drop (컬럼 drop 전 웹 코드 롤백).

begin;

alter table public.app_legal_documents
  add column if not exists consent_requirement text not null default 'reconsent';

alter table public.app_legal_documents
  drop constraint if exists app_legal_documents_consent_requirement_check;
alter table public.app_legal_documents
  add constraint app_legal_documents_consent_requirement_check
  check (consent_requirement in ('reconsent', 'notice'));

create or replace function public.app_legal_documents_published_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.published_at is not null
     and old.kind in ('terms', 'privacy')
     and (
       new.kind is distinct from old.kind
       or new.locale is distinct from old.locale
       or new.version is distinct from old.version
       or new.title is distinct from old.title
       or new.body is distinct from old.body
       or new.effective_at is distinct from old.effective_at
       or new.consent_requirement is distinct from old.consent_requirement
     ) then
    raise exception 'published_legal_document_immutable'
      using errcode = 'P0001',
            hint = 'A published terms/privacy document is fixed. Publish a revision as a new version.';
  end if;
  return new;
end;
$$;

drop trigger if exists app_legal_documents_published_immutable on public.app_legal_documents;
create trigger app_legal_documents_published_immutable
  before update on public.app_legal_documents
  for each row execute function public.app_legal_documents_published_immutable();

revoke all on function public.app_legal_documents_published_immutable() from public, anon, authenticated;

create or replace function public.required_consent_versions(p_locale text)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with recent as (
    select d.kind, d.version, d.effective_at, d.published_at, d.consent_requirement,
           row_number() over (partition by d.kind order by d.effective_at desc nulls last) as rn
      from public.app_legal_documents d
     where d.locale = p_locale and d.status = 'published' and d.kind in ('terms', 'privacy')
  ),
  eff as (
    select r.kind, r.version, r.consent_requirement,
           row_number() over (
             partition by r.kind
             order by coalesce(r.effective_at, 'epoch'::timestamptz) desc,
                      coalesce(r.published_at, 'epoch'::timestamptz) desc
           ) as pos
      from recent r
     where r.rn <= 20 and (r.effective_at is null or r.effective_at <= now())
  ),
  baseline as (
    select e.kind, min(e.pos) as pos
      from eff e
     where e.consent_requirement = 'reconsent'
     group by e.kind
  ),
  accepted as (
    select e.kind, jsonb_agg(e.version order by e.pos) as versions
      from eff e
      left join baseline b on b.kind = e.kind
     where b.pos is null or e.pos <= b.pos
     group by e.kind
  )
  select jsonb_build_object(
    'terms', (select e.version from eff e where e.kind = 'terms' and e.pos = 1),
    'privacy', (select e.version from eff e where e.kind = 'privacy' and e.pos = 1),
    'terms_accepted', (select a.versions from accepted a where a.kind = 'terms'),
    'privacy_accepted', (select a.versions from accepted a where a.kind = 'privacy')
  );
$$;

revoke all on function public.required_consent_versions(text) from public, anon, authenticated;
grant execute on function public.required_consent_versions(text) to service_role;

commit;
