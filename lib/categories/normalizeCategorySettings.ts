"use client";

import type { CategoryWithSettings } from "./types";

/** Supabase 조인 결과: 1:1이면 객체, 1:N이면 배열로 올 수 있음 */
export type CategorySettingsRaw =
  | {
      can_write?: boolean;
      has_price?: boolean;
      has_chat?: boolean;
      has_location?: boolean;
      has_direct_deal?: boolean;
      has_free_share?: boolean;
      post_type?: string;
    }
  | Array<{
      can_write?: boolean;
      has_price?: boolean;
      has_chat?: boolean;
      has_location?: boolean;
      has_direct_deal?: boolean;
      has_free_share?: boolean;
      post_type?: string;
    }>
  | null
  | undefined;

const DEFAULTS: NonNullable<CategoryWithSettings["settings"]> = {
  can_write: true,
  has_price: true,
  has_chat: true,
  has_location: true,
  has_direct_deal: true,
  has_free_share: true,
  post_type: "normal",
};

/**
 * DB 조인 결과 category_settings를 항상 { can_write, has_price, ... } 객체로 반환.
 * - 배열이면 [0], 객체면 그대로, 없으면 기본값 사용 (리스트/수정 폼에서 일관 표시)
 */
export function normalizeCategorySettings(
  raw: CategorySettingsRaw
): NonNullable<CategoryWithSettings["settings"]> {
  const one =
    raw == null ? null : Array.isArray(raw) ? (raw[0] ?? null) : raw;
  if (!one || typeof one !== "object") return { ...DEFAULTS };
  return {
    can_write: one.can_write ?? DEFAULTS.can_write,
    has_price: one.has_price ?? DEFAULTS.has_price,
    has_chat: one.has_chat ?? DEFAULTS.has_chat,
    has_location: one.has_location ?? DEFAULTS.has_location,
    has_direct_deal: one.has_direct_deal ?? DEFAULTS.has_direct_deal,
    has_free_share: one.has_free_share ?? DEFAULTS.has_free_share,
    post_type: one.post_type ?? DEFAULTS.post_type,
  };
}
