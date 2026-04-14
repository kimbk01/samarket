import type { SupabaseClient } from "@supabase/supabase-js";

export type TradeAdProductRow = {
  id: string;
  name: string;
  description: string | null;
  board_key: string | null;
  ad_type: string;
  duration_days: number;
  point_cost: number;
  priority_default: number;
  is_active: boolean;
  placement: string | null;
  service_type: string | null;
  category_id: string | null;
  region_target: string | null;
  allow_duplicate: boolean;
  auto_approve: boolean;
};

export async function loadTradeAdProductById(
  sb: SupabaseClient,
  adProductId: string
): Promise<TradeAdProductRow | null> {
  const { data, error } = await sb
    .from("ad_products")
    .select(
      "id, name, description, board_key, ad_type, duration_days, point_cost, priority_default, is_active, placement, service_type, category_id, region_target, allow_duplicate, auto_approve"
    )
    .eq("id", adProductId)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    description: typeof r.description === "string" ? r.description : null,
    board_key: typeof r.board_key === "string" ? r.board_key : r.board_key != null ? String(r.board_key) : null,
    ad_type: String(r.ad_type ?? "highlight"),
    duration_days: Math.max(1, Math.floor(Number(r.duration_days) || 1)),
    point_cost: Math.max(0, Math.floor(Number(r.point_cost) || 0)),
    priority_default: Math.floor(Number(r.priority_default) || 100),
    is_active: r.is_active === true,
    placement: typeof r.placement === "string" ? r.placement : null,
    service_type: typeof r.service_type === "string" ? r.service_type : null,
    category_id: typeof r.category_id === "string" ? r.category_id : null,
    region_target: typeof r.region_target === "string" ? r.region_target : null,
    allow_duplicate: r.allow_duplicate === true,
    auto_approve: r.auto_approve === true,
  };
}
