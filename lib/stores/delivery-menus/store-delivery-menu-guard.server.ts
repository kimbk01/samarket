import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveDefaultMenuIdForStore } from "@/lib/stores/delivery-menus/delivery-menu-compute";

/**
 * 안전장치 S3 — 매장을 고객에게 노출하기 전(노출 켜기·운영 재개) 메뉴 확인.
 * - 지정 메뉴가 있으면 통과.
 * - 없으면 업종 기본 메뉴가 있어야 통과 (DB 트리거가 노출 순간 그 메뉴에 자동 배정).
 * - 둘 다 없으면 `delivery_menu_required` — 관리자가 메뉴 관리에서 지정해야 한다.
 * 메뉴 표 미적용(42P01)이면 검사하지 않는다 (복구 스위치 — 업종 화면).
 */
export async function checkStoreDeliveryMenuBeforeExpose(
  sb: SupabaseClient,
  store: { id: string; store_category_id: string | null; store_topic_id: string | null }
): Promise<{ ok: true } | { ok: false; error: "delivery_menu_required" }> {
  const assigned = await sb
    .from("delivery_menu_store_overrides")
    .select("menu_id", { count: "exact", head: true })
    .eq("store_id", store.id)
    .eq("mode", "include");
  if (assigned.error) {
    if (/42P01|does not exist|delivery_menu/i.test(assigned.error.message ?? "")) return { ok: true };
    throw new Error(`store_delivery_menu_guard: ${assigned.error.message}`);
  }
  if ((assigned.count ?? 0) > 0) return { ok: true };
  const defaults = await sb.from("delivery_menu_defaults").select("category_id, topic_id, menu_id");
  if (defaults.error) throw new Error(`store_delivery_menu_guard_defaults: ${defaults.error.message}`);
  const fallback = resolveDefaultMenuIdForStore(
    (defaults.data ?? []) as { category_id: string; topic_id: string | null; menu_id: string }[],
    store
  );
  return fallback ? { ok: true } : { ok: false, error: "delivery_menu_required" };
}
