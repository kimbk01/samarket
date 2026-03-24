# 나의 카마켓 / 설정 / 어드민 Supabase 스키마 참고

- `profiles`: lib/profile/types.ts (id, email, nickname, avatar_url, bio, region_name, phone, phone_verified, realname_verified, role, member_type, points, manner_score, preferred_language, preferred_country, created_at, updated_at)
- `user_settings`: lib/types/settings-db.ts (user_id, push_enabled, chat_push_enabled, marketing_push_enabled, do_not_disturb_*, video_autoplay_mode, preferred_language, preferred_country, personalization_enabled, chat_preview_enabled, app_banner_hidden, updated_at)
- `user_blocks`, `user_hides`, `user_favorites`: lib/types/settings-db.ts
- `my_page_banners`: lib/my/types.ts (id, title, description, image_url, link_url, is_active, dismissible, sort_order)
- `my_services`: lib/my/types.ts (code, label, icon_key, href, is_active, sort_order, admin_only, country_code)
- `my_page_sections`: lib/my/types.ts (section_key, title, is_active, sort_order)
- `app_notices`, `app_supported_countries`, `app_supported_languages`, `app_meta`: lib/types/settings-db.ts

어드민: /admin/my/banners, /admin/my/services, /admin/my/sections, /admin/app/notices, /admin/app/countries, /admin/app/languages, /admin/app/meta
