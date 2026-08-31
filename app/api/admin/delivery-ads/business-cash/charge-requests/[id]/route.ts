import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  adminCompleteBusinessCashChargeRequest,
  adminRejectBusinessCashChargeRequest,
} from "@/lib/stores/advertising/delivery-ad-business-cash-charge-request";
import {
  safeNotifyOwnerBusinessCashChargeCompleted,
  safeNotifyOwnerBusinessCashChargeRejected,
} from "@/lib/stores/advertising/delivery-ad-business-cash-charge-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/admin/delivery-ads/business-cash/charge-requests/[id] */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const { id } = await context.params;
  const requestId = String(id ?? "").trim();
  if (!requestId) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const action = String(body.action ?? "").trim();
  const adminMemo =
    typeof body.adminMemo === "string"
      ? body.adminMemo
      : typeof body.admin_memo === "string"
        ? body.admin_memo
        : null;

  if (action === "complete" || action === "approve") {
    const result = await adminCompleteBusinessCashChargeRequest(sb, {
      requestId,
      adminUserId: admin.userId,
      adminMemo,
    });
    if (!result.ok) {
      const status =
        result.error === "not_found"
          ? 404
          : result.error === "invalid_status"
            ? 409
            : 400;
      return NextResponse.json({ ok: false, error: result.error }, { status });
    }
    void safeNotifyOwnerBusinessCashChargeCompleted(sb, {
      ownerUserId: result.row.ownerUserId,
      requestId: result.row.id,
      amountMinor: result.row.amountMinor,
    });
    return NextResponse.json({ ok: true, request: result.row });
  }

  if (action === "reject") {
    const result = await adminRejectBusinessCashChargeRequest(sb, {
      requestId,
      adminUserId: admin.userId,
      adminMemo,
    });
    if (!result.ok) {
      const status =
        result.error === "not_found"
          ? 404
          : result.error === "invalid_status"
            ? 409
            : 400;
      return NextResponse.json({ ok: false, error: result.error }, { status });
    }
    void safeNotifyOwnerBusinessCashChargeRejected(sb, {
      ownerUserId: result.row.ownerUserId,
      requestId: result.row.id,
    });
    return NextResponse.json({ ok: true, request: result.row });
  }

  return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
}
