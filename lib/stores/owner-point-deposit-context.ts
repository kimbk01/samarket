/** Pure helpers for store point deposit pipeline (account inquiry → deposit). */

export type OwnerPointDepositStep =
  | "account_inquiry"
  | "awaiting_answer"
  | "deposit"
  | "charge_pending";

export type OwnerPointAccountInquirySnapshot = {
  id: string;
  status: string;
  subject: string;
  answer: string | null;
  createdAt: string;
  answeredAt: string | null;
};

export type OwnerPointPendingChargeSnapshot = {
  id: string;
  requestStatus: string;
  pointAmount: number;
  paymentAmount: number;
  requestedAt: string;
};

/** Blocks new charge requests and keeps owner on charge_pending step (incl. admin hold). */
export const PENDING_CHARGE_STATUSES = new Set(["pending", "waiting_confirm", "on_hold"]);

export function isPendingChargeStatus(status: string | null | undefined): boolean {
  return PENDING_CHARGE_STATUSES.has(String(status ?? "").trim());
}

export function isAnsweredAccountInquiry(
  inquiry: OwnerPointAccountInquirySnapshot | null | undefined
): inquiry is OwnerPointAccountInquirySnapshot {
  if (!inquiry) return false;
  if (inquiry.status !== "answered") return false;
  return String(inquiry.answer ?? "").trim().length > 0;
}

export function resolveOwnerPointDepositStep(input: {
  openInquiry: OwnerPointAccountInquirySnapshot | null;
  answeredInquiry: OwnerPointAccountInquirySnapshot | null;
  pendingCharge: OwnerPointPendingChargeSnapshot | null;
}): OwnerPointDepositStep {
  if (input.pendingCharge) return "charge_pending";
  if (isAnsweredAccountInquiry(input.answeredInquiry)) return "deposit";
  if (input.openInquiry?.status === "open") return "awaiting_answer";
  return "account_inquiry";
}

export function canSubmitPointCharge(input: {
  answeredInquiry: OwnerPointAccountInquirySnapshot | null;
  pendingCharge: OwnerPointPendingChargeSnapshot | null;
}): { ok: true; inquiryId: string } | { ok: false; error: string } {
  if (input.pendingCharge) {
    return { ok: false, error: "charge_already_pending" };
  }
  if (!isAnsweredAccountInquiry(input.answeredInquiry)) {
    return { ok: false, error: "account_inquiry_not_answered" };
  }
  return { ok: true, inquiryId: input.answeredInquiry.id };
}
