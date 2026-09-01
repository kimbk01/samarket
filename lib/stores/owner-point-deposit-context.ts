/** Historical store operations charge state (account inquiry is independent — not a pipeline step). */

export type OwnerPointChargeUiState = "ready" | "charge_pending";

/** @deprecated Use OwnerPointChargeUiState — kept for API field name compatibility */
export type OwnerPointDepositStep = OwnerPointChargeUiState;

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

/** Blocks new charge requests and keeps owner on charge_pending state (incl. admin hold). */
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

export function resolveOwnerPointChargeUiState(input: {
  pendingCharge: OwnerPointPendingChargeSnapshot | null;
}): OwnerPointChargeUiState {
  return input.pendingCharge ? "charge_pending" : "ready";
}

/** @deprecated Use resolveOwnerPointChargeUiState */
export function resolveOwnerPointDepositStep(input: {
  openInquiry?: OwnerPointAccountInquirySnapshot | null;
  answeredInquiry?: OwnerPointAccountInquirySnapshot | null;
  pendingCharge: OwnerPointPendingChargeSnapshot | null;
}): OwnerPointDepositStep {
  return resolveOwnerPointChargeUiState({ pendingCharge: input.pendingCharge });
}

export function canSubmitPointCharge(input: {
  pendingCharge: OwnerPointPendingChargeSnapshot | null;
}): { ok: true } | { ok: false; error: string } {
  if (input.pendingCharge) {
    return { ok: false, error: "charge_already_pending" };
  }
  return { ok: true };
}
