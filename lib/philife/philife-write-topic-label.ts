import type { AppLanguageCode } from "@/lib/i18n/config";
import type { PhilifeNeighborhoodWriteTopicOption } from "@/lib/neighborhood/philife-neighborhood-topics";
import type { MessageKey } from "@/lib/i18n/messages";

export function resolvePhilifeWriteTopicDisplayName(
  topic: Pick<PhilifeNeighborhoodWriteTopicOption, "name" | "name_en" | "slug">,
  language: AppLanguageCode
): string {
  if (language === "en") {
    const en = topic.name_en?.trim();
    if (en) return en;
  }
  return topic.name?.trim() || topic.slug.trim();
}

/** 회원 글쓰기 주제 라벨 — 이름만 표시(slug 비노출, CM-W-01) */
export function philifeWriteTopicOptionLabel(
  _t: (key: MessageKey, params?: Record<string, string | number>) => string,
  topic: Pick<PhilifeNeighborhoodWriteTopicOption, "name" | "name_en" | "slug">,
  language: AppLanguageCode
): string {
  return resolvePhilifeWriteTopicDisplayName(topic, language);
}
