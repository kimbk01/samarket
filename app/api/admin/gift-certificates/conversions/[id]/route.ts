import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  adminGiftProfileLabel,
  loadAdminGiftProfileMap,
} from "@/lib/gift-certificate/admin-gift-ops-profile";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/gift-certificates/conversions/[id] */
export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const sb = gate.sb;
  const { id } = await context.params;
  const requestId = typeof id === "string" ? id.trim() : "";
  if (!requestId) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }

  const { data: raw, error } = await sb
    .from(GIFT_TABLES.conversionRequests)
    .select(
      "id, store_id, owner_user_id, amount, status, idempotency_key, approved_by, approved_at, created_at"
    )
    .eq("id", requestId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!raw) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const storeId = String(raw.store_id);
  const ownerUserId = String(raw.owner_user_id);
  const [{ data: store }, { data: cash }, availRes, { data: recoveryRows }, { data: ledger }, profiles] =
    await Promise.all([
      sb.from("stores").select("id, store_name, point_balance, owner_user_id").eq("id", storeId).maybeSingle(),
      sb.from(GIFT_TABLES.storeCashAccounts).select("store_id, balance").eq("store_id", storeId).maybeSingle(),
      sb.rpc("gift_certificate_store_revenue_available", { p_store_id: storeId }),
      sb
        .from(GIFT_TABLES.storeCashRecoveryObligations)
        .select("id, redemption_id, amount_original, amount_remaining, status, created_at")
        .eq("store_id", storeId)
        .in("status", ["OPEN", "PARTIALLY_CLEARED"])
        .limit(50),
      sb
        .from(GIFT_TABLES.revenueLedger)
        .select("id, entry_type, amount, related_type, related_id, redemption_id, created_at")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(20),
      loadAdminGiftProfileMap(sb, [ownerUserId]),
    ]);

  const available =
    typeof availRes.data === "number"
      ? Math.trunc(availRes.data)
      : Math.trunc(Number(availRes.data) || 0);
  const openRecoveryAmount = (recoveryRows ?? []).reduce(
    (s, r) => s + Math.max(0, Math.trunc(Number((r as { amount_remaining?: number }).amount_remaining) || 0)),
    0
  );

  return NextResponse.json({
    ok: true,
    conversion: {
      id: String(raw.id),
      storeId,
      storeName: store?.store_name != null ? String(store.store_name) : "",
      ownerUserId,
      ownerLabel: adminGiftProfileLabel(profiles.get(ownerUserId)),
      amount: Math.trunc(Number(raw.amount) || 0),
      status: String(raw.status ?? ""),
      createdAt: String(raw.created_at ?? ""),
      approvedAt: raw.approved_at == null ? null : String(raw.approved_at),
      availableRevenue: available,
      storeCashBalance: cash ? Math.trunc(Number(cash.balance) || 0) : 0,
      openRecoveryAmount,
      businessCredit: store ? Math.trunc(Number((store as { point_balance?: number }).point_balance) || 0) : 0,
      recoveries: recoveryRows ?? [],
      recentLedger: ledger ?? [],
    },
  });
}
