import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { storeCashRecoveryClear } from "@/lib/gift-certificate/gift-certificate-rpc";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/gift-certificates/recovery */
export async function GET() {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const sb = gate.sb;

  const { data, error } = await sb
    .from(GIFT_TABLES.storeCashRecoveryObligations)
    .select(
      "id, store_id, redemption_id, amount_original, amount_remaining, status, created_at, updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const storeIds = [...new Set(rows.map((r) => String(r.store_id)))];
  const nameById = new Map<string, string>();
  if (storeIds.length > 0) {
    const { data: stores } = await sb.from("stores").select("id, store_name").in("id", storeIds).limit(200);
    for (const s of stores ?? []) {
      nameById.set(String((s as { id: string }).id), String((s as { store_name?: string }).store_name ?? ""));
    }
  }

  return NextResponse.json({
    ok: true,
    obligations: rows.map((raw) => {
      const r = raw as Record<string, unknown>;
      const storeId = String(r.store_id);
      return {
        id: String(r.id),
        storeId,
        storeName: nameById.get(storeId) ?? "",
        redemptionId: r.redemption_id == null ? null : String(r.redemption_id),
        amountOriginal: Math.trunc(Number(r.amount_original) || 0),
        amountRemaining: Math.trunc(Number(r.amount_remaining) || 0),
        status: String(r.status ?? ""),
        createdAt: String(r.created_at ?? ""),
      };
    }),
  });
}

/** POST /api/admin/gift-certificates/recovery — clear obligation (canonical RPC) */
export async function POST(req: Request) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const obligationId = String(body.obligationId ?? body.obligation_id ?? "").trim();
  const amount = Math.trunc(Number(body.amount));
  if (!obligationId || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ ok: false, error: "obligationId_and_amount_required" }, { status: 400 });
  }

  const result = await storeCashRecoveryClear(gate.sb, {
    adminUserId: gate.actor.userId,
    obligationId,
    amount,
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, ...(result.data ?? {}) },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true, ...result.data });
}
