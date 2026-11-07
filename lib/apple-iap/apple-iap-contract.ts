/**
 * Apple 인앱 결제(IAP) — Point·Cash 충전의 추가 결제 수단 (클라이언트·서버 공용 계약).
 *
 * 상태 원본은 `public.apple_iap_transactions` (supabase/migrations/20271107100000_apple_iap_topup.sql).
 * 기존 충전 요청·원장에는 지급이 확정된 거래만 승인 완료 행으로 들어간다.
 */

export const APPLE_IAP_PAYMENT_METHOD = "apple_iap" as const;
/** Apple 테스트 결제(Sandbox) 지급 — 운영 매출·정산 합계에서 제외하는 결제수단 */
export const APPLE_IAP_SANDBOX_PAYMENT_METHOD = "apple_iap_sandbox" as const;
/** DB `apple_iap_sandbox_point_cap()` 과 같은 값 (회원별 Sandbox 누적 지급 상한 · 3종 × 2회 · 20271107120000) */
export const APPLE_IAP_SANDBOX_POINT_CAP = 34500;
export const APPLE_IAP_STOREKIT_PLUGIN_ID = "DibayStoreKit" as const;

export type AppleIapKind = "point" | "cash";

export type AppleIapAttemptStatus =
  | "prepared"
  | "deferred"
  | "user_cancelled"
  | "failed"
  | "received"
  | "credited"
  | "review";

export type AppleIapRefundStatus =
  | "none"
  | "review"
  | "recovered"
  | "waived"
  | "reversed_review"
  | "reversed";

/** 화면 단계 — 준비·진행·승인 대기·검증 중·지급 완료·취소·실패·검토·환불 검토 */
export type AppleIapUiPhase =
  | "idle"
  | "preparing"
  | "purchasing"
  | "awaiting_approval"
  | "verifying"
  | "credited"
  | "cancelled"
  | "failed"
  | "review"
  | "refund_review";

export type AppleIapProductView = {
  productId: string;
  kind: AppleIapKind;
  /** Point 상품 — 연결된 point_plans.id */
  pointPlanId: string | null;
  /** Point 상품 — 지급 포인트(기본+보너스) */
  pointAmount: number | null;
  /** Point 상품 — 요금제 결제 금액(PHP) */
  paymentAmount: number | null;
  /** Cash 상품 — 지급 Cash (minor) */
  cashAmountMinor: number | null;
  sortOrder: number;
};

export type AppleIapAttemptView = {
  attemptId: string;
  kind: AppleIapKind;
  productId: string;
  status: AppleIapAttemptStatus;
  refundStatus: AppleIapRefundStatus;
  phase: AppleIapUiPhase;
  pointAmount: number | null;
  cashAmountMinor: number | null;
  transactionId: string | null;
  createdAt: string;
  creditedAt: string | null;
};

const ATTEMPT_STATUSES: ReadonlySet<string> = new Set<AppleIapAttemptStatus>([
  "prepared",
  "deferred",
  "user_cancelled",
  "failed",
  "received",
  "credited",
  "review",
]);

const REFUND_STATUSES: ReadonlySet<string> = new Set<AppleIapRefundStatus>([
  "none",
  "review",
  "recovered",
  "waived",
  "reversed_review",
  "reversed",
]);

export function parseAppleIapAttemptStatus(raw: unknown): AppleIapAttemptStatus | null {
  const s = String(raw ?? "").trim();
  return ATTEMPT_STATUSES.has(s) ? (s as AppleIapAttemptStatus) : null;
}

export function parseAppleIapRefundStatus(raw: unknown): AppleIapRefundStatus {
  const s = String(raw ?? "").trim();
  return REFUND_STATUSES.has(s) ? (s as AppleIapRefundStatus) : "none";
}

/** 서버 기록 → 화면 단계. 지급 완료는 서버가 credited 를 돌려줄 때만. */
export function appleIapPhaseFromServer(
  status: AppleIapAttemptStatus,
  refundStatus: AppleIapRefundStatus
): AppleIapUiPhase {
  if (refundStatus === "review" || refundStatus === "reversed_review") return "refund_review";
  switch (status) {
    case "credited":
      return "credited";
    case "received":
      return "verifying";
    case "deferred":
      return "awaiting_approval";
    case "review":
      return "review";
    case "user_cancelled":
      return "cancelled";
    case "failed":
      return "failed";
    case "prepared":
      return "purchasing";
  }
}

/** 결제는 끝났고 지급 확인을 기다리는 단계 — 새 결제 버튼을 막는다 */
export function appleIapPhaseBlocksNewPurchase(phase: AppleIapUiPhase): boolean {
  return phase === "preparing" || phase === "purchasing" || phase === "verifying";
}

/** 결제 후 사람이 확인해야 하는 단계 — 고객센터 안내를 보인다 */
export function appleIapPhaseNeedsHelp(phase: AppleIapUiPhase): boolean {
  return phase === "review" || phase === "refund_review";
}

export function appleIapIsUuid(raw: unknown): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(raw ?? "").trim());
}

/** 준비 단계 서버 오류 → 화면 단계 (결제 전 오류는 failed, 지급 확인 대기는 verifying) */
export function appleIapPhaseFromPrepareError(error: string): AppleIapUiPhase {
  return error === "apple_credit_pending" ? "verifying" : "failed";
}
