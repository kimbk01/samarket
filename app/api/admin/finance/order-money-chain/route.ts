import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { loadOrderMoneyChain } from "@/lib/finance/order-money-chain/load-order-money-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/finance/order-money-chain?orderId= */
export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  const orderId = new URL(req.url).searchParams.get("orderId")?.trim() ?? "";
  if (!orderId) return NextResponse.json({ ok: false, error: "missing_order_id" }, { status: 400 });

  const chain = await loadOrderMoneyChain(gate.sb, { orderId });
  if (!chain) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, chain });
}
