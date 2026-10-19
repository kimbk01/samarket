import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  adminLegacyOrderWriteGoneResponse,
  isAdminLegacyOrderWriteDisabled,
} from "@/lib/admin/store-orders/admin-legacy-order-write-gate";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { recordStoreOrderPaid } from "@/lib/stores/record-store-order-payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/store-orders/[orderId]/mark-paid — legacy stub, DISABLED (E-1 · DEF-8 → 410).
 * Customers pay the store directly; the admin console never records a payment. Code kept behind the gate.
 */
export async function POST(
  _req: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const ROUTE = "POST /api/admin/store-orders/[orderId]/mark-paid" as const;
  if (isAdminLegacyOrderWriteDisabled(ROUTE)) return adminLegacyOrderWriteGoneResponse(ROUTE);
  const admin = { userId: gate.actor.userId };

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
