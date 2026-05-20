import type { AppLanguageCode } from "./config";
import { localeTagForAppLanguage } from "./locale-for-app-language";
import { translateText, type MessageKey } from "./messages";

/** 피드·목록 등 UI 상대 시각 (게시글 본문 아님) */
export function formatRelativeTimeAgo(isoString: string, lang: AppLanguageCode): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / (1000 * 60));
  const diffHour = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDay = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const loc = localeTagForAppLanguage(lang);

  const tr = (key: MessageKey, vars?: Record<string, string | number>) => translateText(lang, key, vars);

  if (diffMin < 1) return tr("mypage_hub_time_just_now");
  if (diffMin < 60) return tr("mypage_hub_time_minutes_ago", { count: diffMin });
  if (diffHour < 24) return tr("mypage_hub_time_hours_ago", { count: diffHour });
  if (diffDay < 7) return tr("mypage_hub_time_days_ago", { count: diffDay });
  return date.toLocaleDateString(loc, { month: "short", day: "numeric" });
}
