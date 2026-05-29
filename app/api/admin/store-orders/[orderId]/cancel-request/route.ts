import { NextRequest, NextResponse } from "next/server";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  adminApproveStoreOrderCancelRequest,
  adminRejectStoreOrderCancelRequest,
} from "@/lib/stores/apply-admin-store-order-operations";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  action?: "approve" | "reject";
  rejected_reason?: string;
};

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { orderId } = await context.params;
  const oid = typeof orderId === "string" ? orderId.trim() : "";
  if (!oid) return NextResponse.json({ ok: false, error: "missing_order_id" }, { status: 400 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const rm = getAuditRequestMeta(req);
  const audit = { adminUserId: admin.userId, ip: rm.ip, user_agent: rm.userAgent };

  const action = body.action === "approve" || body.action === "reject" ? body.action : "";
  if (action === "approve") {
    const r = await adminApproveStoreOrderCancelRequest(sb, oid, audit);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.httpStatus });
    return NextResponse.json({ ok: true });
  }
  if (action === "reject") {
    const r = await adminRejectStoreOrderCancelRequest(sb, oid, body.rejected_reason ?? "", audit);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.httpStatus });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "unsupported_action" }, { status: 400 });
}
