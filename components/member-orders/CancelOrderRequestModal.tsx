"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

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

  if (!open) return null;

  const needsExtra = preset === "member_order_cancel_reason_other";

  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/50 sm:items-center">
      <div className="w-full max-w-md rounded-t-[length:var(--ui-radius-rect)] bg-sam-surface p-4 shadow-xl sm:rounded-ui-rect">
        <h2 className="text-base font-bold text-sam-fg">{t("member_order_cancel_title")}</h2>
        <p className="mt-1 text-xs text-sam-muted">
          {t("member_order_cancel_notice")}
        </p>
        <div className="mt-3 space-y-2">
          {CANCEL_REASON_KEYS.map((key) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-2 rounded-ui-rect border border-sam-border-soft px-3 py-2 text-sm has-[:checked]:border-sam-border has-[:checked]:bg-sam-app"
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
          <label className="mt-3 block text-xs font-medium text-sam-muted">
            {t("member_order_cancel_detail")}
            <textarea
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
              placeholder={t("member_order_cancel_detail_placeholder")}
            />
          </label>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setExtra("");
              onClose();
            }}
            className="rounded-ui-rect border border-sam-border px-4 py-2 text-sm font-medium text-sam-fg"
          >
            {t("nav_close")}
          </button>
          <button
            type="button"
            onClick={() => {
              if (needsExtra && !extra.trim()) return;
              onConfirm(t(preset), needsExtra ? extra.trim() : undefined);
              setExtra("");
              onClose();
            }}
            className="rounded-ui-rect bg-sam-ink px-4 py-2 text-sm font-semibold text-white"
          >
            {t("member_order_request_action")}
          </button>
        </div>
      </div>
    </div>
  );
}
