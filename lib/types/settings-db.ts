/**
 * 설정 관련 Supabase 테이블 타입
 * RLS: 본인만 select/update (user_settings), 본인만 CRUD (blocks/hides/favorites)
 */

export interface UserSettingsRow {
  user_id: string;
  push_enabled: boolean;
  chat_push_enabled: boolean;
  marketing_push_enabled: boolean;
  do_not_disturb_enabled: boolean;
  do_not_disturb_start: string | null;
  do_not_disturb_end: string | null;
  video_autoplay_mode: "always" | "wifi_only" | "never";
  preferred_language: string;
  preferred_country: string;
  personalization_enabled: boolean;
  chat_preview_enabled: boolean;
  /** 상단 배너 닫기 시 true 저장 (my_page_banners 미노출) */
  app_banner_hidden: boolean;
  updated_at: string;
}

export interface UserBlockRow {
  id: string;
  user_id: string;
  blocked_user_id: string;
  created_at: string;
}

export interface UserHideRow {
  id: string;
  user_id: string;
  hidden_user_id: string;
  created_at: string;
}

export interface UserFavoriteRow {
  id: string;
  user_id: string;
  favorite_user_id: string;
  created_at: string;
}

export interface AppNoticeRow {
  id: string;
  title: string;
  body: string;
  is_active: boolean;
  created_at: string;
}

export interface AppSupportedCountryRow {
  code: string;
  name: string;
  is_active: boolean;
  sort_order: number;
}

export interface AppSupportedLanguageRow {
  code: string;
  name: string;
  is_active: boolean;
  sort_order: number;
}

export interface AppMetaRow {
  key: string;
  value: string;
}

export type VideoAutoplayMode = UserSettingsRow["video_autoplay_mode"];

export const DEFAULT_USER_SETTINGS: Partial<UserSettingsRow> = {
  push_enabled: true,
  chat_push_enabled: true,
  marketing_push_enabled: false,
  do_not_disturb_enabled: false,
  do_not_disturb_start: null,
  do_not_disturb_end: null,
  video_autoplay_mode: "wifi_only",
  preferred_language: "ko",
  preferred_country: "PH",
  personalization_enabled: true,
  chat_preview_enabled: true,
  app_banner_hidden: false,
};
