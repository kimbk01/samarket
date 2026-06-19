"use client";

import { useEffect, useState } from "react";
import { Biz } from "@/lib/ui/biz-component-classes";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

const REASON_KEYS = [
  "business_phase7_343",
  "business_phase7_344",
  "business_phase7_345",
  "business_phase7_346",
  "business_phase7_347",
  "business_phase7_348",
] as const;

type ReasonKey = (typeof REASON_KEYS)[number];

const OTHER_REASON_KEY: ReasonKey = "business_phase7_348";

export function OwnerOrderRejectSheet({
  open,
  busy,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reasonLabel: string) => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
}) {
  const { t } = useI18n();
  const [reasonKey, setReasonKey] = useState<ReasonKey>(REASON_KEYS[0]!);
  const [other, setOther] = useState("");

  useEffect(() => {
    if (!open) return;
    setReasonKey(REASON_KEYS[0]!);
    setOther("");
  }, [open]);

  if (!open) return null;

  const otherFallback = t(OTHER_REASON_KEY);
  const label =
    reasonKey === OTHER_REASON_KEY ? other.trim() || otherFallback : t(reasonKey);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="owner-order-reject-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label={t("common_close")}
        disabled={busy}
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        className={[
          "relative z-[1] w-full max-w-md rounded-t-[16px] border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] p-4 shadow-2xl sm:rounded-[16px]",
          "max-h-[min(90vh,520px)] overflow-y-auto pb-[max(1rem,var(--safe-bottom))]",
        ].join(" ")}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--biz-card-border)] sm:hidden" aria-hidden />
        <h2 id="owner-order-reject-title" className={Biz.textCardTitle}>
          {title ?? t("business_phase7_261")}
        </h2>
        <p className={`mt-1 ${Biz.textMuted}`}>{description ?? t("business_phase7_137")}</p>

        <div className="mt-3 flex flex-col gap-2">
          {REASON_KEYS.map((key) => (
            <label
              key={key}
              className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-[14px] border px-3 ${
                reasonKey === key
                  ? "border-[var(--biz-primary)] bg-[var(--biz-primary-soft)]"
                  : "border-[var(--biz-card-border)] bg-[var(--biz-app-bg)]"
              }`}
            >
              <input
                type="radio"
                name="reject-reason"
                className="h-4 w-4 accent-[var(--biz-primary)]"
                checked={reasonKey === key}
                onChange={() => setReasonKey(key)}
                disabled={busy}
              />
              <span className="text-[14px] font-medium text-[var(--biz-text)]">{t(key)}</span>
            </label>
          ))}
        </div>

        {reasonKey === OTHER_REASON_KEY ? (
          <label className="mt-3 block">
            <span className="text-[12px] font-medium text-[var(--biz-text-muted)]">{t("business_phase7_041")}</span>
            <textarea
              disabled={busy}
              value={other}
              onChange={(e) => setOther(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-[14px] border border-[var(--biz-card-border)] bg-[var(--biz-app-bg)] px-3 py-2 text-[14px] text-[var(--biz-text)]"
            />
          </label>
        ) : null}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" disabled={busy} onClick={onClose} className={[Biz.btnOutline, "w-full sm:w-auto"].join(" ")}>
            {t("common_close")}
          </button>
          <button
            type="button"
            disabled={busy || (reasonKey === OTHER_REASON_KEY && !other.trim())}
            onClick={() => onConfirm(label)}
            className="w-full rounded-[14px] border border-red-200 bg-white px-4 py-3 text-[15px] font-semibold text-red-700 shadow-sm sm:w-auto min-h-[52px]"
          >
            {busy ? t("common_processing") : (confirmLabel ?? t("business_phase7_261"))}
          </button>
        </div>
      </div>
    </div>
  );
}
