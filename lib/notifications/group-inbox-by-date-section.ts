import type { AppLanguageCode } from "@/lib/i18n/config";
import { DEFAULT_APP_LANGUAGE } from "@/lib/i18n/config";
import { translate } from "@/lib/i18n/messages";
import type { InboxGroupItem } from "@/lib/notifications/group-inbox-by-thread";

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function sectionKeyRank(key: string): number {
  if (key === "today") return Number.MAX_SAFE_INTEGER;
  if (key === "yesterday") return Number.MAX_SAFE_INTEGER - 1;
  if (key.startsWith("d:")) return Number(key.slice(2));
  return 0;
}

export type InboxDateSection = {
  sectionKey: string;
  sectionLabel: string;
  items: InboxGroupItem[];
};

/**
 * 인박스 그룹 행을 **기기 로컬 날짜** 기준으로 오늘 / 어제 / 그 외 섹션으로 나눈다.
 * 각 섹션 안 순서는 `items` 입력 순서를 유지한다(이미 최신순이면 그대로).
 */
export function groupInboxItemsByDateSection(
  items: InboxGroupItem[],
  language: AppLanguageCode = DEFAULT_APP_LANGUAGE
): InboxDateSection[] {
  if (items.length === 0) return [];

  const now = new Date();
  const todayStart = startOfLocalDay(now);
  const yesterdayStart = todayStart - 86400000;

  const locale = language === "ko" ? "ko-KR" : language === "zh-CN" ? "zh-CN" : "en-US";

  const buckets = new Map<string, InboxGroupItem[]>();
  const discovery: string[] = [];

  for (const item of items) {
    const dayStart = startOfLocalDay(new Date(item.created_at));
    let key: string;
    if (dayStart === todayStart) key = "today";
    else if (dayStart === yesterdayStart) key = "yesterday";
    else key = `d:${dayStart}`;

    if (!buckets.has(key)) {
      buckets.set(key, []);
      discovery.push(key);
    }
    buckets.get(key)!.push(item);
  }

  const keys = [...new Set(discovery)].sort((a, b) => sectionKeyRank(b) - sectionKeyRank(a));

  return keys.map((key) => {
    const list = buckets.get(key) ?? [];
    let sectionLabel: string;
    if (key === "today") sectionLabel = translate(language, "notif_section_today");
    else if (key === "yesterday") sectionLabel = translate(language, "notif_section_yesterday");
    else {
      const ms = Number(key.slice(2));
      sectionLabel = new Date(ms).toLocaleDateString(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    }
    return { sectionKey: key, sectionLabel, items: list };
  });
}
