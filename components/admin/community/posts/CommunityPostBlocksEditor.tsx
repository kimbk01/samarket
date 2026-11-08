"use client";

/**
 * 외부 수집 글 본문 블록 편집 (C-08) — 블록 단위로 글자만 고친다. 블록 순서·형식은 유지하고,
 * 이미지 블록은 설명만 고치거나 블록째 뺄 수 있다. 서버가 저장 전에 다시 정리(sanitize)한다.
 */
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { translateBy } from "@/lib/i18n/translate-by";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import type { ImportedContentBlock } from "@/lib/community/imported-content-blocks";

const BLOCK_LABEL: Record<ImportedContentBlock["t"], MessageKey> = {
  p: "admin_community_block_p",
  h: "admin_community_block_h",
  ul: "admin_community_block_ul",
  ol: "admin_community_block_ol",
  quote: "admin_community_block_quote",
  table: "admin_community_block_table",
  img: "admin_community_block_img",
  link: "admin_community_block_link",
};

const INPUT =
  "w-full rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-[13px] text-sam-fg outline-none focus:border-sam-primary disabled:opacity-60";

/** 블록 → 비교·미리보기용 글자. `lang` 생략 시 한국어. */
export function communityBlocksToText(blocks: unknown, lang: string = "ko"): string {
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
          return b.caption
            ? translateBy(lang, "admin_community_block_img_caption_text", { caption: b.caption })
            : translateBy(lang, "admin_community_block_img_text");
        case "link":
          return translateBy(lang, "admin_community_block_link_text", { text: b.text });
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
  const { t } = useI18n();
  const update = (i: number, next: ImportedContentBlock | null) => {
    const copy = blocks.slice();
    if (next === null) copy.splice(i, 1);
    else copy[i] = next;
    onChange(copy);
  };

  if (blocks.length === 0) {
    return <p className="text-[13px] text-sam-muted">{t("admin_community_postedit_no_blocks")}</p>;
  }

  return (
    <ol className="space-y-2" data-community-post-blocks-editor="1">
      {blocks.map((b, i) => (
        <li key={i} className="rounded-ui-rect border border-sam-border-soft bg-sam-app p-2">
          <div className="mb-1 flex items-center justify-between gap-2 text-[12px] text-sam-muted">
            <span>
              {i + 1}. {BLOCK_LABEL[b.t] ? t(BLOCK_LABEL[b.t]) : t("admin_community_block_fallback")}
            </span>
            <AdminActionButton variant="ghost" size="sm" disabled={disabled} onClick={() => update(i, null)}>
              {t("admin_community_blocks_remove")}
            </AdminActionButton>
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
              <span className="sam-text-xxs text-sam-muted">{t("admin_community_postedit_one_per_line")}</span>
            </>
          ) : b.t === "link" ? (
            <>
              <input
                className={INPUT}
                value={b.text}
                disabled={disabled}
                onChange={(e) => update(i, { ...b, text: e.target.value })}
              />
              <span className="sam-text-xxs text-sam-muted [overflow-wrap:anywhere]">{t("admin_community_postedit_link_url", { url: b.href })}</span>
            </>
          ) : b.t === "img" ? (
            <div className="flex gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- DIBAY 저장소 사본만 허용된 블록 */}
              <img src={b.url} alt={b.alt ?? ""} className="h-16 w-16 shrink-0 rounded-ui-rect border border-sam-border object-cover" />
              <input
                className={INPUT}
                placeholder={t("admin_community_postedit_image_caption")}
                value={b.caption ?? ""}
                disabled={disabled}
                onChange={(e) => update(i, { ...b, caption: e.target.value || null })}
              />
            </div>
          ) : b.t === "table" ? (
            <p className="text-[12px] text-sam-muted">
              {t("admin_community_blocks_table_note", { n: b.rows.length })}
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
