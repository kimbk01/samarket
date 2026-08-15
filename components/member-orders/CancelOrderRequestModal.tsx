"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayDialog, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

const CANCEL_REASON_KEYS = [
  "member_order_cancel_reason_mistake",
  "member_order_cancel_reason_wrong_address",
  "member_order_cancel_reason_wrong_menu",
  "member_order_cancel_reason_store_contact",
  "member_order_cancel_reason_other",
] as const;

type CancelReasonKey = (typeof CANCEL_REASON_KEYS)[number];

export function CancelOrderRequestModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reasonLabel: string, detail?: string) => void;
}) {
  const { t } = useI18n();
  const [preset, setPreset] = useState<CancelReasonKey>(CANCEL_REASON_KEYS[0]);
  const [extra, setExtra] = useState("");

  const needsExtra = preset === "member_order_cancel_reason_other";

  const handleClose = () => {
    setExtra("");
    onClose();
  };

  return (
    <DibayDialog
      open={open}
      onClose={handleClose}
      dismissible
      title={t("member_order_cancel_title")}
      description={t("member_order_cancel_notice")}
    >
      <div className="mt-3 space-y-2">
        {CANCEL_REASON_KEYS.map((key) => (
          <label
            key={key}
            className="flex cursor-pointer items-center gap-2 rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] px-3 py-2 text-sm has-[:checked]:border-[color:var(--overlay-primary)] has-[:checked]:bg-[color:var(--overlay-secondary)]"
          >
            <input
              type="radio"
              name="cancel-reason"
              checked={preset === key}
              onChange={() => setPreset(key)}
            />
            {t(key)}
          </label>
        ))}
      </div>
      {needsExtra ? (
        <label className={`mt-3 block ${OverlayUi.caption}`}>
          {t("member_order_cancel_detail")}
          <textarea
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] px-3 py-2 text-sm"
            placeholder={t("member_order_cancel_detail_placeholder")}
          />
        </label>
      ) : null}
      <div className={`${OverlayUi.actionsRow} mt-4`}>
        <DibayOverlayButton roleTone="secondary" onClick={handleClose}>
          {t("nav_close")}
        </DibayOverlayButton>
        <DibayOverlayButton
          roleTone="primary"
          onClick={() => {
            if (needsExtra && !extra.trim()) return;
            onConfirm(t(preset), needsExtra ? extra.trim() : undefined);
            setExtra("");
            onClose();
          }}
        >
          {t("member_order_request_action")}
        </DibayOverlayButton>
      </div>
    </DibayDialog>
  );
}
