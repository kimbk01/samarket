/**
 * 커뮤니티 편집기 문서(Tiptap JSON) ↔ 서식 블록(`content_blocks`) 변환 (Owner 승인 ① 2026-10-31).
 * 저장 원천은 서버가 정제한 블록이며, 평문 `content` 는 `contentFromRichBlocks` 로 만든다.
 */
import {
  contentFromRichBlocks,
  richBlocksImageUrls,
  sanitizeMemberContentBlocks,
  type ImportedContentBlock,
  type RichRun,
} from "@/lib/community/imported-content-blocks";
import {
  COMMUNITY_IMAGE_NODE,
  type CommunityBodyBlock,
  type CommunityImageNodeAttrs,
} from "@/lib/philife/write-editor/content-codec";

type JsonMark = { type: string; attrs?: Record<string, unknown> };
export type EditorJsonNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: EditorJsonNode[];
  text?: string;
  marks?: JsonMark[];
};

function runsOfInline(nodes: readonly EditorJsonNode[] | undefined): RichRun[] {
  const out: RichRun[] = [];
  for (const n of nodes ?? []) {
    if (n.type === "hardBreak") {
      out.push({ text: "\n" });
      continue;
    }
    if (typeof n.text !== "string" || !n.text) continue;
    const run: RichRun = { text: n.text };
    for (const m of n.marks ?? []) {
      if (m.type === "bold") run.b = true;
      else if (m.type === "italic") run.i = true;
      else if (m.type === "link" && typeof m.attrs?.href === "string") run.href = m.attrs.href;
    }
    out.push(run);
  }
  return out;
}

function plainOf(node: EditorJsonNode): string {
  if (typeof node.text === "string") return node.text;
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? []).map(plainOf).join(node.type === "tableRow" ? " " : "");
}

/** 블록 노드 안의 문단들을 하나의 조각 열로 (문단 사이 줄바꿈) */
function runsOfBlockChildren(children: readonly EditorJsonNode[] | undefined, sep: string): RichRun[] {
  const out: RichRun[] = [];
  for (const c of children ?? []) {
    const runs =
      c.type === "paragraph" || c.type === "heading"
        ? runsOfInline(c.content)
        : [{ text: plainOf(c) } as RichRun];
    if (!runs.some((r) => r.text.trim())) continue;
    if (out.length) out.push({ text: sep });
    out.push(...runs);
  }
  return out;
}

function listItems(list: EditorJsonNode, acc: RichRun[][]): void {
  for (const li of list.content ?? []) {
    const own = (li.content ?? []).filter((c) => c.type !== "bulletList" && c.type !== "orderedList");
    const runs = runsOfBlockChildren(own, " ");
    if (runs.length) acc.push(runs);
    /** 중첩 목록은 같은 목록의 다음 항목으로 펼친다(저장 형식은 1단 목록) */
    for (const nested of li.content ?? []) {
      if (nested.type === "bulletList" || nested.type === "orderedList") listItems(nested, acc);
    }
  }
}

function imageBlockOf(node: EditorJsonNode): ImportedContentBlock | null {
  const a = (node.attrs ?? {}) as Partial<CommunityImageNodeAttrs> & { caption?: string };
  if (a.status !== "done" || !a.src) return null;
  return { t: "img", url: a.src, alt: a.alt || null, caption: (a.caption ?? "").trim() || null };
}

/** 목록·인용·표 안에 들어간 사진 — 저장 형식은 사진을 최상위 블록으로만 두므로 그 블록 바로 뒤로 꺼낸다 */
function nestedImageBlocks(node: EditorJsonNode, acc: ImportedContentBlock[]): void {
  for (const c of node.content ?? []) {
    if (c.type === COMMUNITY_IMAGE_NODE) {
      const b = imageBlockOf(c);
      if (b) acc.push(b);
    } else nestedImageBlocks(c, acc);
  }
}

/** 편집기 문서 → 서식 블록(정제 전). 업로드 중·실패 사진은 넣지 않는다. */
export function editorDocToRichBlocks(doc: EditorJsonNode): ImportedContentBlock[] {
  const out: ImportedContentBlock[] = [];
  for (const node of doc.content ?? []) {
    switch (node.type) {
      case "paragraph": {
        const runs = runsOfInline(node.content);
        if (runs.some((r) => r.text.trim())) out.push({ t: "p", text: runs.map((r) => r.text).join(""), runs });
        break;
      }
      case "heading": {
        const text = plainOf(node).replace(/\s+/g, " ").trim();
        const level = Number(node.attrs?.level ?? 2) <= 2 ? 2 : 3;
        if (text) out.push({ t: "h", level, text });
        break;
      }
      case "bulletList":
      case "orderedList": {
        const itemRuns: RichRun[][] = [];
        listItems(node, itemRuns);
        if (itemRuns.length) {
          out.push({
            t: node.type === "bulletList" ? "ul" : "ol",
            items: itemRuns.map((r) => r.map((x) => x.text).join("")),
            itemRuns,
          });
        }
        nestedImageBlocks(node, out);
        break;
      }
      case "blockquote": {
        const runs = runsOfBlockChildren(node.content, "\n");
        if (runs.length) out.push({ t: "quote", text: runs.map((r) => r.text).join(""), runs });
        nestedImageBlocks(node, out);
        break;
      }
      case "table": {
        const rows = (node.content ?? []).map((row) => (row.content ?? []).map((cell) => plainOf(cell).replace(/\s+/g, " ").trim()));
        const header = (node.content?.[0]?.content ?? []).every((c) => c.type === "tableHeader");
        if (rows.some((r) => r.some(Boolean))) out.push({ t: "table", rows, header });
        nestedImageBlocks(node, out);
        break;
      }
      case COMMUNITY_IMAGE_NODE: {
        const b = imageBlockOf(node);
        if (b) out.push(b);
        break;
      }
      default: {
        const text = plainOf(node).trim();
        if (text) out.push({ t: "p", text });
      }
    }
  }
  return out;
}

