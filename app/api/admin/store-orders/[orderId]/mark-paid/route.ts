import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { recordStoreOrderPaid } from "@/lib/stores/record-store-order-payment";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { orderId } = await context.params;
  const oid = typeof orderId === "string" ? orderId.trim() : "";
  if (!oid) {
    return NextResponse.json({ ok: false, error: "missing_order_id" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const result = await recordStoreOrderPaid(sb, {
    orderId: oid,
    provider: "admin_console_stub",
    providerPaymentId: `admin_stub_${oid}_${Date.now()}`,
    meta: { actor_admin_user_id: admin.userId },
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, hint: result.hint }, { status: result.httpStatus });
  }

  return NextResponse.json({ ok: true, payment_status: result.payment_status, already: result.already });
}
