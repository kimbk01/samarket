import type { SupabaseClient } from "@supabase/supabase-js";
import type { PointPromotionOrder, PointPromotionPlacement, PointPromotionTargetType } from "@/lib/types/point";

export function mapPointPromotionOrderRow(row: Record<string, unknown>): PointPromotionOrder {
  return {
    id: String(row.id ?? ""),
    userId: String(row.user_id ?? ""),
    userNickname: String(row.user_nickname ?? ""),
    targetType: (String(row.target_type ?? "product") as PointPromotionOrder["targetType"]),
    targetId: String(row.target_id ?? ""),
    targetTitle: String(row.target_title ?? ""),
    placement: (String(row.placement ?? "home_top") as PointPromotionOrder["placement"]),
    durationDays: Number(row.duration_days ?? 0),
    pointCost: Number(row.point_cost ?? 0),
    orderStatus: (String(row.order_status ?? "active") as PointPromotionOrder["orderStatus"]),
    startAt: String(row.start_at ?? ""),
    endAt: String(row.end_at ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
}

export async function listPointPromotionOrders(
  sb: SupabaseClient,
  limit = 500
): Promise<PointPromotionOrder[]> {
  const { data, error } = await sb
    .from("point_promotion_orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapPointPromotionOrderRow(r as Record<string, unknown>));
}

export async function assertPromotionTargetOwned(
  sb: SupabaseClient,
  userId: string,
  targetType: PointPromotionTargetType,
  targetId: string
): Promise<{ ok: true; targetTitle: string } | { ok: false; error: string }> {
  const id = targetId.trim();
  const uid = userId.trim();
  if (!id) return { ok: false, error: "targetId_required" };
  if (!uid) return { ok: false, error: "unauthorized" };

  if (targetType === "product") {
    const { data, error } = await sb
      .from("posts")
      .select("id, title, user_id, status")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return { ok: false, error: "target_not_found" };
    if (String((data as { user_id?: string }).user_id ?? "") !== uid) {
      return { ok: false, error: "forbidden" };
    }
    const status = String((data as { status?: string }).status ?? "").toLowerCase();
    if (status === "deleted" || status === "hidden") {
      return { ok: false, error: "target_unavailable" };
    }
    return {
      ok: true,
      targetTitle: String((data as { title?: string }).title ?? "").trim(),
    };
  }

  if (targetType === "shop") {
    const { data, error } = await sb
      .from("stores")
      .select("id, store_name, owner_user_id, approval_status")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return { ok: false, error: "target_not_found" };
    if (String((data as { owner_user_id?: string }).owner_user_id ?? "") !== uid) {
      return { ok: false, error: "forbidden" };
    }
    const approval = String((data as { approval_status?: string }).approval_status ?? "").toLowerCase();
    if (approval !== "approved") {
      return { ok: false, error: "target_unavailable" };
    }
    return {
      ok: true,
      targetTitle: String((data as { store_name?: string }).store_name ?? "").trim(),
    };
  }

  return { ok: false, error: "invalid_target_type" };
}

export async function hasActivePromotionOrderOnTarget(
  sb: SupabaseClient,
  targetType: PointPromotionTargetType,
  targetId: string,
  placement: PointPromotionPlacement
): Promise<boolean> {
  const id = targetId.trim();
  if (!id) return false;
  const nowIso = new Date().toISOString();
  const { data, error } = await sb
    .from("point_promotion_orders")
    .select("id")
    .eq("target_type", targetType)
    .eq("target_id", id)
    .eq("placement", placement)
    .eq("order_status", "active")
    .gte("end_at", nowIso)
    .limit(1);
  if (error) return false;
  return (data ?? []).length > 0;
}
