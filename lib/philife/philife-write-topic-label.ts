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

export function philifeWriteTopicOptionLabel(
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
  topic: Pick<PhilifeNeighborhoodWriteTopicOption, "name" | "name_en" | "slug">,
  language: AppLanguageCode
): string {
  return t("philife_write_topic_option_label", {
    name: resolvePhilifeWriteTopicDisplayName(topic, language),
    slug: topic.slug,
  });
}
