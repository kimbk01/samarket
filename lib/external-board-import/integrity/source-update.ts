import type { ExternalBoardArticleSignal } from "@/lib/external-board-import/product-lock";

/**
 * Same source identity forever. Fingerprint change on a published article
 * is SOURCE_UPDATED — never a new Community post.
 */
export function classifySourceUpdateSignal(input: {
  previousFingerprint: string;
  nextFingerprint: string;
  publishedPostId: string | null;
}): ExternalBoardArticleSignal {
  const prev = String(input.previousFingerprint ?? "");
  const next = String(input.nextFingerprint ?? "");
  if (input.publishedPostId) {
    if (prev && next && prev !== next) return "SOURCE_UPDATED";
    return "SAME_PUBLISHED";
  }
  if (prev && next && prev === next) return "UNCHANGED";
  if (prev && next && prev !== next) return "SOURCE_UPDATED";
  return "NEW";
}
