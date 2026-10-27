/**
 * DB categories 행 → CategoryWithSettings (순수 매핑).
 * RSC·API·클라이언트 공용 — `"use client"` 모듈에 두지 않는다.
 */
import type { CategoryWithSettings } from "./types";
import { parseQuickCreateGroup } from "./parseQuickCreateGroup";
import type { CategorySettingsRaw } from "./normalizeCategorySettings";
import { normalizeCategorySettings } from "./normalizeCategorySettings";

export interface CategoryDbRow {
  id: string;
  name: string;
  name_en?: string | null;
  slug: string;
  icon_key: string;
  badge_color?: string | null;
  type: string;
  sort_order: number;
  is_active: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
  quick_create_enabled?: boolean;
  quick_create_group?: string | null;
  quick_create_order?: number;
  show_in_home_chips?: boolean;
  parent_id?: string | null;
  category_settings?: CategorySettingsRaw;
}

export function toCategoryWithSettings(row: CategoryDbRow): CategoryWithSettings {
  return {
    id: row.id,
    name: row.name,
    name_en: typeof row.name_en === "string" ? row.name_en.trim() || null : null,
    slug: row.slug,
    icon_key: row.icon_key,
    badge_color: normalizeBadgeColor(row.badge_color),
    type: row.type as CategoryWithSettings["type"],
    parent_id: row.parent_id ?? null,
    sort_order: row.sort_order,
    is_active: row.is_active,
    description: row.description,
    created_at: row.created_at,
    updated_at: row.updated_at,
    quick_create_enabled: row.quick_create_enabled ?? false,
    quick_create_group: parseQuickCreateGroup(row.quick_create_group),
    quick_create_order: row.quick_create_order ?? 0,
    show_in_home_chips: row.show_in_home_chips ?? true,
    settings: normalizeCategorySettings(row.category_settings),
  };
}

/** 하위 주제 행 — 동일 매핑 */
export const mapChildCategoryRow = toCategoryWithSettings;

/** P-6: `#RRGGBB` 만 허용 — 그 외는 null(기본 중립색) */
export function normalizeBadgeColor(raw: unknown): string | null {
  return typeof raw === "string" && /^#[0-9A-Fa-f]{6}$/.test(raw.trim()) ? raw.trim().toUpperCase() : null;
}

/** P-6: 어드민 색 선택기의 시작값(배지 색이 비어 있을 때) — 화면 표시는 토큰 `bg-sam-surface-dark` */
export const TRADE_TOPIC_BADGE_PICKER_START_HEX = "#4B5563";
