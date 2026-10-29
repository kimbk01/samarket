/**
 * HOME shelf product fields — persistence helpers (extends composition overrides).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoresHomeShelfProductOverride } from "@/lib/stores/product/stores-home-shelf-product-resolve";
import {
  mapDbOverrideToShelfProduct,
  shelfProductOverrideToDbSlot,
} from "@/lib/stores/product/stores-home-shelf-product-resolve";
import type { StoresHomeCompositionSlotKey } from "@/lib/stores/composition/stores-composition-home-slots";

export type HomeShelfProductDbRow = {
  surface: string;
  slot: string;
  shelf_id: string | null;
  enabled: boolean;
  section_order: number;
  max_items: number | null;
  title_ko: string | null;
  title_en: string | null;
  subtitle_ko: string | null;
  subtitle_en: string | null;
  presentation_mode: string | null;
  coupon_integration: string | null;
  ad_integration: string | null;
  schedule_start: string | null;
  schedule_end: string | null;
  product_config: unknown;
};

function isMissingTable(err: { message?: string; code?: string }): boolean {
  const m = (err.message ?? "").toLowerCase();
  return err.code === "42P01" || m.includes("does not exist");
}

export async function listHomeShelfProductDbRows(sb: SupabaseClient): Promise<HomeShelfProductDbRow[]> {
  const { data, error } = await sb
    .from("store_composition_policy_overrides")
    .select(
      "surface, slot, shelf_id, enabled, section_order, max_items, title_ko, title_en, subtitle_ko, subtitle_en, presentation_mode, coupon_integration, ad_integration, schedule_start, schedule_end, product_config"
    )
    .eq("surface", "home");
  if (error) {
    if (isMissingTable(error)) return [];
    if ((error.message ?? "").includes("title_ko")) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as HomeShelfProductDbRow[];
}

export function homeShelfDbRowsToOverrides(rows: readonly HomeShelfProductDbRow[]): StoresHomeShelfProductOverride[] {
  const out: StoresHomeShelfProductOverride[] = [];
  for (const row of rows) {
    const mapped = mapDbOverrideToShelfProduct({
      slot: row.slot,
      shelf_id: row.shelf_id,
      enabled: row.enabled,
      section_order: row.section_order,
      max_items: row.max_items,
      title_ko: row.title_ko,
      title_en: row.title_en,
      subtitle_ko: row.subtitle_ko,
      subtitle_en: row.subtitle_en,
      presentation_mode: row.presentation_mode,
      coupon_integration: row.coupon_integration,
      ad_integration: row.ad_integration,
      schedule_start: row.schedule_start,
      schedule_end: row.schedule_end,
      product_config: row.product_config,
    });
    if (mapped) out.push(mapped);
  }
  return out;
}

/**
 * H-04 — 선반 상품 필드를 구성 CAS RPC(`save_store_composition_policy_surface_cas`)의 `product` 로 넘긴다.
 * enabled·order·max 는 RPC 행 값이 단일 출처 — 여기서 다시 쓰지 않는다 (트랜잭션 밖 개별 upsert 제거).
 */
export function buildHomeShelfProductRpcFields(
  shelf: StoresHomeShelfProductOverride
): { slot: string; product: Record<string, unknown> } | null {
  const mapped = shelfProductOverrideToDbSlot(shelf);
  if (!mapped) return null;
  return {
    slot: mapped.slot,
    product: {
      shelf_id: mapped.shelf_id,
      title_ko: shelf.titleKo ?? null,
      title_en: shelf.titleEn ?? null,
      subtitle_ko: shelf.subtitleKo ?? null,
      subtitle_en: shelf.subtitleEn ?? null,
      presentation_mode: shelf.presentation ?? null,
      coupon_integration: shelf.couponIntegration ?? "off",
      ad_integration: shelf.adIntegration ?? "off",
      schedule_start: shelf.scheduleStart ?? null,
      schedule_end: shelf.scheduleEnd ?? null,
      product_config: shelf.productConfig ?? {},
    },
  };
}

export function slotFromShelfComposerSlot(slot: StoresHomeCompositionSlotKey): string {
  return slot;
}
