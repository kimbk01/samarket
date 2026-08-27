import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  adminGiftProfileLabel,
  loadAdminGiftProfileMap,
} from "@/lib/gift-certificate/admin-gift-ops-profile";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/gift-certificates/cash-outs */
export async function GET() {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const sb = gate.sb;

  const { data, error } = await sb
    .from(GIFT_TABLES.cashOutRequests)
    .select(
      "id, store_id, owner_user_id, amount, status, destination_type, account_number, account_name, bank_name, approved_at, paid_at, rejected_at, payout_method, payout_reference, payout_note, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const storeIds = [...new Set(rows.map((r) => String((r as { store_id: string }).store_id)))];
  const ownerIds = rows.map((r) => String((r as { owner_user_id?: string }).owner_user_id ?? ""));
  const storeNameById = new Map<string, string>();
  const availByStore = new Map<string, number>();
  const profiles = await loadAdminGiftProfileMap(sb, ownerIds);

  if (storeIds.length > 0) {
    const { data: stores } = await sb.from("stores").select("id, store_name").in("id", storeIds).limit(200);
    for (const s of stores ?? []) {
      storeNameById.set(String((s as { id: string }).id), String((s as { store_name?: string }).store_name ?? ""));
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

  const cashOuts = rows.map((raw) => {
    const r = raw as Record<string, unknown>;
    const storeId = String(r.store_id);
    const ownerUserId = String(r.owner_user_id);
    return {
      id: String(r.id),
      storeId,
      storeName: storeNameById.get(storeId) ?? "",
      ownerUserId,
      ownerLabel: adminGiftProfileLabel(profiles.get(ownerUserId)),
      amount: Math.trunc(Number(r.amount) || 0),
      status: String(r.status ?? ""),
      destinationType: String(r.destination_type ?? ""),
      accountNumber: String(r.account_number ?? ""),
      accountName: String(r.account_name ?? ""),
      bankName: r.bank_name == null ? null : String(r.bank_name),
      createdAt: String(r.created_at ?? ""),
      approvedAt: r.approved_at == null ? null : String(r.approved_at),
      paidAt: r.paid_at == null ? null : String(r.paid_at),
      rejectedAt: r.rejected_at == null ? null : String(r.rejected_at),
      payoutMethod: r.payout_method == null ? null : String(r.payout_method),
      payoutReference: r.payout_reference == null ? null : String(r.payout_reference),
      payoutNote: r.payout_note == null ? null : String(r.payout_note),
      availableRevenue: availByStore.get(storeId) ?? 0,
    };
  });

  return NextResponse.json({ ok: true, cashOuts });
}
