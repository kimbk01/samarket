import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canSubmitPointCharge,
  isPendingChargeStatus,
  resolveOwnerPointChargeUiState,
  type OwnerPointAccountInquirySnapshot,
  type OwnerPointChargeUiState,
  type OwnerPointPendingChargeSnapshot,
} from "@/lib/stores/owner-point-deposit-context";

const ACCOUNT_INQUIRY_SELECT =
  "id, status, subject, answer, created_at, answered_at, inquiry_kind, inquiry_type";

function mapInquiry(row: Record<string, unknown>): OwnerPointAccountInquirySnapshot {
  return {
    id: String(row.id),
    status: String(row.status ?? ""),
    subject: String(row.subject ?? ""),
    answer: row.answer != null ? String(row.answer) : null,
    createdAt: String(row.created_at ?? ""),
    answeredAt: row.answered_at != null ? String(row.answered_at) : null,
  };
}

function isMissingInquiryKindColumn(msg: string): boolean {
  return /inquiry_kind/i.test(msg) && /(does not exist|column)/i.test(msg);
}

function isAccountRequestRow(row: Record<string, unknown>): boolean {
  const kind = String(row.inquiry_kind ?? "").trim();
  if (kind === "account_request") return true;
  if (kind && kind !== "general") return false;
  return String(row.inquiry_type ?? "") === "store_point";
}

async function fetchOpenAccountInquiry(
  sb: SupabaseClient,
  storeId: string
): Promise<OwnerPointAccountInquirySnapshot | null> {
  const withKind = await sb
    .from("platform_admin_inquiries")
    .select(ACCOUNT_INQUIRY_SELECT)
    .eq("store_id", storeId)
    .eq("inquiry_type", "store_point")
    .eq("inquiry_kind", "account_request")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!withKind.error && withKind.data) {
    return mapInquiry(withKind.data as Record<string, unknown>);
  }
  if (withKind.error && !isMissingInquiryKindColumn(withKind.error.message ?? "")) {
    return null;
  }

  const fallback = await sb
    .from("platform_admin_inquiries")
    .select(ACCOUNT_INQUIRY_SELECT)
    .eq("store_id", storeId)
    .eq("inquiry_type", "store_point")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(5);

  if (fallback.error) return null;
  const row = (fallback.data ?? []).find((r) =>
    isAccountRequestRow(r as Record<string, unknown>)
  ) as Record<string, unknown> | undefined;
  return row ? mapInquiry(row) : null;
}

async function fetchAnsweredAccountInquiry(
  sb: SupabaseClient,
  storeId: string
): Promise<OwnerPointAccountInquirySnapshot | null> {
  const withKind = await sb
    .from("platform_admin_inquiries")
    .select(ACCOUNT_INQUIRY_SELECT)
    .eq("store_id", storeId)
    .eq("inquiry_type", "store_point")
    .eq("inquiry_kind", "account_request")
    .eq("status", "answered")
    .not("answer", "is", null)
    .order("answered_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!withKind.error && withKind.data) {
    const mapped = mapInquiry(withKind.data as Record<string, unknown>);
    if (String(mapped.answer ?? "").trim()) return mapped;
  }
  if (withKind.error && !isMissingInquiryKindColumn(withKind.error.message ?? "")) {
    return null;
  }

  const fallback = await sb
    .from("platform_admin_inquiries")
    .select(ACCOUNT_INQUIRY_SELECT)
    .eq("store_id", storeId)
    .eq("inquiry_type", "store_point")
    .eq("status", "answered")
    .not("answer", "is", null)
    .order("answered_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(10);

  if (fallback.error) return null;
  for (const raw of fallback.data ?? []) {
    const row = raw as Record<string, unknown>;
    if (!isAccountRequestRow(row)) continue;
    const mapped = mapInquiry(row);
    if (String(mapped.answer ?? "").trim()) return mapped;
  }
  return null;
}

export type OwnerPointDepositContext = {
  /** @deprecated Alias — use chargeUiState */
  depositStep: OwnerPointChargeUiState;
  chargeUiState: OwnerPointChargeUiState;
  activeAccountInquiry: OwnerPointAccountInquirySnapshot | null;
  latestAccountAnswer: OwnerPointAccountInquirySnapshot | null;
  pendingCharge: OwnerPointPendingChargeSnapshot | null;
  canSubmitCharge: boolean;
};

export async function loadOwnerPointDepositContext(
  sb: SupabaseClient,
  storeId: string
): Promise<OwnerPointDepositContext> {
  const sid = storeId.trim();
  const openInquiry = await fetchOpenAccountInquiry(sb, sid);
  const answeredInquiry = await fetchAnsweredAccountInquiry(sb, sid);
  let pendingCharge: OwnerPointPendingChargeSnapshot | null = null;

  const chargeRes = await sb
    .from("store_point_charge_requests")
    .select("id, request_status, point_amount, payment_amount, requested_at")
    .eq("store_id", sid)
    .in("request_status", ["pending", "waiting_confirm", "on_hold"])
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!chargeRes.error && chargeRes.data) {
    const row = chargeRes.data as Record<string, unknown>;
    if (isPendingChargeStatus(String(row.request_status ?? ""))) {
      pendingCharge = {
        id: String(row.id),
        requestStatus: String(row.request_status ?? ""),
        pointAmount: Number(row.point_amount) || 0,
        paymentAmount: Number(row.payment_amount) || 0,
        requestedAt: String(row.requested_at ?? ""),
      };
    }
  }

  const chargeUiState = resolveOwnerPointChargeUiState({ pendingCharge });
  const chargeGate = canSubmitPointCharge({ pendingCharge });

  return {
    depositStep: chargeUiState,
    chargeUiState,
    activeAccountInquiry: openInquiry,
    latestAccountAnswer: answeredInquiry,
    pendingCharge,
    canSubmitCharge: chargeGate.ok,
  };
}
