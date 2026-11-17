-- 앱 진입 어드민 v3 §2·§3 (Owner 2026-11-17 「v3대로 진행」) — 인트로 소재 종류(광고·이벤트·안내).
-- 덧붙이기만 한다: 기존 행은 모두 'ad'(지금까지 소재는 광고 표기 기본 켜짐). 앱(발견 응답)은 이 열을 쓰지 않는다 — 어드민 목록·필터용.
-- 코드는 이 열이 없어도 동작한다(읽기 = 'ad' · 'ad' 가 아닌 종류 저장만 `kind_column_missing`).

alter table public.launch_intro_creatives
  add column if not exists kind text not null default 'ad';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'launch_intro_creatives_kind_check'
      and conrelid = 'public.launch_intro_creatives'::regclass
  ) then
    alter table public.launch_intro_creatives
      add constraint launch_intro_creatives_kind_check check (kind in ('ad', 'event', 'notice'));
  end if;
end $$;

-- 종류 「광고」 = 「광고」 표기 필수 규칙은 서버 코드(`validateLaunchIntroPoolInput`·수정 병합 검사)만 강제한다.
-- DB 제약으로 두면 표기를 끈 기존 소재(종류 기본 'ad')의 순서 저장·끄기까지 막히므로 넣지 않는다.
