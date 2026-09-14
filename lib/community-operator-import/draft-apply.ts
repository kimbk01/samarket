import type { OperatorContentBlock, OperatorDraftEdit, OperatorNormalizedArticle } from "./types";

export function defaultOperatorDraftEdit(article: OperatorNormalizedArticle): OperatorDraftEdit {
  const imageIncludes: Record<string, boolean> = {};
  article.orderedContentBlocks.forEach((b, i) => {
    if (b.type === "image") imageIncludes[String(i)] = true;
  });
  return {
    displayTitle: article.title,
    displayAuthor: article.author || "",
    displayDate: formatSourceDateForDisplay(article.sourcePublishedDate),
    replaceFrom: "",
    replaceTo: "",
    imageIncludes,
    topicId: null,
    topicSlug: null,
  };
}

export function formatSourceDateForDisplay(raw: string | null | undefined): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  // e.g. 2025-06-24KST19:20:43 → 2025.06.24 19:20
  const m = s.match(/(\d{4})-(\d{2})-(\d{2}).*?(\d{2}):(\d{2})/);
  if (m) return `${m[1]}.${m[2]}.${m[3]} ${m[4]}:${m[5]}`;
  return s.replace(/KST/g, " ").replace(/\s+/g, " ").trim();
}

function applyReplace(text: string, from: string, to: string): string {
  if (!from) return text;
  return text.split(from).join(to);
}

/** AFTER draft blocks: text replacement + image include/exclude; preserves order. */
export function buildAppliedContentBlocks(
  article: OperatorNormalizedArticle,
  edit: OperatorDraftEdit,
): OperatorContentBlock[] {
  const from = edit.replaceFrom || "";
  const to = edit.replaceTo || "";
  const out: OperatorContentBlock[] = [];
  article.orderedContentBlocks.forEach((b, i) => {
    if (b.type === "image") {
      if (edit.imageIncludes[String(i)] === false) return;
      out.push(b);
      return;
    }
    if (b.type === "paragraph" || b.type === "heading" || b.type === "quote") {
      out.push({ ...b, text: applyReplace(b.text, from, to) });
      return;
    }
    if (b.type === "link") {
      out.push({
        ...b,
        text: b.text ? applyReplace(b.text, from, to) : b.text,
      });
      return;
    }
    if (b.type === "list") {
      out.push({
        ...b,
        items: b.items.map((it) => applyReplace(it, from, to)),
      });
      return;
    }
    out.push(b);
  });
  return out;
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
