-- Catch-up: prod Supabase에 20260922120000 미적용 시 Dashboard SQL Editor에서 1회 실행
-- Adds device_ringtone | admin_custom source columns for call sounds

alter table public.admin_messenger_call_sound_settings
  add column if not exists voice_incoming_sound_source text not null default 'device_ringtone'
    check (voice_incoming_sound_source in ('device_ringtone', 'admin_custom'));

alter table public.admin_messenger_call_sound_settings
  add column if not exists video_incoming_sound_source text not null default 'device_ringtone'
    check (video_incoming_sound_source in ('device_ringtone', 'admin_custom'));

alter table public.admin_messenger_call_sound_settings
  add column if not exists voice_outgoing_ringback_source text not null default 'device_ringtone'
    check (voice_outgoing_ringback_source in ('device_ringtone', 'admin_custom'));

alter table public.admin_messenger_call_sound_settings
  add column if not exists video_outgoing_ringback_source text not null default 'device_ringtone'
    check (video_outgoing_ringback_source in ('device_ringtone', 'admin_custom'));

comment on column public.admin_messenger_call_sound_settings.voice_incoming_sound_source is 'device_ringtone=OS 기본 벨, admin_custom=voice_incoming_sound_url';
comment on column public.admin_messenger_call_sound_settings.video_incoming_sound_source is 'device_ringtone=OS 기본 벨, admin_custom=video_incoming_sound_url';
comment on column public.admin_messenger_call_sound_settings.voice_outgoing_ringback_source is 'device_ringtone=앱 기본 링백, admin_custom=voice_outgoing_ringback_url';
comment on column public.admin_messenger_call_sound_settings.video_outgoing_ringback_source is 'device_ringtone=앱 기본 링백, admin_custom=video_outgoing_ringback_url';
