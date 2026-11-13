-- `facebook` 로그인 잔재 제거 + 운영 DB 주석의 레거시 타사 용어 교체
-- 근거: docs/audit/legacy-brand-terms-audit-2026-11-13.md §H·§I (Owner 「2번 묶음 진행」 2026-11-13)
-- 사전 조회(운영, 2026-11-13): `facebook` 사용자 profiles·users·user_auth_identities·auth.identities 모두 0건,
--   auth_providers.facebook enabled=false, auth_login_settings.facebook enabled=false, 외래키·함수 참조 0건.

begin;

-- 1) 설정 행 삭제 (항상 꺼져 있던 공급자)
delete from public.auth_login_settings where provider = 'facebook';
delete from public.auth_providers where provider = 'facebook';

-- 2) CHECK 제약에서 'facebook' 제거 (나머지 값은 운영 정의 그대로)
alter table public.auth_login_settings drop constraint auth_login_settings_provider_check;
alter table public.auth_login_settings add constraint auth_login_settings_provider_check
  check (provider = any (array['password', 'google', 'kakao', 'naver', 'apple']));

alter table public.auth_providers drop constraint auth_providers_provider_check;
alter table public.auth_providers add constraint auth_providers_provider_check
  check (provider = any (array['google', 'kakao', 'naver', 'apple']));

alter table public.profiles drop constraint profiles_auth_provider_check;
alter table public.profiles add constraint profiles_auth_provider_check
  check (auth_provider is null or auth_provider = any (array['google', 'kakao', 'naver', 'apple', 'admin_manual', 'email']));

alter table public.profiles drop constraint profiles_provider_check;
alter table public.profiles add constraint profiles_provider_check
  check (provider is null or provider = any (array['google', 'kakao', 'naver', 'apple', 'admin_manual', 'email']));

alter table public.user_auth_identities drop constraint user_auth_identities_provider_check;
alter table public.user_auth_identities add constraint user_auth_identities_provider_check
  check (provider = any (array['google', 'kakao', 'apple', 'naver', 'email']));

alter table public.users drop constraint users_provider_check;
alter table public.users add constraint users_provider_check
  check (provider = any (array['google', 'kakao', 'naver', 'apple']));

-- 3) 주석의 레거시 타사 용어 교체 (뜻은 유지)
comment on table public.chat_rooms is
  '통합 채팅방: item_trade(거래) / general_chat(일반)';
comment on table public.community_messenger_message_requests is
  'DEPRECATED — message request archive. CM uses community_messenger_friendships.';
comment on column public.product_chats.trade_flow_status is
  '거래 세션 상태';
comment on column public.user_addresses.place_id is
  'Google Places place_id selected by the user. Required for new delivery addresses.';
comment on column public.community_messenger_rooms.pinned_message_id is
  'P1: single pinned group message.';

commit;
