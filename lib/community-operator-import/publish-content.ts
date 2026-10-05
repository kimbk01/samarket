/**
 * What actually gets published, per content policy (pure; unit-tested).
 *
 * CONTRACT — community post body = plain-text paragraphs + images only. The community renderer
 * (NeighborhoodInterleavedContent / feed preview) understands `![](url)` and plain text, nothing
 * else, so headings, quotes, lists and links are flattened to readable text here. The source is
 * credited only through public_attribution_name/url (the detail page's 출처 block) — never inline.
 *
 *  - full          : edited body + images (only for sources with republication rights)
 *  - summary_link  : thumbnail + short summary (default)
 *  - link_only     : one line naming the source (the 출처 block carries the link)
 * Summary order: operator text → the publisher's own per-item summary (feed/excerpt) → the body's
 * leading sentences. Nothing is generated; a site-wide page description is never used.
 */
import { blockPlainText, buildAppliedContentBlocks, collectOrderedImageUrlsForFeed } from "./draft-apply";

export { blockPlainText } from "./draft-apply";
import { applyRulesToBlocks, applyRulesToText, type ImportRule } from "./rules";
import type { ContentPolicy, OperatorContentBlock, OperatorDraftEdit, OperatorNormalizedArticle } from "./types";

const POLICY_RANK: Record<ContentPolicy, number> = { full: 2, summary_link: 1, link_only: 0 };

/** Article policy may only narrow the source policy. */
export function effectivePolicy(sourcePolicy: ContentPolicy, requested?: ContentPolicy | null): ContentPolicy {
  if (!requested || !(requested in POLICY_RANK)) return sourcePolicy;
  return POLICY_RANK[requested] <= POLICY_RANK[sourcePolicy] ? requested : sourcePolicy;
}

/** Flatten editor blocks to the community body contract: paragraphs + images only. */
export function toCommunityBlocks(blocks: OperatorContentBlock[]): OperatorContentBlock[] {
  const out: OperatorContentBlock[] = [];
  for (const b of blocks) {
    if (b.type === "image") {
      out.push(b);
      continue;
    }
    const text = blockPlainText(b);
    if (text) out.push({ type: "paragraph", text });
  }
  return out;
}

/** Leading sentences of the body, at most `max` chars, cut on a sentence or word boundary. */
export function leadSummary(blocks: OperatorContentBlock[], max = 300): string {
  const text = blocks
    .filter((b) => b.type === "paragraph" || b.type === "heading" || b.type === "quote" || b.type === "list")
    .map((b) => blockPlainText(b))
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
  const feedImages = collectOrderedImageUrlsForFeed(article, edit, applied);

  if (policy === "full") {
    return { policy, title, blocks: toCommunityBlocks(applied), imageUrls: feedImages, attributionName, attributionUrl };
  }
  if (policy === "link_only") {
    return {
      policy,
      title,
      blocks: [{ type: "paragraph", text: `${attributionName}에 게시된 글입니다. 아래 출처에서 원문을 확인하세요.` }],
      imageUrls: [],
      attributionName,
      attributionUrl,
    };
  }
  const summary = applyRulesToText(
    String(edit.summaryText || "").trim() || String(article.summary || "").trim() || leadSummary(applied) || title,
    rules,
  ).trim();
  // No image in the article body at all → the page/feed preview image (og:image, media:content),
  // unless it is clearly a site-wide logo/share image.
  const hasBodyImage = article.orderedContentBlocks.some((b) => b.type === "image");
  const og = article.extraction?.ogImage ?? null;
  const thumb = feedImages[0] ?? (!hasBodyImage && og && !/logo|default|og[-_]?img|share[-_]?img/i.test(og) ? og : undefined);
  const blocks: OperatorContentBlock[] = [];
  if (thumb) blocks.push({ type: "image", url: thumb, displaySrc: thumb, alt: null, caption: null });
  if (summary) blocks.push({ type: "paragraph", text: summary });
  return { policy, title, blocks, imageUrls: thumb ? [thumb] : [], attributionName, attributionUrl };
}
