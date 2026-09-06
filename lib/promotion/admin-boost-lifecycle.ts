/**
 * Admin Boost lifecycle after CAPTURE (Trade + Community Point promote).
 * MASTER: pause/resume/end. End does NOT auto-refund (same LOCK as Feed ADMIN_END_REFUND).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type BoostLifecycleAction = "pause" | "resume" | "end";

export type BoostLifecycleResult =
  | { ok: true; orderId: string; orderStatus: string; endAt: string | null }
  | { ok: false; error: string; httpStatus: number };

export async function applyBoostLifecycle(
  sb: SupabaseClient,
  input: {
    orderId: string;
    domain: "trade" | "community";
    action: BoostLifecycleAction;
    adminUserId: string;
    reason?: string | null;
  }
): Promise<BoostLifecycleResult> {
  const orderId = input.orderId.trim();
  if (!orderId) return { ok: false, error: "missing_order", httpStatus: 400 };

  const { data: row, error } = await sb
    .from("point_promotion_orders")
    .select("id, domain, order_status, end_at")
    .eq("id", orderId)
    .maybeSingle();

  if (error || !row?.id) {
    return { ok: false, error: "not_found", httpStatus: 404 };
  }

  const domain = String((row as { domain?: string }).domain ?? "");
  if (domain !== input.domain) {
    return { ok: false, error: "domain_mismatch", httpStatus: 409 };
  }

  const status = String((row as { order_status?: string }).order_status ?? "").toLowerCase();
  const now = new Date().toISOString();
  const reason = (input.reason ?? "").trim() || `admin_${input.action}`;

  void reason;

  if (input.action === "pause") {
    if (status !== "active") {
      return { ok: false, error: "not_active", httpStatus: 409 };
    }
    const { error: upErr } = await sb
      .from("point_promotion_orders")
      .update({ order_status: "paused" })
      .eq("id", orderId)
      .eq("order_status", "active");
    if (upErr) return { ok: false, error: upErr.message, httpStatus: 500 };
    return {
      ok: true,
      orderId,
      orderStatus: "paused",
      endAt: String((row as { end_at?: string }).end_at ?? null),
    };
  }

  if (input.action === "resume") {
    if (status !== "paused") {
      return { ok: false, error: "not_paused", httpStatus: 409 };
    }
    const endAt = String((row as { end_at?: string }).end_at ?? "");
    if (endAt && new Date(endAt).getTime() <= Date.now()) {
      return { ok: false, error: "already_ended", httpStatus: 409 };
    }
    const { error: upErr } = await sb
      .from("point_promotion_orders")
      .update({ order_status: "active" })
      .eq("id", orderId)
      .eq("order_status", "paused");
    if (upErr) return { ok: false, error: upErr.message, httpStatus: 500 };
    return { ok: true, orderId, orderStatus: "active", endAt: endAt || null };
  }

  // end — no Point refund (CAPTURE settled). Policy: ADMIN_END_REFUND_POLICY_REQUIRED.
  if (status !== "active" && status !== "paused") {
    return { ok: false, error: "not_running", httpStatus: 409 };
  }
  const { error: endErr } = await sb
    .from("point_promotion_orders")
    .update({ order_status: "ended", end_at: now })
    .eq("id", orderId)
    .in("order_status", ["active", "paused"]);
  if (endErr) return { ok: false, error: endErr.message, httpStatus: 500 };
  return { ok: true, orderId, orderStatus: "ended", endAt: now };
}
