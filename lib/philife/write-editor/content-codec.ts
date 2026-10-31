/**
 * 커뮤니티 본문 변환층 — 편집기 블록 ↔ 기존 `community_posts.content` 계약(평문 + 독립 줄 `![alt](url)`).
 *
 * 규칙(줄 단위, 무손실):
 * - 한 줄 = 한 블록. 줄 전체가 `![alt](url)` 이면 이미지 블록, 아니면 문단 블록(빈 줄 = 빈 문단).
 * - 직렬화 = 블록을 `\n` 으로 이어 붙임 → 파싱→직렬화가 원문과 바이트 단위로 같다.
 * - 줄 안에 섞인 이미지 문법, CR(`\r`) 등 무손실로 다룰 수 없는 본문은 `ok:false` — 호출부는 기존 편집기로 연다.
 *
 * DB 저장 형식은 바꾸지 않는다(요약 트리거·해시태그 검색·관리자 textarea·리비전이 같은 문자열을 쓴다).
 */

export type CommunityBodyBlock =
  | { type: "paragraph"; text: string }
  | { type: "image"; src: string; alt: string };

export type CommunityBodyParseResult =
  | { ok: true; blocks: CommunityBodyBlock[] }
  | { ok: false; reason: "carriage_return" | "inline_image" | "roundtrip_mismatch" };

/** 줄 전체가 이미지 마크다운인 경우만 — 앞뒤 공백·다른 글자가 있으면 이미지 블록이 아니다 */
const IMAGE_LINE_RE = /^!\[([^\]\n]*)\]\(([^()\s]+)\)$/;
/** 줄 안 어딘가에 이미지 문법이 있는지(렌더러 `IMG_RE` 와 같은 모양) */
const ANY_IMAGE_SYNTAX_RE = /!\[[^\]]*\]\([^)]+\)/;

export function serializeCommunityBodyBlocks(blocks: readonly CommunityBodyBlock[]): string {
  return blocks.map((b) => (b.type === "image" ? `![${b.alt}](${b.src})` : b.text)).join("\n");
}

export function parseCommunityBodyToBlocks(content: string | null | undefined): CommunityBodyParseResult {
  const src = content ?? "";
  if (src.includes("\r")) return { ok: false, reason: "carriage_return" };
  const blocks: CommunityBodyBlock[] = [];
  for (const line of src.split("\n")) {
    const m = IMAGE_LINE_RE.exec(line);
    if (m) {
      blocks.push({ type: "image", alt: m[1] ?? "", src: m[2] ?? "" });
      continue;
    }
    if (ANY_IMAGE_SYNTAX_RE.test(line)) return { ok: false, reason: "inline_image" };
    blocks.push({ type: "paragraph", text: line });
  }
  if (serializeCommunityBodyBlocks(blocks) !== src) return { ok: false, reason: "roundtrip_mismatch" };
  return { ok: true, blocks };
}

/** 붙여넣기 등 외부 텍스트 → 블록(이미지 줄 인식). 무손실 보장 대상이 아니라 입력 정리용. */
export function textToCommunityBodyBlocks(text: string): CommunityBodyBlock[] {
  const normalized = text.replace(/\r\n?/g, "\n");
  return normalized.split("\n").map((line): CommunityBodyBlock => {
    const m = IMAGE_LINE_RE.exec(line.trim());
    return m ? { type: "image", alt: m[1] ?? "", src: m[2] ?? "" } : { type: "paragraph", text: line };
  });
}

/* ── ProseMirror JSON 매핑 (Tiptap 문서 형식) ─────────────────────────────── */

export const COMMUNITY_IMAGE_NODE = "dibayImage";

export type CommunityImageNodeAttrs = {
  src: string;
  alt: string;
  /** 업로드 추적용(직렬화 안 함) */
  uploadId: string | null;
  status: "done" | "uploading" | "failed";
  error: string | null;
  /** 업로드 중 미리보기(blob:) 또는 붙여넣기 원본 URL — 저장하지 않음 */
  preview: string | null;
  /** 사진 설명(서식 본문 `img.caption`) */
  caption?: string;
  /** 붙여넣은 HTML 의 원본 사진 주소 — 편집기가 업로드를 시작하면 비운다 */
  pasteSrc?: string | null;
};

type PmNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PmNode[];
  text?: string;
};

export function communityBodyBlocksToDoc(blocks: readonly CommunityBodyBlock[]): PmNode {
  const content: PmNode[] = blocks.map((b) =>
    b.type === "image"
      ? {
          type: COMMUNITY_IMAGE_NODE,
          attrs: { src: b.src, alt: b.alt, uploadId: null, status: "done", error: null, preview: null },
        }
      : b.text
        ? { type: "paragraph", content: [{ type: "text", text: b.text }] }
        : { type: "paragraph" }
  );
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

export type CommunityDocSnapshot = {
  /** 저장 가능한 본문(업로드 완료 이미지만) */
  content: string;
  /** 본문 이미지 URL(순서) — 완료분 */
  imageUrls: string[];
  uploadingCount: number;
  failedCount: number;
  /** 업로드 중·실패 포함 전체 이미지 노드 수(10장 제한 판정) */
  imageNodeCount: number;
};

function textOf(node: PmNode): string {
  if (typeof node.text === "string") return node.text;
  return (node.content ?? []).map(textOf).join("");
}

export function communityDocToSnapshot(doc: PmNode): CommunityDocSnapshot {
  const blocks: CommunityBodyBlock[] = [];
  const imageUrls: string[] = [];
  let uploadingCount = 0;
  let failedCount = 0;
  let imageNodeCount = 0;
  for (const node of doc.content ?? []) {
    if (node.type === COMMUNITY_IMAGE_NODE) {
      imageNodeCount += 1;
      const a = (node.attrs ?? {}) as Partial<CommunityImageNodeAttrs>;
      if (a.status === "uploading") {
        uploadingCount += 1;
        continue;
      }
      if (a.status === "failed" || !a.src) {
        failedCount += 1;
        continue;
      }
      blocks.push({ type: "image", src: a.src, alt: a.alt ?? "" });
      imageUrls.push(a.src);
      continue;
    }
    blocks.push({ type: "paragraph", text: textOf(node) });
  }
  return {
    content: serializeCommunityBodyBlocks(blocks),
    imageUrls,
    uploadingCount,
    failedCount,
    imageNodeCount,
  };
}
