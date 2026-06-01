import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canSubmitPointCharge,
  isPendingChargeStatus,
  resolveOwnerPointDepositStep,
  type OwnerPointAccountInquirySnapshot,
  type OwnerPointDepositStep,
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

export type OwnerPointDepositContext = {
  depositStep: OwnerPointDepositStep;
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
  let openInquiry: OwnerPointAccountInquirySnapshot | null = null;
  let answeredInquiry: OwnerPointAccountInquirySnapshot | null = null;
  let pendingCharge: OwnerPointPendingChargeSnapshot | null = null;

  const openRes = await sb
    .from("platform_admin_inquiries")
    .select(ACCOUNT_INQUIRY_SELECT)
    .eq("store_id", sid)
    .eq("inquiry_type", "store_point")
    .eq("inquiry_kind", "account_request")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!openRes.error && openRes.data) {
    openInquiry = mapInquiry(openRes.data as Record<string, unknown>);
  } else if (openRes.error && !isMissingInquiryKindColumn(openRes.error.message ?? "")) {
    // table missing or other error — leave null
  }

  const answeredRes = await sb
    .from("platform_admin_inquiries")
    .select(ACCOUNT_INQUIRY_SELECT)
    .eq("store_id", sid)
    .eq("inquiry_type", "store_point")
    .eq("inquiry_kind", "account_request")
    .eq("status", "answered")
    .not("answer", "is", null)
    .order("answered_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!answeredRes.error && answeredRes.data) {
    const mapped = mapInquiry(answeredRes.data as Record<string, unknown>);
    if (String(mapped.answer ?? "").trim()) {
      answeredInquiry = mapped;
    }
  }

  const chargeRes = await sb
    .from("store_point_charge_requests")
    .select("id, request_status, point_amount, payment_amount, requested_at")
    .eq("store_id", sid)
    .in("request_status", ["pending", "waiting_confirm"])
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

  const depositStep = resolveOwnerPointDepositStep({
    openInquiry,
    answeredInquiry,
    pendingCharge,
  });

  const chargeGate = canSubmitPointCharge({ answeredInquiry, pendingCharge });

  return {
    depositStep,
    activeAccountInquiry: openInquiry,
    latestAccountAnswer: answeredInquiry,
    pendingCharge,
    canSubmitCharge: chargeGate.ok,
  };
}
