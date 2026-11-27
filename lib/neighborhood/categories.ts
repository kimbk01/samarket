import type { MessageKey } from "@/lib/i18n/messages";
import { type AppLanguageCode } from "@/lib/i18n/config";
import { translate } from "@/lib/i18n/messages";

export const NEIGHBORHOOD_CATEGORY_SLUGS = [
  "question",
  "info",
  "daily",
  "job",
  "food",
  "promo",
  "notice",
  "etc",
] as const;

export type NeighborhoodCategorySlug = (typeof NEIGHBORHOOD_CATEGORY_SLUGS)[number];

/**
 * 서버 응답 `category_label` 의 옛 slug 폴백 — **빈 값**(재감사 2026-11-27 · 설계 §4-5 R5).
 * 서버는 화면 언어를 모르므로 한국어 이름을 넣지 않는다. 화면은 `resolveCommunityTopicUILabel(language, …, slug)` 가
 * `NEIGHBORHOOD_CATEGORY_LABEL_KEYS` 로 화면 언어 이름을 고른다.
 */
export const NEIGHBORHOOD_CATEGORY_LABELS: Record<NeighborhoodCategorySlug, string> = {
  question: "",
  info: "",
  daily: "",
  job: "",
  food: "",
  promo: "",
  notice: "",
  etc: "",
};

export const NEIGHBORHOOD_CATEGORY_LABEL_KEYS: Record<NeighborhoodCategorySlug, MessageKey> = {
  question: "neighborhood_category_question",
  info: "neighborhood_category_info",
  daily: "neighborhood_category_daily",
  job: "neighborhood_category_job",
  food: "neighborhood_category_food",
  promo: "neighborhood_category_promo",
  notice: "neighborhood_category_notice",
  etc: "neighborhood_category_etc",
};

export function normalizeNeighborhoodCategory(raw: string | undefined | null): NeighborhoodCategorySlug | null {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  return (NEIGHBORHOOD_CATEGORY_SLUGS as readonly string[]).includes(s) ? (s as NeighborhoodCategorySlug) : null;
}

export function getNeighborhoodCategoryLabel(
  slug: NeighborhoodCategorySlug,
  language: AppLanguageCode
): string {
  return translate(language, NEIGHBORHOOD_CATEGORY_LABEL_KEYS[slug]);
}
