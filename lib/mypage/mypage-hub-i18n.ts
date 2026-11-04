import { orderStatusName } from "@/lib/stores/store-order-process-model";
import type { AppLanguageCode } from "@/lib/i18n/config";
import type { MessageKey } from "@/lib/i18n/messages";
type TFn = (key: MessageKey, vars?: Record<string, string | number>) => string;

const COUNTRY_KEYS: Record<string, MessageKey> = {
  PH: "settings_country_ph",
  KR: "settings_country_kr",
  US: "settings_country_us",
};

const AUTOPLAY_KEYS: Record<string, MessageKey> = {
  always: "settings_autoplay_always",
  wifi_only: "settings_autoplay_wifi_only",
  never: "settings_autoplay_never",
};


export function hubCountryLabel(code: string, t: TFn): string {
  const key = COUNTRY_KEYS[String(code).trim().toUpperCase()];
  return key ? t(key) : code;
}

export function hubAutoplayLabel(mode: string, t: TFn): string {
  const key = AUTOPLAY_KEYS[String(mode).trim()];
  return key ? t(key) : t("settings_autoplay_wifi_only");
}

/** 주문 상태 이름 — 4단계 정본 */
export function hubStoreOrderStatusLabel(status: string, _t: TFn, fulfillment: string = "local_delivery"): string {
  return orderStatusName(String(status).trim(), fulfillment);
}

export function hubTradeFlowLabel(value: string | null | undefined, t: TFn): string {
  switch (value) {
    case "seller_done":
      return t("mypage_hub_trade_seller_done");
    case "completed":
      return t("mypage_hub_trade_completed");
    case "issue":
      return t("mypage_hub_trade_issue");
    case "chatting":
      return t("mypage_hub_trade_chatting");
    default:
      return value?.trim() ? value : t("mypage_hub_trade_in_progress");
  }
}

export type SettingsSheetKind =
  | "notifications"
  | "language"
  | "country"
  | "chat"
  | "autoplay"
  | "personalization"
  | "app"
  | "support"
  | "terms";

export function hubSheetTitle(kind: SettingsSheetKind | null, t: TFn): string {
  switch (kind) {
    case "notifications":
      return t("notifications_settings_title");
    case "language":
      return t("mypage_language");
    case "country":
      return t("settings_country");
    case "chat":
      return t("settings_chat");
    case "autoplay":
      return t("settings_video_autoplay");
    case "personalization":
      return t("settings_personalization");
    case "app":
      return t("mypage_hub_app_settings_title");
    case "support":
      return t("mypage_hub_support_title");
    case "terms":
      return t("mypage_hub_terms_title");
    default:
      return "";
  }
}

export function hubFormatCount(value: number | null, t: TFn): string | undefined {
  if (value == null) return undefined;
  return t("mypage_hub_count_items", { count: value });
}

export function hubFormatRelativeDate(
  value: string | null | undefined,
  language: AppLanguageCode,
  t: TFn
): string {
  if (!value) return t("mypage_hub_time_recent");
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return t("mypage_hub_time_recent");
  const diffMinutes = Math.floor((Date.now() - time) / 60000);
  if (diffMinutes < 1) return t("mypage_hub_time_just_now");
  if (diffMinutes < 60) return t("mypage_hub_time_minutes_ago", { count: diffMinutes });
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return t("mypage_hub_time_hours_ago", { count: diffHours });
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return t("mypage_hub_time_days_ago", { count: diffDays });
  const locale = language === "en" ? "en-US" : "ko-KR";
  return new Date(value).toLocaleDateString(locale, { month: "short", day: "numeric" });
}
