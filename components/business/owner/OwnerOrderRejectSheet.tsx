"use client";

import { useEffect, useState } from "react";
import { Biz } from "@/lib/ui/biz-component-classes";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { useOwnerAdminBottomSheetKeyboard } from "@/lib/business/use-owner-admin-bottom-sheet-keyboard";

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

  const otherFallback = t(OTHER_REASON_KEY);
  const label =
    reasonKey === OTHER_REASON_KEY ? other.trim() || otherFallback : t(reasonKey);
  const { contentPaddingBottomPx } = useOwnerAdminBottomSheetKeyboard(open);

  return (
    <DibayBottomSheet
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={title ?? t("business_phase7_261")}
      anchor="above-bottom-nav"
      ariaLabel={title ?? t("business_phase7_261")}
      panelClassName="!max-w-md"
      contentPaddingBottomPx={contentPaddingBottomPx}
    >
      <p className={`mt-1 ${OverlayUi.bodySecondary}`}>{description ?? t("business_phase7_137")}</p>

      <div className="mt-3 flex flex-col gap-2">
        {REASON_KEYS.map((key) => (
          <label
            key={key}
            className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-[length:var(--overlay-radius-lg)] border px-3 ${
              reasonKey === key
                ? "border-[color:var(--overlay-primary)] bg-[color:var(--overlay-secondary)]"
                : "border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)]"
            }`}
          >
            <input
              type="radio"
              name="reject-reason"
              className="h-4 w-4 accent-[color:var(--overlay-primary)]"
              checked={reasonKey === key}
              onChange={() => setReasonKey(key)}
              disabled={busy}
            />
            <span className="text-[14px] font-medium text-[color:var(--overlay-text-primary)]">{t(key)}</span>
          </label>
        ))}
      </div>

      {reasonKey === OTHER_REASON_KEY ? (
        <label className="mt-3 block">
          <span className={OverlayUi.caption}>{t("business_phase7_041")}</span>
          <textarea
            disabled={busy}
            value={other}
            onChange={(e) => setOther(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-[length:var(--overlay-radius-lg)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)] px-3 py-2 text-[14px] text-[color:var(--overlay-text-primary)]"
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
          className="w-full min-h-[52px] rounded-[length:var(--overlay-radius-lg)] border border-red-200 bg-[color:var(--overlay-surface)] px-4 py-3 text-[15px] font-semibold text-[color:var(--overlay-danger)] shadow-sm active:scale-[var(--overlay-press-scale)] sm:w-auto"
        >
          {busy ? t("common_processing") : (confirmLabel ?? t("business_phase7_261"))}
        </button>
      </div>
    </DibayBottomSheet>
  );
}
