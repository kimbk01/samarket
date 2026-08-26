import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/gift-certificates/conversions */
export async function GET() {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const sb = gate.sb;

  const { data, error } = await sb
    .from(GIFT_TABLES.conversionRequests)
    .select(
      "id, store_id, owner_user_id, amount, status, idempotency_key, approved_by, approved_at, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const storeIds = [...new Set(rows.map((r) => String(r.store_id)))];
  const storeNameById = new Map<string, string>();
  const cashByStore = new Map<string, number>();
  const availByStore = new Map<string, number>();
  const recoveryByStore = new Map<string, number>();

  if (storeIds.length > 0) {
    const [{ data: stores }, { data: cashRows }, { data: recoveryRows }] = await Promise.all([
      sb.from("stores").select("id, store_name").in("id", storeIds).limit(200),
      sb.from(GIFT_TABLES.storeCashAccounts).select("store_id, balance").in("store_id", storeIds).limit(200),
      sb
        .from(GIFT_TABLES.storeCashRecoveryObligations)
        .select("store_id, amount_remaining, status")
        .in("store_id", storeIds)
        .in("status", ["OPEN", "PARTIALLY_CLEARED"])
        .limit(200),
    ]);
    for (const s of stores ?? []) {
      storeNameById.set(String((s as { id: string }).id), String((s as { store_name?: string }).store_name ?? ""));
    }
    for (const c of cashRows ?? []) {
      cashByStore.set(
        String((c as { store_id: string }).store_id),
        Math.trunc(Number((c as { balance?: number }).balance) || 0)
      );
    }
    for (const o of recoveryRows ?? []) {
      const sid = String((o as { store_id: string }).store_id);
      recoveryByStore.set(
        sid,
        (recoveryByStore.get(sid) ?? 0) +
          Math.max(0, Math.trunc(Number((o as { amount_remaining?: number }).amount_remaining) || 0))
      );
    }
    await Promise.all(
      storeIds.map(async (sid) => {
        const { data: avail } = await sb.rpc("gift_certificate_store_revenue_available", {
          p_store_id: sid,
        });
        availByStore.set(
          sid,
          typeof avail === "number" ? Math.trunc(avail) : Math.trunc(Number(avail) || 0)
        );
      })
    );
  }

  const conversions = rows.map((raw) => {
    const r = raw as Record<string, unknown>;
    const storeId = String(r.store_id);
    return {
      id: String(r.id),
      storeId,
      storeName: storeNameById.get(storeId) ?? "",
      ownerUserId: String(r.owner_user_id),
      amount: Math.trunc(Number(r.amount) || 0),
      status: String(r.status ?? ""),
      createdAt: String(r.created_at ?? ""),
      approvedAt: r.approved_at == null ? null : String(r.approved_at),
      availableRevenue: availByStore.get(storeId) ?? 0,
      storeCashBalance: cashByStore.get(storeId) ?? 0,
      openRecoveryAmount: recoveryByStore.get(storeId) ?? 0,
    };
  });

  return NextResponse.json({ ok: true, conversions });
}
