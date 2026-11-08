-- 언어 SSOT S8-6a (Owner 「권장대로 승인」 2026-11-08) — docs/audit/i18n-s8-native-plan-2026-11-08.md §17
-- ① user_settings.preferred_language 기본값 'ko' → ''(= 기기 언어 따름). 기존 134행은 손대지 않는다(Owner 결정 ①).
-- ② user_devices.app_language — 앱이 그 기기에서 실제로 쓰는 언어(ko/en). 웹이 시작·변경 때 기록.
-- ③ get_chat_rooms_snapshot.user_lang: 폐기 열 profiles.preferred_language → 계정 명시값 → 최근 활성 기기 언어 → en
--    (lib/notifications/notification-user-language.ts 와 같은 순서). 함수의 다른 부분은 그대로 — 언어 CTE 문장만 교체.

alter table public.user_settings alter column preferred_language set default '';

alter table public.user_devices add column if not exists app_language text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_devices_app_language_check' and conrelid = 'public.user_devices'::regclass
  ) then
    alter table public.user_devices
      add constraint user_devices_app_language_check check (app_language is null or app_language in ('ko', 'en'));
  end if;
end $$;

comment on column public.user_devices.app_language is
  '이 기기에서 앱이 쓰는 언어(ko/en, 기기 언어 따름 포함 결과값). 서버 알림 문구 언어 = 계정 명시값 → 이 값(최근 기기) → en';

do $$
declare
  v_def text;
  v_old text := E'SELECT coalesce(pr.preferred_language, ''ko'') AS lang\r\n    FROM public.profiles pr\r\n    WHERE pr.id = p_user_id\r\n    LIMIT 1';
  v_new text := E'SELECT coalesce(\r\n      (SELECT s.preferred_language FROM public.user_settings s\r\n        WHERE s.user_id = p_user_id AND s.preferred_language IN (''ko'', ''en'') LIMIT 1),\r\n      (SELECT d.app_language FROM public.user_devices d\r\n        WHERE d.user_id = p_user_id AND d.is_active AND d.app_language IN (''ko'', ''en'')\r\n        ORDER BY d.last_seen_at DESC NULLS LAST, d.updated_at DESC NULLS LAST LIMIT 1),\r\n      ''en''\r\n    ) AS lang';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_chat_rooms_snapshot';

  if v_def is null then
    raise exception 'get_chat_rooms_snapshot 없음';
  end if;
  if position(v_new in v_def) > 0 then
    return; -- 이미 적용됨
  end if;
  if position(v_old in v_def) = 0 then
    raise exception 'get_chat_rooms_snapshot user_lang 문장이 예상과 다름 — 중단';
  end if;

  execute replace(v_def, v_old, v_new);
end $$;
