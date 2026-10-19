"use client";

/**
 * 외부 수집 글 본문 블록 편집 (C-08) — 블록 단위로 글자만 고친다. 블록 순서·형식은 유지하고,
 * 이미지 블록은 설명만 고치거나 블록째 뺄 수 있다. 서버가 저장 전에 다시 정리(sanitize)한다.
 */
import type { ImportedContentBlock } from "@/lib/community/imported-content-blocks";

const BLOCK_LABEL: Record<ImportedContentBlock["t"], string> = {
  p: "문단",
  h: "소제목",
  ul: "목록",
  ol: "번호 목록",
  quote: "인용",
  table: "표",
  img: "이미지",
  link: "링크",
};

const INPUT =
  "w-full rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-[13px] text-sam-fg outline-none focus:border-sam-primary disabled:opacity-60";

/** 블록 → 비교·미리보기용 글자 */
export function communityBlocksToText(blocks: unknown): string {
  if (!Array.isArray(blocks)) return "";
  return (blocks as ImportedContentBlock[])
    .map((b) => {
      switch (b?.t) {
        case "p":
        case "quote":
        case "h":
          return b.text;
        case "ul":
        case "ol":
          return b.items.map((i) => `· ${i}`).join("\n");
        case "table":
          return b.rows.map((r) => r.join(" | ")).join("\n");
        case "img":
          return `[이미지${b.caption ? `: ${b.caption}` : ""}]`;
        case "link":
          return `[링크: ${b.text}]`;
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join("\n\n");
}

export function CommunityPostBlocksEditor({
  blocks,
  onChange,
  disabled,
}: {
  blocks: ImportedContentBlock[];
  onChange: (next: ImportedContentBlock[]) => void;
  disabled?: boolean;
}) {
  const update = (i: number, next: ImportedContentBlock | null) => {
    const copy = blocks.slice();
    if (next === null) copy.splice(i, 1);
    else copy[i] = next;
    onChange(copy);
  };

  if (blocks.length === 0) {
    return <p className="text-[13px] text-sam-muted">본문 블록이 없습니다.</p>;
  }

  return (
    <ol className="space-y-2" data-community-post-blocks-editor="1">
      {blocks.map((b, i) => (
        <li key={i} className="rounded-ui-rect border border-sam-border-soft bg-sam-app p-2">
          <div className="mb-1 flex items-center justify-between gap-2 text-[12px] text-sam-muted">
            <span>
              {i + 1}. {BLOCK_LABEL[b.t] ?? "블록"}
            </span>
            <button
              type="button"
              disabled={disabled}
              className="text-red-700 underline disabled:opacity-50"
              onClick={() => update(i, null)}
            >
              블록 빼기
            </button>
          </div>
          {b.t === "p" || b.t === "quote" ? (
            <textarea
              className={`${INPUT} min-h-[72px]`}
              value={b.text}
              disabled={disabled}
              onChange={(e) => update(i, { ...b, text: e.target.value })}
            />
          ) : b.t === "h" ? (
            <input
              className={INPUT}
              value={b.text}
              disabled={disabled}
              onChange={(e) => update(i, { ...b, text: e.target.value })}
            />
          ) : b.t === "ul" || b.t === "ol" ? (
            <>
              <textarea
                className={`${INPUT} min-h-[72px]`}
                value={b.items.join("\n")}
                disabled={disabled}
                onChange={(e) => update(i, { ...b, items: e.target.value.split("\n") })}
              />
              <span className="sam-text-xxs text-sam-muted">한 줄에 한 항목</span>
            </>
          ) : b.t === "link" ? (
            <>
              <input
                className={INPUT}
                value={b.text}
                disabled={disabled}
                onChange={(e) => update(i, { ...b, text: e.target.value })}
              />
              <span className="sam-text-xxs text-sam-muted [overflow-wrap:anywhere]">연결 주소: {b.href}</span>
            </>
          ) : b.t === "img" ? (
            <div className="flex gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- DIBAY 저장소 사본만 허용된 블록 */}
              <img src={b.url} alt={b.alt ?? ""} className="h-16 w-16 shrink-0 rounded-ui-rect border border-sam-border object-cover" />
              <input
                className={INPUT}
                placeholder="이미지 설명 (선택)"
                value={b.caption ?? ""}
                disabled={disabled}
                onChange={(e) => update(i, { ...b, caption: e.target.value || null })}
              />
            </div>
          ) : b.t === "table" ? (
            <p className="text-[12px] text-sam-muted">
              표 {b.rows.length}줄 — 표 내용은 여기서 고칠 수 없습니다. 필요 없으면 블록을 빼세요.
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** 저장 전 정리 — 빈 줄 항목 제거 */
export function normalizeEditedBlocks(blocks: ImportedContentBlock[]): ImportedContentBlock[] {
  return blocks.map((b) => (b.t === "ul" || b.t === "ol" ? { ...b, items: b.items.map((x) => x.trim()).filter(Boolean) } : b));
}
