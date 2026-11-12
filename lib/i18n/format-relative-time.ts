import type { AppLanguageCode } from "./config";
import { localeTagForAppLanguage } from "./locale-for-app-language";
import { translate, type MessageKey } from "./messages";

/**
 * 날짜 서식기는 언어별 1개만 만들어 다시 쓴다 — `toLocaleDateString` 은 부를 때마다 서식기를 새로 만든다
 * (C4 · 샤오미 첫 화면 측정 10~16ms). 같은 언어·옵션이라 결과는 같다.
 */
const monthDayFormatters = new Map<string, Intl.DateTimeFormat>();
function monthDayFormatter(loc: string): Intl.DateTimeFormat {
  let f = monthDayFormatters.get(loc);
  if (!f) {
    f = new Intl.DateTimeFormat(loc, { month: "short", day: "numeric" });
    monthDayFormatters.set(loc, f);
  }
  return f;
}

/** 피드·목록 등 UI 상대 시각 (게시글 본문 아님) */
export function formatRelativeTimeAgo(isoString: string, lang: AppLanguageCode): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / (1000 * 60));
  const diffHour = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDay = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const loc = localeTagForAppLanguage(lang);

  const tr = (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars);

  if (diffMin < 1) return tr("mypage_hub_time_just_now");
  if (diffMin < 60) return tr("mypage_hub_time_minutes_ago", { count: diffMin });
  if (diffHour < 24) return tr("mypage_hub_time_hours_ago", { count: diffHour });
  if (diffDay < 7) return tr("mypage_hub_time_days_ago", { count: diffDay });
  return monthDayFormatter(loc).format(date);
}
