import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  adminGiftProfileLabel,
  loadAdminGiftProfileMap,
} from "@/lib/gift-certificate/admin-gift-ops-profile";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/gift-certificates/cash-outs/[id] */
export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const requestId = typeof id === "string" ? id.trim() : "";
  if (!requestId) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }

  const { data, error } = await gate.sb
    .from(GIFT_TABLES.cashOutRequests)
    .select(
      "id, store_id, owner_user_id, amount, status, destination_type, account_number, account_name, bank_name, approved_at, paid_at, rejected_at, rejection_reason, payout_method, payout_reference, payout_note, created_at"
    )
    .eq("id", requestId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const r = data as Record<string, unknown>;
  const storeId = String(r.store_id);
  const ownerUserId = String(r.owner_user_id);
  const [{ data: store }, { data: avail }, profiles] = await Promise.all([
    gate.sb.from("stores").select("id, store_name").eq("id", storeId).maybeSingle(),
    gate.sb.rpc("gift_certificate_store_revenue_available", { p_store_id: storeId }),
    loadAdminGiftProfileMap(gate.sb, [ownerUserId]),
  ]);
  return NextResponse.json({
    ok: true,
    cashOut: {
      id: String(r.id),
      storeId,
      storeName: String((store as { store_name?: string } | null)?.store_name ?? ""),
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
      rejectionReason: r.rejection_reason == null ? null : String(r.rejection_reason),
      payoutMethod: r.payout_method == null ? null : String(r.payout_method),
      payoutReference: r.payout_reference == null ? null : String(r.payout_reference),
      payoutNote: r.payout_note == null ? null : String(r.payout_note),
      availableRevenue:
        typeof avail === "number" ? Math.trunc(avail) : Math.trunc(Number(avail) || 0),
    },
  });
}

/** Historical parallel cash-out requests are immutable after Coin withdrawal convergence. */
export async function POST(
  _req: Request,
  _context: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  return NextResponse.json(
    { ok: false, error: "historical_gift_cash_out_read_only" },
    { status: 410 }
  );
}
