"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayDialog, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

export function DeliveryReasonModal({
  open,
  title,
  label,
  confirmLabel,
  onClose,
  onConfirm,
  required,
}: {
  open: boolean;
  title: string;
  label: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  required?: boolean;
}) {
  const { t } = useI18n();
  const [text, setText] = useState("");

  const handleClose = () => {
    setText("");
    onClose();
  };

  return (
    <DibayDialog open={open} onClose={handleClose} dismissible title={title}>
      <label className={`mt-1 block ${OverlayUi.caption}`}>{label}</label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        className="mt-1 w-full rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] px-3 py-2 text-sm"
        placeholder={required ? t("admin_do_common_required_input") : t("admin_do_common_optional_input")}
      />
      <div className={`${OverlayUi.actionsRow} mt-4`}>
        <DibayOverlayButton roleTone="secondary" onClick={handleClose}>
          {t("admin_do_common_cancel")}
        </DibayOverlayButton>
        <DibayOverlayButton
          roleTone="primary"
          onClick={() => {
            if (required && !text.trim()) return;
            onConfirm(text.trim());
            setText("");
            onClose();
          }}
        >
          {confirmLabel}
        </DibayOverlayButton>
      </div>
    </DibayDialog>
  );
}
