/**
 * What actually gets published, per content policy (pure; unit-tested).
 *
 * CONTRACT — community post body = plain-text paragraphs + images only. The community renderer
 * (NeighborhoodInterleavedContent / feed preview) understands `![](url)` and plain text, nothing
 * else, so headings, quotes, lists and links are flattened to readable text here. The source is
 * credited through public_attribution_name/url (the detail page's 출처 block) and the body's last line.
 *
 *  - full          : edited body + all included images (only with recorded rights — see rights.ts)
 *  - summary_link  : thumbnail + short summary (default)
 *  - link_only     : one line naming the source (the 출처 block carries the link)
 * Whenever the 출처 is shown, full and summary bodies also end with `출처: <name> <url>`.
 * Summary order: operator text → the publisher's own per-item summary (feed/excerpt) → the body's
 * leading sentences. Nothing is generated; a site-wide page description is never used.
 */
import { blockPlainText, buildAppliedContentBlocks, collectOrderedImageUrlsForFeed } from "./draft-apply";

export { blockPlainText } from "./draft-apply";
import type { ImportedContentBlock } from "@/lib/community/imported-content-blocks";
import { attributionShown, capPolicyByRights, type SourceRights } from "./rights";
import { applyRulesToBlocks, applyRulesToText, type ImportRule } from "./rules";
import type { ContentPolicy, OperatorContentBlock, OperatorDraftEdit, OperatorNormalizedArticle } from "./types";

const POLICIES: ReadonlySet<ContentPolicy> = new Set(["full", "summary_link", "link_only"]);

/** The source policy is the default; an explicit per-article / bulk choice by the operator wins. */
export function effectivePolicy(sourcePolicy: ContentPolicy, requested?: ContentPolicy | null): ContentPolicy {
  return requested && POLICIES.has(requested) ? requested : sourcePolicy;
}

/**
 * Editor blocks → structured detail blocks (`community_posts.content_blocks`). Image URLs are still
 * source URLs here; publish remaps them to DIBAY copies and the sanitizer drops any that were not copied.
 */
export function toImportedRichBlocks(blocks: OperatorContentBlock[]): ImportedContentBlock[] {
  const out: ImportedContentBlock[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case "paragraph":
        if (b.text.trim()) out.push({ t: "p", text: b.text });
        break;
      case "heading":
        if (b.text.trim()) out.push({ t: "h", level: b.level <= 2 ? 2 : 3, text: b.text });
        break;
      case "list":
        if (b.items.length) out.push({ t: b.ordered ? "ol" : "ul", items: b.items });
        break;
      case "quote":
        if (b.text.trim()) out.push({ t: "quote", text: b.text });
        break;
      case "table":
        if (b.rows.length) out.push({ t: "table", rows: b.rows, header: b.header });
        break;
      case "image":
        out.push({ t: "img", url: b.url, alt: b.alt, caption: b.caption });
        break;
      case "link":
        if (b.href) out.push({ t: "link", href: b.href, text: b.text || b.href });
        break;
    }
  }
  return out;
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
  /** Public 출처 block after the rights rule (hiding is refused where attribution is a duty). */
  attributionVisible: boolean;
  /** The operator asked for more than the rights allow (e.g. full without rights) — capped. */
  cappedByRights: boolean;
  /** Structured detail body (full policy only; source image URLs until publish remaps them). */
  richBlocks: ImportedContentBlock[] | null;
};

const UNVERIFIED: SourceRights = { rightsBasis: "unverified", attributionRequired: true };

export function buildPublishContent(input: {
  article: OperatorNormalizedArticle;
  edit: OperatorDraftEdit;
  sourcePolicy: ContentPolicy;
  sourceName: string;
  rules: ImportRule[];
  /** Missing = unverified: summary + link, 출처 always shown. */
  rights?: SourceRights;
}): PublishContent {
  const { article, edit, rules } = input;
  const rights = input.rights ?? UNVERIFIED;
  const requested = effectivePolicy(input.sourcePolicy, edit.contentPolicy);
  const policy = capPolicyByRights(requested, rights);
  const cappedByRights = policy !== requested;
  const attributionVisible = attributionShown(edit.showAttribution, rights);
  const applied = applyRulesToBlocks(buildAppliedContentBlocks(article, edit), rules);
  const title = applyRulesToText(String(edit.displayTitle || article.title || "").trim(), rules).trim();
  const attributionName = input.sourceName.trim() || article.sourceSite;
  const attributionUrl = article.canonicalUrl;
  const feedImages = collectOrderedImageUrlsForFeed(article, edit, applied);

  // The source is written as the last line of the body whenever it is shown (Owner rule 2026-10-16).
  const sourceLine = `출처: ${attributionName} ${attributionUrl}`.trim();
  if (policy === "full") {
    return {
      policy,
      title,
      blocks: [...toCommunityBlocks(applied), ...(attributionVisible ? [{ type: "paragraph" as const, text: sourceLine }] : [])],
      imageUrls: feedImages,
      attributionName,
      attributionUrl,
      attributionVisible,
      cappedByRights,
      richBlocks: [
        ...toImportedRichBlocks(applied),
        ...(attributionVisible && attributionUrl ? [{ t: "link" as const, href: attributionUrl, text: `출처: ${attributionName}` }] : []),
      ],
    };
  }
  if (policy === "link_only") {
    return {
      policy,
      title,
      blocks: [{ type: "paragraph", text: `${attributionName}에 게시된 글입니다. 아래 출처에서 원문을 확인하세요.` }],
      imageUrls: [],
      attributionName,
      attributionUrl,
      attributionVisible: true,
      cappedByRights,
      richBlocks: null,
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
  blocks.push({ type: "paragraph", text: sourceLine });
  // Summary + link: the link to the original is the point, so the 출처 block always shows.
  return { policy, title, blocks, imageUrls: thumb ? [thumb] : [], attributionName, attributionUrl, attributionVisible: true, cappedByRights, richBlocks: null };
}
