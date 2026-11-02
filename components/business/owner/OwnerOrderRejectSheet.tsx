"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet, DibayOverlayButton } from "@/components/ui/dibay-overlay";
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
      ariaLabel={title ?? t("business_phase7_261")}
      contentPaddingBottomPx={contentPaddingBottomPx}
    >
      <p className={`mt-1 ${OverlayUi.bodySecondary}`}>{description ?? t("business_phase7_137")}</p>

      <div className="mt-3 flex flex-col gap-2">
        {REASON_KEYS.map((key) => (
          <label
            key={key}
            data-selected={reasonKey === key ? "true" : undefined}
            className={`${OverlayUi.selectCard} cursor-pointer`}
          >
            <input
              type="radio"
              name="reject-reason"
              className="h-4 w-4 accent-[color:var(--overlay-primary)]"
              checked={reasonKey === key}
              onChange={() => setReasonKey(key)}
              disabled={busy}
            />
            <span>{t(key)}</span>
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
            className="mt-1 w-full rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)] px-3 py-2 text-[length:var(--overlay-body-1-size)] text-[color:var(--overlay-text-primary)]"
          />
        </label>
      ) : null}

      {/* 시트 CTA = 보조 왼쪽 · 주 오른쪽 (UI·CTA 공통 기준 §1-4) */}
      <div className={OverlayUi.actionsRow}>
        <DibayOverlayButton roleTone="secondary" disabled={busy} onClick={onClose}>
          {t("common_close")}
        </DibayOverlayButton>
        <DibayOverlayButton
          roleTone="destructive"
          disabled={busy || (reasonKey === OTHER_REASON_KEY && !other.trim())}
          onClick={() => onConfirm(label)}
        >
          {busy ? t("common_processing") : (confirmLabel ?? t("business_phase7_261"))}
        </DibayOverlayButton>
      </div>
    </DibayBottomSheet>
  );
}
