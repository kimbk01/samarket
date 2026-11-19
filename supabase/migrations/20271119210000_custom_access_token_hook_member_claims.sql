-- D5 (Owner 「D5 승인」 2026-11-19 · auth-hard-lock.md Amendment 2026-11-19 (2))
-- Custom Access Token Hook — 토큰 발급·갱신 때 회원 상태·약관 동의를 클레임 `dibay_m` 으로 넣는다.
-- proxy 가 요청마다 profiles 를 읽지 않도록 한다(활성·약관 완료 회원만 DB 생략, 나머지는 기존 DB 경로).
-- 실패·행 없음 → 토큰을 그대로 돌려준다(로그인·갱신을 절대 막지 않는다).
-- 활성화: Supabase 대시보드 → Authentication → Hooks → Customize Access Token → public.custom_access_token_hook

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_claims jsonb;
  v_uid uuid;
  v_row record;
begin
  v_claims := coalesce(event->'claims', '{}'::jsonb);
  begin
    v_uid := nullif(event->>'user_id', '')::uuid;
  exception when others then
    return event;
  end;
  if v_uid is null then
    return event;
  end if;

  begin
    select p.status, p.deleted_at, p.terms_accepted_at, p.terms_version, p.privacy_accepted_at, p.privacy_version
      into v_row
      from public.profiles p
     where p.id = v_uid;
    if not found then
      return event;
    end if;
    v_claims := v_claims || jsonb_build_object(
      'dibay_m', jsonb_build_object(
        'v', 1,
        'status', v_row.status,
        'deleted_at', v_row.deleted_at,
        'terms_accepted_at', v_row.terms_accepted_at,
        'terms_version', v_row.terms_version,
        'privacy_accepted_at', v_row.privacy_accepted_at,
        'privacy_version', v_row.privacy_version
      )
    );
    return jsonb_set(event, '{claims}', v_claims);
  exception when others then
    return event;
  end;
end;
$$;

comment on function public.custom_access_token_hook(jsonb) is
  'D5 — access token claim dibay_m (member status + terms/privacy consent) for proxy gates. Never fails token issuance.';

revoke all on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
