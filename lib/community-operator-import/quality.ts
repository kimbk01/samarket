/**
 * QUALITY GATE — compares what the source page had with what was extracted.
 * Short notices and image-less posts are valid (FULL) when the source itself has no images.
 */
import { BODY_SELECTOR_CHANGED, blockStats } from "./normalize";
import type { OperatorNormalizedArticle, QualityVerdict } from "./types";

export type QualityResult = { verdict: QualityVerdict; reasons: string[] };

export { QUALITY_REASON_LABELS } from "./quality-labels";

export function assessArticleQuality(article: OperatorNormalizedArticle): QualityResult {
  const reasons: string[] = [];
  const stats = blockStats(article.orderedContentBlocks);
  const ex = article.extraction;

  if (!article.title.trim()) reasons.push("title_missing");
  if (stats.textChars === 0 && stats.imageCount === 0) reasons.push("body_missing");
  if (reasons.includes("title_missing") || reasons.includes("body_missing")) {
    return { verdict: "FAILED", reasons };
  }

  if (ex) {
    // Duplicates (thumb + original of the same image) can inflate the page count;
    // only flag when clearly fewer distinct images were kept.
    if (ex.sourceImageCount > 0 && stats.imageCount === 0) reasons.push("images_missing");
    else if (ex.sourceImageCount >= 3 && stats.imageCount < Math.ceil(ex.sourceImageCount / 2)) {
      reasons.push("images_missing");
    }
    if (ex.usedFeedFallback) reasons.push("feed_fallback");
    if (ex.warnings?.includes(BODY_SELECTOR_CHANGED)) reasons.push("structure_changed");
  }
  if (stats.entityLeak) reasons.push("entity_leak");
  if (!article.sourcePublishedDate) reasons.push("date_missing");

  return { verdict: reasons.length ? "PARTIAL" : "FULL", reasons };
}

export function withQuality(article: OperatorNormalizedArticle): OperatorNormalizedArticle {
  return { ...article, quality: assessArticleQuality(article) };
}
