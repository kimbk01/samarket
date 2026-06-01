import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  notifyStoreOwnerPointChargeApproved,
  notifyStoreOwnerPointChargeRejected,
} from "@/lib/notifications/notify-store-points";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchBody = {
  action?: "approve" | "reject" | "hold";
  admin_memo?: string;
};

/** PATCH /api/admin/store-point-charges/[id] */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { id } = await context.params;
  const rid = typeof id === "string" ? id.trim() : "";
  if (!rid) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  if (body.admin_memo !== undefined) {
    await sb
      .from("store_point_charge_requests")
      .update({ admin_memo: String(body.admin_memo).slice(0, 2000), updated_at: new Date().toISOString() })
      .eq("id", rid);
  }

  const action = body.action;
  if (!action) {
    return NextResponse.json({ ok: true });
  }

  if (action === "approve") {
    const { data, error } = await sb.rpc("approve_store_point_charge_request", {
      p_request_id: rid,
      p_admin_user_id: admin.userId,
    });
    if (error) {
      if (/approve_store_point_charge_request/i.test(error.message)) {
        return NextResponse.json({ ok: false, error: "rpc_missing" }, { status: 503 });
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    const result = (data ?? {}) as Record<string, unknown>;
    if (result.ok === false) {
      return NextResponse.json({ ok: false, error: String(result.error ?? "approve_failed") }, { status: 400 });
    }

    const { data: reqRow } = await sb
      .from("store_point_charge_requests")
      .select("store_id, owner_user_id, point_amount")
      .eq("id", rid)
      .maybeSingle();
    if (reqRow?.owner_user_id) {
      void notifyStoreOwnerPointChargeApproved(sb, {
        storeId: String(reqRow.store_id),
        ownerUserId: String(reqRow.owner_user_id),
        pointAmount: Number(reqRow.point_amount) || 0,
        balanceAfter: Number(result.balance_after) || 0,
        requestId: rid,
      });
    }

    return NextResponse.json({ ok: true, result });
  }

  const nextStatus = action === "reject" ? "rejected" : "on_hold";
  const { data: reqRow, error: uErr } = await sb
    .from("store_point_charge_requests")
    .update({ request_status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", rid)
    .in("request_status", ["pending", "waiting_confirm", "on_hold"])
    .select("store_id, owner_user_id")
    .maybeSingle();

  if (uErr) {
    return NextResponse.json({ ok: false, error: uErr.message }, { status: 500 });
  }
  if (!reqRow) {
    return NextResponse.json({ ok: false, error: "not_found_or_already_processed" }, { status: 400 });
  }

  if (action === "reject" && reqRow.owner_user_id) {
    void notifyStoreOwnerPointChargeRejected(sb, {
      storeId: String(reqRow.store_id),
      ownerUserId: String(reqRow.owner_user_id),
      requestId: rid,
    });
  }

  return NextResponse.json({ ok: true, request_status: nextStatus });
}
