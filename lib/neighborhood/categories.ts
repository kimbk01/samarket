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

export function normalizeNeighborhoodCategory(raw: string | undefined | null): NeighborhoodCategorySlug | null {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  return (NEIGHBORHOOD_CATEGORY_SLUGS as readonly string[]).includes(s) ? (s as NeighborhoodCategorySlug) : null;
}