function inlineFromRuns(runs: readonly RichRun[] | undefined, text: string): EditorJsonNode[] {
  const src = runs?.length ? runs : [{ text }];
  const out: EditorJsonNode[] = [];
  for (const r of src) {
    const parts = r.text.split("\n");
    parts.forEach((part, i) => {
      if (i > 0) out.push({ type: "hardBreak" });
      if (!part) return;
      const marks: JsonMark[] = [];
      if ("b" in r && r.b) marks.push({ type: "bold" });
      if ("i" in r && r.i) marks.push({ type: "italic" });
      if ("href" in r && r.href) marks.push({ type: "link", attrs: { href: r.href } });
      out.push(marks.length ? { type: "text", text: part, marks } : { type: "text", text: part });
    });
  }
  return out;
}

function paragraph(content: EditorJsonNode[]): EditorJsonNode {
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
}

function imageNode(src: string, alt: string, caption: string): EditorJsonNode {
  return {
    type: COMMUNITY_IMAGE_NODE,
    attrs: { src, alt, caption, uploadId: null, status: "done", error: null, preview: null, pasteSrc: null },
  };
}

/** 서식 블록(저장본) → 편집기 문서 — 수정 화면 시드 */
export function richBlocksToEditorDoc(blocks: readonly ImportedContentBlock[]): EditorJsonNode {
  const content: EditorJsonNode[] = [];
  for (const b of blocks) {
    switch (b.t) {
      case "p":
        content.push(paragraph(inlineFromRuns(b.runs, b.text)));
        break;
      case "h":
        content.push({ type: "heading", attrs: { level: b.level }, content: [{ type: "text", text: b.text }] });
        break;
      case "ul":
      case "ol":
        content.push({
          type: b.t === "ul" ? "bulletList" : "orderedList",
          content: b.items.map((it, j) => ({
            type: "listItem",
            content: [paragraph(inlineFromRuns(b.itemRuns?.[j], it))],
          })),
        });
        break;
      case "quote":
        content.push({ type: "blockquote", content: [paragraph(inlineFromRuns(b.runs, b.text))] });
        break;
      case "table":
        content.push({
          type: "table",
          content: b.rows.map((row, r) => ({
            type: "tableRow",
            content: row.map((cell) => ({
              type: b.header && r === 0 ? "tableHeader" : "tableCell",
              content: [paragraph(cell ? [{ type: "text", text: cell }] : [])],
            })),
          })),
        });
        break;
      case "img":
        content.push(imageNode(b.url, b.alt ?? "", b.caption ?? ""));
        break;
      case "link":
        content.push(
          paragraph([{ type: "text", text: b.text || b.href, marks: [{ type: "link", attrs: { href: b.href } }] }])
        );
        break;
    }
  }
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

/** 예전 평문 본문(줄 단위 블록) → 편집기 문서 */
export function plainBlocksToEditorDoc(blocks: readonly CommunityBodyBlock[]): EditorJsonNode {
  const content = blocks.map((b) =>
    b.type === "image" ? imageNode(b.src, b.alt, "") : paragraph(b.text ? [{ type: "text", text: b.text }] : [])
  );
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

export type RichDocSnapshot = {
  /** 저장할 블록(클라이언트 정제본 — 서버가 다시 정제) */
  blocks: ImportedContentBlock[];
  /** 서버와 같은 규칙으로 만든 평문(검증·변경 감지용) */
  content: string;
  /** 본문 사진(완료분, 본문 순서) */
  imageUrls: string[];
  uploadingCount: number;
  failedCount: number;
  /** 업로드 중·실패 포함 사진 노드 수(10장 제한) */
  imageNodeCount: number;
};

function countImages(node: EditorJsonNode, acc: { all: number; uploading: number; failed: number }): void {
  if (node.type === COMMUNITY_IMAGE_NODE) {
    const a = (node.attrs ?? {}) as Partial<CommunityImageNodeAttrs>;
    acc.all += 1;
    if (a.status === "uploading") acc.uploading += 1;
    else if (a.status === "failed" || !a.src) acc.failed += 1;
  }
  for (const c of node.content ?? []) countImages(c, acc);
}

export function editorDocToRichSnapshot(doc: EditorJsonNode): RichDocSnapshot {
  const blocks = sanitizeMemberContentBlocks(editorDocToRichBlocks(doc));
  const counts = { all: 0, uploading: 0, failed: 0 };
  countImages(doc, counts);
  return {
    blocks,
    content: contentFromRichBlocks(blocks),
    imageUrls: richBlocksImageUrls(blocks),
    uploadingCount: counts.uploading,
    failedCount: counts.failed,
    imageNodeCount: counts.all,
  };
}
