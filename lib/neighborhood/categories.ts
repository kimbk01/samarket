import type { MessageKey } from "@/lib/i18n/messages";
import { DEFAULT_APP_LANGUAGE, type AppLanguageCode } from "@/lib/i18n/config";
import { translate } from "@/lib/i18n/messages";

export const NEIGHBORHOOD_CATEGORY_SLUGS = [
  "question",
  "info",
  "daily",
  "meetup",
  "job",
  "food",
  "promo",
  "notice",
  "etc",
] as const;

export type NeighborhoodCategorySlug = (typeof NEIGHBORHOOD_CATEGORY_SLUGS)[number];

export const NEIGHBORHOOD_CATEGORY_LABELS: Record<NeighborhoodCategorySlug, string> = {
  question: "질문",
  info: "정보",
  daily: "일상",
  meetup: "모임",
  job: "구인구직",
  food: "맛집",
  promo: "홍보",
  notice: "공지",
  etc: "기타",
};

export const NEIGHBORHOOD_CATEGORY_LABEL_KEYS: Record<NeighborhoodCategorySlug, MessageKey> = {
  question: "neighborhood_category_question",
  info: "neighborhood_category_info",
  daily: "neighborhood_category_daily",
  meetup: "neighborhood_category_meetup",
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
  language: AppLanguageCode = DEFAULT_APP_LANGUAGE
): string {
  return translate(language, NEIGHBORHOOD_CATEGORY_LABEL_KEYS[slug]);
}
