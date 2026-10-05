/**
 * What actually gets published, per content policy (pure; unit-tested).
 *  - full          : edited body + images (only for sources with republication rights)
 *  - summary_link  : thumbnail + short summary + link to the original (default)
 *  - link_only     : title + link to the original
 * Summaries are either the operator's text, the publisher's own summary, or the article's
 * leading sentences cut at a boundary — nothing is generated.
 */
import { buildAppliedContentBlocks, collectOrderedImageUrlsForFeed } from "./draft-apply";
import { applyRulesToBlocks, applyRulesToText, type ImportRule } from "./rules";
import type { ContentPolicy, OperatorContentBlock, OperatorDraftEdit, OperatorNormalizedArticle } from "./types";

const POLICY_RANK: Record<ContentPolicy, number> = { full: 2, summary_link: 1, link_only: 0 };

/** Article policy may only narrow the source policy. */
export function effectivePolicy(sourcePolicy: ContentPolicy, requested?: ContentPolicy | null): ContentPolicy {
  if (!requested || !(requested in POLICY_RANK)) return sourcePolicy;
  return POLICY_RANK[requested] <= POLICY_RANK[sourcePolicy] ? requested : sourcePolicy;
}

/** Leading sentences of the body, at most `max` chars, cut on a sentence or word boundary. */
export function leadSummary(blocks: OperatorContentBlock[], max = 300): string {
  const text = blocks
    .filter((b): b is Extract<OperatorContentBlock, { type: "paragraph" }> => b.type === "paragraph")
    .map((b) => b.text.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const sentenceEnd = Math.max(
    head.lastIndexOf(". "),
    head.lastIndexOf("다. "),
    head.lastIndexOf("! "),
    head.lastIndexOf("? "),
    head.lastIndexOf("요. "),
  );
  if (sentenceEnd >= max * 0.5) return head.slice(0, sentenceEnd + 1).trim();
  const space = head.lastIndexOf(" ");
  return `${(space > max * 0.6 ? head.slice(0, space) : head).trim()}…`;
}

export type PublishContent = {
  policy: ContentPolicy;
  title: string;
  /** Blocks before image ingest (image URLs are still source URLs). */
  blocks: OperatorContentBlock[];
  /** Source image URLs to ingest, feed order (thumbnail first). */
  imageUrls: string[];
  attributionName: string;
  attributionUrl: string;
};

export function buildPublishContent(input: {
  article: OperatorNormalizedArticle;
  edit: OperatorDraftEdit;
  sourcePolicy: ContentPolicy;
  sourceName: string;
  rules: ImportRule[];
}): PublishContent {
  const { article, edit, rules } = input;
  const policy = effectivePolicy(input.sourcePolicy, edit.contentPolicy);
  const applied = applyRulesToBlocks(buildAppliedContentBlocks(article, edit), rules);
  const title = applyRulesToText(String(edit.displayTitle || article.title || "").trim(), rules).trim();
  const attributionName = input.sourceName.trim() || article.sourceSite;
  const attributionUrl = article.canonicalUrl;
  const sourceLink: OperatorContentBlock = {
    type: "link",
    href: attributionUrl,
    text: policy === "full" ? `출처: ${attributionName}` : `원문 보기 — ${attributionName}`,
  };
  const feedImages = collectOrderedImageUrlsForFeed(article, edit, applied);

  if (policy === "full") {
    return { policy, title, blocks: [...applied, sourceLink], imageUrls: feedImages, attributionName, attributionUrl };
  }
  if (policy === "link_only") {
    return { policy, title, blocks: [sourceLink], imageUrls: [], attributionName, attributionUrl };
  }
  const summary = applyRulesToText(
    String(edit.summaryText || "").trim() || String(article.summary || "").trim() || leadSummary(applied),
    rules,
  ).trim();
  const thumb = feedImages[0];
  const blocks: OperatorContentBlock[] = [];
  if (thumb) blocks.push({ type: "image", url: thumb, displaySrc: thumb, alt: null, caption: null });
  if (summary) blocks.push({ type: "paragraph", text: summary });
  blocks.push(sourceLink);
  return { policy, title, blocks, imageUrls: thumb ? [thumb] : [], attributionName, attributionUrl };
}
