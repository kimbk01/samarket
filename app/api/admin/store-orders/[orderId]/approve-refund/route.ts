import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { adminCompleteRefundStoreOrder } from "@/lib/stores/apply-admin-store-order-operations";

export const runtime = "nodejs";
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

  const result = await adminCompleteRefundStoreOrder(sb, oid, {
    adminUserId: admin.userId,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.httpStatus });
  }

  return NextResponse.json({ ok: true, already: result.already });
}
