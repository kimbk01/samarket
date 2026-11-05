"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { appleIapPhaseNeedsHelp, type AppleIapAttemptView, type AppleIapUiPhase } from "@/lib/apple-iap/apple-iap-contract";
import type { MessageKey } from "@/lib/i18n/message-key";
import { MYPAGE_CUSTOMER_CENTER_HREF } from "@/lib/mypage/mypage-ia";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";
import { OwnerCta } from "@/lib/business/owner-cta-classes";
import { Sam } from "@/lib/ui/css-vars";

const PREPARE_ERROR_KEYS: Record<string, MessageKey> = {
  amount_exceeds_monthly_cap: "apple_iap_err_monthly_cap",
  amount_exceeds_request_cap: "apple_iap_err_request_cap",
  product_unavailable: "apple_iap_err_product_unavailable",
};

/**
 * Apple 결제 상태 안내 칸 — 진행·승인 대기·검증 중·지급 완료·취소·실패·검토·환불 검토.
 * 지급 완료 문구는 서버가 credited 를 돌려준 뒤에만 (phase === "credited").
 */
export function AppleIapStatusNotice({
  phase,
  delayed,
  attempt,
  errorCode,
  busy,
  variant,
  onRecheck,
  onDismiss,
}: {
  phase: AppleIapUiPhase;
  delayed: boolean;
  attempt: AppleIapAttemptView | null;
  errorCode: string | null;
  busy: boolean;
  variant: "mypage" | "owner";
  onRecheck: () => void;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  if (phase === "idle") return null;

  const btn = variant === "owner" ? OwnerCta.formSecondary : `${Sam.btn.secondaryCombo} ${Sam.btn.sm}`;
  const reference = attempt?.attemptId ? attempt.attemptId.slice(0, 8).toUpperCase() : null;

  let message: string;
  let tone: "info" | "success" | "warning" | "danger";
  switch (phase) {
    case "preparing":
      message = t("apple_iap_phase_preparing");
      tone = "info";
      break;
    case "purchasing":
      message = t("apple_iap_phase_purchasing");
      tone = "info";
      break;
    case "awaiting_approval":
      message = t("apple_iap_phase_awaiting_approval");
      tone = "info";
      break;
    case "verifying":
      message = t(delayed ? "apple_iap_phase_verifying_delayed" : "apple_iap_phase_verifying");
      tone = delayed ? "warning" : "info";
      break;
    case "credited":
      message =
        attempt?.kind === "cash" && attempt.cashAmountMinor != null
          ? t("apple_iap_phase_credited_cash", { amount: formatDeliveryAdPhpMinor(attempt.cashAmountMinor) })
          : t("apple_iap_phase_credited_point", {
              points: `${(attempt?.pointAmount ?? 0).toLocaleString()}P`,
            });
      tone = "success";
      break;
    case "cancelled":
      message = t("apple_iap_phase_cancelled");
      tone = "info";
      break;
    case "failed":
      message = t((errorCode && PREPARE_ERROR_KEYS[errorCode]) || "apple_iap_phase_failed");
      tone = "danger";
      break;
    case "review":
      message = t("apple_iap_phase_review");
      tone = "warning";
      break;
    case "refund_review":
      message = t("apple_iap_phase_refund_review");
      tone = "warning";
      break;
  }

  const toneClass = {
    info: "bg-sam-info-soft",
    success: "bg-sam-success-soft",
    warning: "bg-sam-warning-soft",
    danger: "bg-sam-danger-soft",
  }[tone];
  const showRecheck = phase === "verifying" || phase === "awaiting_approval";
  const showHelp = appleIapPhaseNeedsHelp(phase) || (phase === "verifying" && delayed);
  const showDismiss = phase === "credited" || phase === "cancelled" || phase === "failed";

  return (
    <div
      className={`mb-4 rounded-ui-rect px-3 py-2.5 sam-text-helper text-sam-fg ${toneClass}`}
      role={tone === "danger" ? "alert" : "status"}
      aria-live="polite"
      data-apple-iap-phase={phase}
    >
      <p>{message}</p>
      {reference && (showHelp || phase === "credited") ? (
        <p className="mt-1 font-mono text-sam-muted">{t("apple_iap_reference", { id: reference })}</p>
      ) : null}
      {showRecheck || showHelp || showDismiss ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {showRecheck ? (
            <button type="button" className={btn} disabled={busy} onClick={onRecheck}>
              {t("apple_iap_cta_recheck")}
            </button>
          ) : null}
          {showHelp ? (
            <Link href={MYPAGE_CUSTOMER_CENTER_HREF} className={btn}>
              {t("apple_iap_cta_help")}
            </Link>
          ) : null}
          {showDismiss ? (
            <button type="button" className={btn} onClick={onDismiss}>
              {t(phase === "failed" ? "apple_iap_cta_retry" : "apple_iap_cta_done")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
