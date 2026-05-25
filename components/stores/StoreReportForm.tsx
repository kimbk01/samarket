"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { runSingleFlight } from "@/lib/http/run-single-flight";

const REASON_OPTIONS: {
  value: string;
  labelKey:
    | "store_report_reason_spam"
    | "store_report_reason_fraud"
    | "store_report_reason_illegal"
    | "store_report_reason_harassment"
    | "store_report_reason_misleading"
    | "store_report_reason_other";
}[] = [
  { value: "spam", labelKey: "store_report_reason_spam" },
  { value: "fraud", labelKey: "store_report_reason_fraud" },
  { value: "illegal", labelKey: "store_report_reason_illegal" },
  { value: "harassment", labelKey: "store_report_reason_harassment" },
  { value: "misleading", labelKey: "store_report_reason_misleading" },
  { value: "other", labelKey: "store_report_reason_other" },
];

export function StoreReportForm({
  storeSlug,
  mode,
  productId,
}: {
  storeSlug: string;
  mode: "store" | "product";
  productId?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [reason, setReason] = useState("other");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr((prev) => (prev === null ? prev : null));
    if (!message.trim()) {
      setErr(t("store_report_err_empty"));
      return;
    }
    setBusy((prev) => (prev ? prev : true));
    try {
      const dedupeKey = `store-report:${mode}:${storeSlug}:${productId ?? ""}:${reason}:${message.trim()}`;
      const res = await runSingleFlight(dedupeKey, () =>
        fetch("/api/me/store-reports", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            store_slug: storeSlug,
            target_type: mode,
            product_id: mode === "product" ? productId : undefined,
            reason_type: reason,
            message: message.trim(),
          }),
        })
      );
      const json = await res.json();
      if (res.status === 401) {
        setErr(t("common_login_required"));
        return;
      }
      if (json?.error === "report_recent_duplicate") {
        setErr(t("store_report_err_duplicate"));
        return;
      }
      if (!json?.ok) {
        setErr(json?.error ?? t("store_report_err_failed"));
        return;
      }
      setOk((prev) => (prev ? prev : true));
    } catch {
      setErr(t("common_network_error"));
    } finally {
      setBusy((prev) => (prev ? false : prev));
    }
  }

  if (ok) {
    return (
      <div className="rounded-ui-rect border border-sam-success/15 bg-sam-success-soft p-4 sam-text-body text-sam-success">
        <p className="font-medium">{t("store_report_submitted")}</p>
        <p className="mt-1 sam-text-body-secondary text-sam-success">{t("store_report_followup")}</p>
        <button
          type="button"
          className="mt-4 sam-text-body-secondary font-medium text-sam-success underline"
          onClick={() => router.push(`/stores/${encodeURIComponent(storeSlug)}`)}
        >
          {t("common_back_to_store")}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="sam-text-helper">
        {mode === "store"
          ? t("store_report_target_store")
          : t("store_report_target_product")}
      </p>
      <label className="sam-form-field block">
        <span className="sam-form-label">{t("store_report_reason")}</span>
        <select
          className="sam-select mt-1"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          {REASON_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.labelKey)}
            </option>
          ))}
        </select>
      </label>
      <label className="sam-form-field block">
        <span className="sam-form-label">{t("store_report_detail_label")}</span>
        <textarea
          className="sam-textarea mt-1 min-h-[96px]"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={2000}
          placeholder={t("store_report_detail_placeholder")}
        />
      </label>
      {err ? <p className="sam-text-helper text-sam-danger">{err}</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="sam-btn-primary w-full disabled:opacity-50"
      >
        {busy ? t("store_report_submitting") : t("store_report_submit_btn")}
      </button>
    </form>
  );
}
