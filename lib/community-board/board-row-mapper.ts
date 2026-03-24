/**
 * boards 행 → Board 타입 매핑 (서버·테스트 공용)
 */

import type { Board, BoardPolicy, FormTypeValue, SkinType } from "./types";

export function parsePolicy(raw: unknown): BoardPolicy {
  if (!raw || typeof raw !== "object") return {};
  const p = raw as Record<string, unknown>;
  return {
    allow_comment: p.allow_comment !== false,
    allow_like: p.allow_like !== false,
    allow_report: p.allow_report !== false,
    use_notice: p.use_notice === true,
    allow_search: p.allow_search === true,
    default_sort: typeof p.default_sort === "string" ? p.default_sort : undefined,
    list_style: p.list_style === "card" || p.list_style === "thumbnail" ? p.list_style : "list",
    moderator_user_id: typeof p.moderator_user_id === "string" ? p.moderator_user_id : undefined,
  };
}

export function normalizeSkinType(raw: string): SkinType {
  const allowed = ["basic", "gallery", "magazine", "qna", "promo"] as const;
  return (allowed.includes(raw as (typeof allowed)[number]) ? raw : "basic") as SkinType;
}

/** DB form_type에 magazine 등 포함 — 작성 폼은 basic/gallery/qna/promo만 */
export function normalizeFormType(raw: string): FormTypeValue {
  if (raw === "gallery" || raw === "qna" || raw === "promo") return raw;
  return "basic";
}

export function mapBoardRow(row: Record<string, unknown>): Board {
  return {
    id: String(row.id),
    service_id: String(row.service_id),
    name: String(row.name ?? ""),
    slug: String(row.slug ?? ""),
    description: row.description != null ? String(row.description) : null,
    skin_type: normalizeSkinType(String(row.skin_type ?? "basic")),
    form_type: normalizeFormType(String(row.form_type ?? "basic")),
    category_mode:
      row.category_mode === "trade_category" || row.category_mode === "board_category"
        ? row.category_mode
        : "none",
    policy: parsePolicy(row.policy),
    is_active: row.is_active === true,
    sort_order: Number(row.sort_order ?? 0),
  };
}
