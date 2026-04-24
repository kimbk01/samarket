import { philifeAppPaths } from "@/lib/philife/paths";

function isPhilifeRecommendSortCategory(slug: string): boolean {
  const s = slug.trim().toLowerCase();
  return s === "recommend" || s === "recommended";
}

/**
 * `CommunityFeed` · 헤더 글쓰기와 동일: 현재 `?category=`(탭)에 맞는 작성 화면 href.
 */
export function buildPhilifeComposeHref(categoryFromUrl: string): string {
  const category = (categoryFromUrl ?? "").trim();
  if (category === "meetup") return philifeAppPaths.writeMeeting;
  if (!category || isPhilifeRecommendSortCategory(category)) return philifeAppPaths.write;
  return `${philifeAppPaths.write}?category=${encodeURIComponent(category)}`;
}
