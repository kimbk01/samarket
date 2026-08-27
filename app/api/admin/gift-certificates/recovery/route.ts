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
  const redemptionIds = [
    ...new Set(
      rows
        .map((r) => (r as { redemption_id?: string | null }).redemption_id)
        .filter((x): x is string => typeof x === "string" && x.length > 0)
    ),
  ];
  const nameById = new Map<string, string>();
  const cashByStore = new Map<string, number>();
  const giftByRedemption = new Map<string, { publicGiftNumber: string; orderId: string | null }>();

  if (storeIds.length > 0) {
    const [{ data: stores }, { data: cashRows }] = await Promise.all([
      sb.from("stores").select("id, store_name").in("id", storeIds).limit(200),
      sb.from(GIFT_TABLES.storeCashAccounts).select("store_id, balance").in("store_id", storeIds).limit(200),
    ]);
    for (const s of stores ?? []) {
      nameById.set(String((s as { id: string }).id), String((s as { store_name?: string }).store_name ?? ""));
    }
    for (const c of cashRows ?? []) {
      cashByStore.set(
        String((c as { store_id: string }).store_id),
        Math.trunc(Number((c as { balance?: number }).balance) || 0)
      );
    }
  }

  if (redemptionIds.length > 0) {
    const { data: redemptions } = await sb
      .from(GIFT_TABLES.redemptions)
      .select("id, instance_id, order_id")
      .in("id", redemptionIds)
      .limit(200);
    const instanceIds = [
      ...new Set(
        ((redemptions ?? []) as { instance_id?: string }[])
          .map((r) => String(r.instance_id ?? ""))
          .filter(Boolean)
      ),
    ];
    const { data: instances } = instanceIds.length
      ? await sb
          .from(GIFT_TABLES.instances)
          .select("id, public_gift_number")
          .in("id", instanceIds)
      : { data: [] };
    const publicByInstance = new Map(
      ((instances ?? []) as { id: string; public_gift_number?: string }[]).map((r) => [
        String(r.id),
        String(r.public_gift_number ?? ""),
      ])
    );
    for (const r of (redemptions ?? []) as {
      id: string;
      instance_id?: string;
      order_id?: string;
    }[]) {
      giftByRedemption.set(String(r.id), {
        publicGiftNumber: publicByInstance.get(String(r.instance_id ?? "")) ?? "",
        orderId: r.order_id ? String(r.order_id) : null,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    obligations: rows.map((raw) => {
      const r = raw as Record<string, unknown>;
      const storeId = String(r.store_id);
      const redemptionId = r.redemption_id == null ? null : String(r.redemption_id);
      const gift = redemptionId ? giftByRedemption.get(redemptionId) : undefined;
      const linkage =
        redemptionId && gift?.publicGiftNumber ? ("REDEMPTION" as const) : ("POOL_LEVEL" as const);
      const status = String(r.status ?? "");
      return {
        id: String(r.id),
        storeId,
        storeName: nameById.get(storeId) ?? "",
        redemptionId,
        publicGiftNumber: gift?.publicGiftNumber || null,
        orderId: gift?.orderId ?? null,
        linkage,
        amountOriginal: Math.trunc(Number(r.amount_original) || 0),
        amountRemaining: Math.trunc(Number(r.amount_remaining) || 0),
        recoveredAmount: Math.max(
          0,
          Math.trunc(Number(r.amount_original) || 0) - Math.trunc(Number(r.amount_remaining) || 0)
        ),
        status,
        storeCashBalance: cashByStore.get(storeId) ?? 0,
        createdAt: String(r.created_at ?? ""),
        clearedAt: status === "CLEARED" ? String(r.updated_at ?? "") : null,
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
