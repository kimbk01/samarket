"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet, DibayOverlayButton, DibayToast } from "@/components/ui/dibay-overlay";
import { OverlayUi, DIBAY_TOAST_MS } from "@/lib/ui/dibay-overlay-contract";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { useRequireAuthAction } from "@/hooks/use-require-auth-action";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { resolveStoreReportSubmitErrorKey } from "@/lib/stores/store-report-form-errors";

const REASONS = [
  { value: "spam", labelKey: "store_report_reason_spam" },
  { value: "fraud", labelKey: "store_report_reason_fraud" },
  { value: "illegal", labelKey: "store_report_reason_illegal" },
  { value: "harassment", labelKey: "store_report_reason_harassment" },
  { value: "misleading", labelKey: "store_report_reason_misleading" },
  { value: "other", labelKey: "store_report_reason_other" },
] as const;

/** 매장 리뷰 신고 — 기존 매장 신고 원장(`store_reports`, target_type `review`) · 관리자 매장 신고 큐 */
export function StoreReviewReportButton({ storeSlug, reviewId }: { storeSlug: string; reviewId: string }) {
  const { t } = useI18n();
  const requireAction = useRequireAuthAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("other");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), DIBAY_TOAST_MS);
    return () => window.clearTimeout(id);
  }, [toast]);

  if (!storeSlug || !reviewId) return null;

  const onOpen = async () => {
    if (!getCurrentUser()?.id) {
      await requireAction("community_report", () => setOpen(true));
      return;
    }
    setErr(null);
    setOpen(true);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!message.trim()) {
      setErr(t("store_report_err_empty"));
      return;
    }
    setBusy(true);
    try {
      const res = await runSingleFlight(`store-review-report:${reviewId}`, () =>
        fetch("/api/me/store-reports", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            store_slug: storeSlug,
            target_type: "review",
            review_id: reviewId,
            reason_type: reason,
            message: message.trim(),
          }),
        })
      );
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; code?: string };
      if (res.status === 401) {
        setErr(t("common_login_required"));
        return;
      }
      if (!json.ok) {
        setErr(t(resolveStoreReportSubmitErrorKey(json.code ?? json.error)));
        return;
      }
      setOpen(false);
      setMessage("");
      setToast(t("store_report_submitted"));
    } catch {
      setErr(t("common_network_error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void onOpen()}
        className="inline-flex min-h-6 items-center px-1 text-[12px] text-sam-muted"
        data-store-review-report=""
      >
        {t("common_report")}
      </button>
      {open ? (
        <DibayBottomSheet
          open
          onClose={() => {
            if (!busy) setOpen(false);
          }}
          title={t("common_report")}
          ariaLabel={t("common_report")}
        >
          <form onSubmit={(e) => void onSubmit(e)} className="px-1 pb-2">
            <p className={`mb-3 ${OverlayUi.bodySecondary}`}>{t("store_report_target_review")}</p>
            <label className={`mb-1 block ${OverlayUi.caption}`}>{t("store_report_reason")}</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)] px-3 py-2 text-[length:var(--overlay-body-1-size)] text-[color:var(--overlay-text-primary)]"
            >
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {t(r.labelKey)}
                </option>
              ))}
            </select>
            <label className={`mb-1 mt-3 block ${OverlayUi.caption}`}>{t("store_report_detail_label")}</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 2000))}
              rows={4}
              placeholder={t("store_report_detail_placeholder")}
              className="w-full rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)] px-3 py-2 text-[length:var(--overlay-body-1-size)] text-[color:var(--overlay-text-primary)]"
            />
            {err ? <p className={`mt-2 ${OverlayUi.captionDanger}`}>{err}</p> : null}
            <div className="mt-4 flex gap-2">
              <DibayOverlayButton roleTone="secondary" type="button" disabled={busy} onClick={() => setOpen(false)}>
                {t("common_cancel")}
              </DibayOverlayButton>
              <DibayOverlayButton roleTone="primary" type="submit" disabled={busy}>
                {busy ? t("store_report_submitting") : t("store_report_submit_btn")}
              </DibayOverlayButton>
            </div>
          </form>
        </DibayBottomSheet>
      ) : null}
      {toast ? <DibayToast message={toast} tone="success" /> : null}
    </>
  );
}
