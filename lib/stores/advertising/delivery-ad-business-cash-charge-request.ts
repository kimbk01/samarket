/**
 * Read-only adapter for historical ads-specific charge requests.
 * New Cash top-ups use business_cash_charge_requests.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeliveryAdCashChargeRequestStatus } from "@/lib/stores/advertising/delivery-ad-product-recovery-contract";

export const DELIVERY_AD_CASH_CHARGE_REQUEST_TABLE =
  "delivery_ad_business_cash_charge_requests" as const;

export type DeliveryAdCashChargeRequestRow = {
  id: string;
  ownerUserId: string;
  amountMinor: number;
  currency: string;
  requestStatus: DeliveryAdCashChargeRequestStatus;
  ownerMemo: string | null;
  adminMemo: string | null;
  paymentReference: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  creditedLedgerId: string | null;
  clientRequestId: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapRow(raw: Record<string, unknown>): DeliveryAdCashChargeRequestRow | null {
  const id = String(raw.id ?? "").trim();
  const ownerUserId = String(raw.owner_user_id ?? "").trim();
  const amountMinor = Number(raw.amount_minor);
  const requestStatus = String(
    raw.request_status ?? ""
  ).trim() as DeliveryAdCashChargeRequestStatus;
  if (!id || !ownerUserId || !Number.isFinite(amountMinor)) return null;
  return {
    id,
    ownerUserId,
    amountMinor,
    currency: String(raw.currency ?? "PHP"),
    requestStatus,
    ownerMemo: raw.owner_memo == null ? null : String(raw.owner_memo),
    adminMemo: raw.admin_memo == null ? null : String(raw.admin_memo),
    paymentReference:
      raw.payment_reference == null ? null : String(raw.payment_reference),
    reviewedBy: raw.reviewed_by == null ? null : String(raw.reviewed_by),
    reviewedAt: raw.reviewed_at == null ? null : String(raw.reviewed_at),
    creditedLedgerId:
      raw.credited_ledger_id == null ? null : String(raw.credited_ledger_id),
    clientRequestId:
      raw.client_request_id == null ? null : String(raw.client_request_id),
    createdAt: String(raw.created_at ?? ""),
    updatedAt: String(raw.updated_at ?? ""),
  };
}

export async function listAdminBusinessCashChargeRequests(
  sb: SupabaseClient,
  status?: DeliveryAdCashChargeRequestStatus | "open"
): Promise<DeliveryAdCashChargeRequestRow[]> {
  let query = sb
    .from(DELIVERY_AD_CASH_CHARGE_REQUEST_TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (status === "open") {
    query = query.in("request_status", ["pending_deposit", "under_review"]);
  } else if (status) {
    query = query.eq("request_status", status);
  }
  const { data, error } = await query;
  if (error) return [];
  return (data ?? [])
    .map((row) => mapRow(row as Record<string, unknown>))
    .filter((row): row is DeliveryAdCashChargeRequestRow => row != null);
}
