"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayDialog } from "@/components/ui/dibay-overlay";
import { Sam } from "@/lib/ui/sam-component-classes";

function formatDisplay(value: string, emptyLabel: string): string {
  const v = value.trim();
  if (!v) return emptyLabel;
  try {
    const d = new Date(v);
    if (!Number.isFinite(d.getTime())) return v;
    return d.toLocaleString();
  } catch {
    return v;
  }
}

/**
 * Sales window datetime — native `datetime-local` alone often has no clear
 * Confirm/Cancel on mobile WebView. Open a dialog with explicit actions.
 */
export function GiftSalesDateTimeField({
  label,
  value,
  onChange,
  allowEmpty = true,
  emptyLabel,
  "data-testid": dataTestId,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  "data-testid"?: string;
}) {
  const { safeT } = useI18n();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const resolvedEmpty =
    emptyLabel ??
    safeT("gift_ops_datetime_unset", {
      fallbackKo: "설정 안 함",
      fallbackEn: "Not set",
    });

  useEffect(() => {
    if (!open) return;
    setDraft(value);
  }, [open, value]);

  return (
    <div className="block space-y-1 text-sm" data-gift-sales-datetime-field={dataTestId ?? "1"}>
      <span className="block">{label}</span>
      <button
        type="button"
        className={`${Sam.input.base} flex min-h-[44px] w-full items-center justify-between gap-2 text-left`}
        data-gift-sales-datetime-trigger="1"
        onClick={() => setOpen(true)}
      >
        <span className={value.trim() ? "text-sam-fg" : "text-sam-muted"}>
          {formatDisplay(value, resolvedEmpty)}
        </span>
        <span className="shrink-0 text-xs font-semibold text-sam-primary">
          {safeT("gift_ops_datetime_change", {
            fallbackKo: "변경",
            fallbackEn: "Change",
          })}
        </span>
      </button>

      <DibayDialog
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        actions={[
          {
            key: "cancel",
            label: safeT("gift_admin_cta_back", { fallbackKo: "취소", fallbackEn: "Cancel" }),
            onClick: () => setOpen(false),
            roleTone: "secondary",
          },
          {
            key: "confirm",
            label: safeT("common_confirm", { fallbackKo: "확인", fallbackEn: "Confirm" }),
            onClick: () => {
              onChange(draft.trim());
              setOpen(false);
            },
            roleTone: "primary",
          },
        ]}
      >
        <div className="mt-3 space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="text-sam-muted">
              {safeT("gift_ops_datetime_picker_label", {
                fallbackKo: "날짜·시간",
                fallbackEn: "Date & time",
              })}
            </span>
            <input
              className={Sam.input.base}
              type="datetime-local"
              value={draft}
              data-gift-sales-datetime-input="1"
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
          {allowEmpty ? (
            <button
              type="button"
              className={`${Sam.btn.secondary} min-h-[44px] w-full px-4`}
              data-gift-sales-datetime-clear="1"
              onClick={() => setDraft("")}
            >
              {safeT("gift_ops_datetime_clear", {
                fallbackKo: "비우기",
                fallbackEn: "Clear",
              })}
            </button>
          ) : null}
        </div>
      </DibayDialog>
    </div>
  );
}
