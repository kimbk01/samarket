import { NextRequest, NextResponse } from "next/server";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { runAdminStoreOrderIntervention } from "@/lib/stores/admin-store-order-intervention";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Legacy path — same service as `/intervene` (reason required). */
type Body = {
  action?: "approve" | "reject";
  reason?: string;
  rejected_reason?: string;
  expected_status?: string;
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
  if (action) {
    const r = await runAdminStoreOrderIntervention(sb, {
      orderId: oid,
      action: action === "approve" ? "cancel_request_approve" : "cancel_request_reject",
      reason: body.reason ?? body.rejected_reason,
      expectedStatus: typeof body.expected_status === "string" ? body.expected_status : null,
      audit,
    });
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.httpStatus });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "unsupported_action" }, { status: 400 });
}
