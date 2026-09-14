import type { OperatorContentBlock, OperatorDraftEdit, OperatorNormalizedArticle } from "./types";

export function defaultOperatorDraftEdit(article: OperatorNormalizedArticle): OperatorDraftEdit {
  const imageIncludes: Record<string, boolean> = {};
  const imageOrder: number[] = [];
  article.orderedContentBlocks.forEach((b, i) => {
    if (b.type === "image") {
      imageIncludes[String(i)] = true;
      imageOrder.push(i);
    }
  });
  return {
    displayTitle: article.title,
    displayAuthor: article.author || "",
    displayDate: formatSourceDateForDisplay(article.sourcePublishedDate),
    replaceFrom: "",
    replaceTo: "",
    imageIncludes,
    blockExcludes: {},
    textOverrides: {},
    imageOrder,
    thumbnailImageIndex: imageOrder[0] ?? null,
    topicId: null,
    topicSlug: null,
  };
}

export function formatSourceDateForDisplay(raw: string | null | undefined): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  const m = s.match(/(\d{4})-(\d{2})-(\d{2}).*?(\d{2}):(\d{2})/);
  if (m) return `${m[1]}.${m[2]}.${m[3]} ${m[4]}:${m[5]}`;
  return s.replace(/KST/g, " ").replace(/\s+/g, " ").trim();
}

function applyReplace(text: string, from: string, to: string): string {
  if (!from) return text;
  return text.split(from).join(to);
}

function applyTextField(
  sourceIndex: number,
  text: string,
  edit: OperatorDraftEdit,
): string {
  const override = edit.textOverrides?.[String(sourceIndex)];
  const base = override != null ? String(override) : text;
  return applyReplace(base, edit.replaceFrom || "", edit.replaceTo || "");
}

/** AFTER draft blocks: overrides, excludes, replace, image order; preserves semantic interleave slots. */
export function buildAppliedContentBlocks(
  article: OperatorNormalizedArticle,
  edit: OperatorDraftEdit,
): OperatorContentBlock[] {
  const excludes = edit.blockExcludes || {};
  const includes = edit.imageIncludes || {};

  const includedImageIndices = article.orderedContentBlocks
    .map((b, i) => ({ b, i }))
    .filter((x) => x.b.type === "image" && includes[String(x.i)] !== false)
    .map((x) => x.i);

  const orderRaw = Array.isArray(edit.imageOrder) ? edit.imageOrder.map((n) => Number(n)) : [];
  const orderedImages = [
    ...orderRaw.filter((i) => includedImageIndices.includes(i)),
    ...includedImageIndices.filter((i) => !orderRaw.includes(i)),
  ];

  let imageCursor = 0;
  const out: OperatorContentBlock[] = [];

  article.orderedContentBlocks.forEach((b, i) => {
    if (b.type === "image") {
      if (includes[String(i)] === false) return;
      // Consume next image from orderedImages for this slot (slot count = included images)
      const srcIdx = orderedImages[imageCursor++];
      if (srcIdx == null) return;
      const src = article.orderedContentBlocks[srcIdx];
      if (!src || src.type !== "image") return;
      out.push(src);
      return;
    }
    if (excludes[String(i)] === true) return;

    if (b.type === "paragraph" || b.type === "heading" || b.type === "quote") {
      out.push({ ...b, text: applyTextField(i, b.text, edit) } as OperatorContentBlock);
      return;
    }
    if (b.type === "link") {
      out.push({
        ...b,
        text: b.text ? applyTextField(i, b.text, edit) : b.text,
      });
      return;
    }
    if (b.type === "list") {
      const override = edit.textOverrides?.[String(i)];
      if (override != null) {
        const items = String(override)
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        out.push({ ...b, items: items.length ? items : b.items.map((it) => applyReplace(it, edit.replaceFrom || "", edit.replaceTo || "")) });
      } else {
        out.push({
          ...b,
          items: b.items.map((it) => applyReplace(it, edit.replaceFrom || "", edit.replaceTo || "")),
        });
      }
      return;
    }
    out.push(b);
  });
  return out;
}

/** Ordered public image URLs for community_posts.images (thumbnail first). */
export function collectOrderedImageUrlsForFeed(
  article: OperatorNormalizedArticle,
  edit: OperatorDraftEdit,
  appliedBlocks: OperatorContentBlock[],
): string[] {
  const urls = collectIncludedImageUrls(appliedBlocks);
  const thumbIdx = edit.thumbnailImageIndex;
  if (thumbIdx == null || !Number.isFinite(thumbIdx)) return urls;
  if (edit.imageIncludes[String(thumbIdx)] === false) return urls;
  const block = article.orderedContentBlocks[thumbIdx];
  if (!block || block.type !== "image") return urls;
  const thumbUrl = block.url;
  const rest = urls.filter((u) => u !== thumbUrl);
  return [thumbUrl, ...rest];
}

/** Normal Community body: interleaved markdown with ![](url) preserving order. */
export function blocksToCommunityMarkdown(blocks: OperatorContentBlock[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.type === "paragraph") parts.push(b.text);
    else if (b.type === "heading") parts.push(`${"#".repeat(Math.min(6, Math.max(1, b.level)))} ${b.text}`);
    else if (b.type === "quote") parts.push(`> ${b.text}`);
    else if (b.type === "image") parts.push(`![](${b.url})`);
    else if (b.type === "link") {
      if (b.href && b.text) parts.push(`[${b.text}](${b.href})`);
      else if (b.href) parts.push(b.href);
      else if (b.text) parts.push(b.text);
    } else if (b.type === "list") {
      parts.push(b.items.map((it, i) => (b.ordered ? `${i + 1}. ${it}` : `- ${it}`)).join("\n"));
    }
  }
  return parts.join("\n\n").trim();
}

/** Remap image URLs inside blocks (after DIBAY ingest). */
export function remapBlockImageUrls(
  blocks: OperatorContentBlock[],
  urlMap: Map<string, string>,
): OperatorContentBlock[] {
  return blocks.map((b) => {
    if (b.type !== "image") return b;
    const next = urlMap.get(b.url) || urlMap.get(b.displaySrc || "") || b.url;
    return { ...b, url: next, displaySrc: next };
  });
}

export function collectIncludedImageUrls(blocks: OperatorContentBlock[]): string[] {
  return blocks.filter((b): b is Extract<OperatorContentBlock, { type: "image" }> => b.type === "image").map((b) => b.url);
}

export function assertPublishGuards(input: {
  selectedArticleKeys: string[];
  topicId: string | null | undefined;
  topicSlug: string | null | undefined;
}): { ok: true } | { ok: false; code: string; message: string } {
  const keys = (input.selectedArticleKeys || []).map((k) => String(k).trim()).filter(Boolean);
  if (keys.length === 0) {
    return { ok: false, code: "no_selection", message: "게시할 글을 선택하세요." };
  }
  const topicId = String(input.topicId || "").trim();
  const topicSlug = String(input.topicSlug || "").trim();
  if (!topicId || !topicSlug) {
    return { ok: false, code: "topic_required", message: "DIBAY 주제를 선택하세요. 기본 주제 자동 선택이 없습니다." };
  }
  return { ok: true };
}
