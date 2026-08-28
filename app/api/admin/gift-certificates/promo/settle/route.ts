import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { GIFT_RPCS } from "@/lib/gift-certificate/gift-certificate-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/admin/gift-certificates/promo/settle — C3 promo settlement (service_role RPC) */
export async function POST(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const sb = gate.sb;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const obligationId = String(body.obligationId ?? body.obligation_id ?? "").trim();
  const amount = Math.trunc(Number(body.amount));
  const idempotencyKey = String(body.idempotencyKey ?? body.idempotency_key ?? "").trim();

  if (!obligationId || !Number.isFinite(amount) || amount <= 0 || !idempotencyKey) {
    return NextResponse.json({ ok: false, error: "invalid_args" }, { status: 400 });
  }

  const { data, error } = await sb.rpc(GIFT_RPCS.promoSettle, {
    p_obligation_id: obligationId,
    p_amount: amount,
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const result = (data ?? {}) as Record<string, unknown>;
  if (result.ok !== true) {
    return NextResponse.json(
      { ok: false, error: String(result.error ?? "settle_failed"), detail: result },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, result });
}
