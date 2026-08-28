"use client";

import { useEffect, useMemo, useState } from "react";
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

function pad2(n: number | string): string {
  return String(n).padStart(2, "0");
}

function parseParts(value: string): { date: string; hour: string; minute: string } {
  const v = value.trim();
  if (!v) return { date: "", hour: "00", minute: "00" };
  const local = v.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (local) {
    return { date: local[1], hour: local[2], minute: local[3] };
  }
  try {
    const d = new Date(v);
    if (!Number.isFinite(d.getTime())) return { date: "", hour: "00", minute: "00" };
    return {
      date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
      hour: pad2(d.getHours()),
      minute: pad2(d.getMinutes()),
    };
  } catch {
    return { date: "", hour: "00", minute: "00" };
  }
}

function buildLocalValue(date: string, hour: string, minute: string): string {
  if (!date.trim()) return "";
  return `${date}T${pad2(hour)}:${pad2(minute)}`;
}

const HOURS = Array.from({ length: 24 }, (_, i) => pad2(i));
const MINUTES = Array.from({ length: 60 }, (_, i) => pad2(i));

/**
 * Sales window datetime — explicit date / hour / minute inside DibayDialog.
 * Confirm applies to form draft only; parent decides when to PATCH.
 */
export function GiftSalesDateTimeField({
  label,
  value,
  onChange,
  allowEmpty = true,
  emptyLabel,
  previousValue,
  "data-testid": dataTestId,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  /** Canonical value — show before → after when draft differs. */
  previousValue?: string;
  "data-testid"?: string;
}) {
  const { safeT } = useI18n();
  const [open, setOpen] = useState(false);
  const [draftDate, setDraftDate] = useState("");
  const [draftHour, setDraftHour] = useState("00");
  const [draftMinute, setDraftMinute] = useState("00");
  const resolvedEmpty =
    emptyLabel ??
    safeT("gift_ops_datetime_unset", {
      fallbackKo: "설정 안 함",
      fallbackEn: "Not set",
    });

  useEffect(() => {
    if (!open) return;
    const parts = parseParts(value);
    setDraftDate(parts.date);
    setDraftHour(parts.hour);
    setDraftMinute(parts.minute);
  }, [open, value]);

  const draftLocal = buildLocalValue(draftDate, draftHour, draftMinute);
  const showDiff =
    previousValue !== undefined &&
    (parseParts(previousValue).date !== parseParts(value).date ||
      buildLocalValue(parseParts(value).date, parseParts(value).hour, parseParts(value).minute) !==
        buildLocalValue(parseParts(previousValue).date, parseParts(previousValue).hour, parseParts(previousValue).minute));

  const confirmLabel = safeT("gift_ops_datetime_apply", {
    fallbackKo: "선택 완료",
    fallbackEn: "Apply selection",
  });

  const hourOptions = useMemo(() => HOURS, []);
  const minuteOptions = useMemo(() => MINUTES, []);

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

      {showDiff ? (
        <p className="text-xs text-sam-muted" data-gift-sales-datetime-diff="1">
          {formatDisplay(previousValue ?? "", resolvedEmpty)}
          {" → "}
          <span className="font-semibold text-sam-fg">{formatDisplay(value, resolvedEmpty)}</span>
        </p>
      ) : null}

      <DibayDialog
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        actions={[
          {
            key: "cancel",
            label: safeT("gift_ops_datetime_cancel", { fallbackKo: "취소", fallbackEn: "Cancel" }),
            onClick: () => setOpen(false),
            roleTone: "secondary",
          },
          {
            key: "confirm",
            label: confirmLabel,
            onClick: () => {
              onChange(draftLocal.trim());
              setOpen(false);
            },
            roleTone: "primary",
          },
        ]}
      >
        <div className="mt-3 space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="text-sam-muted">
              {safeT("gift_ops_datetime_date_label", {
                fallbackKo: "날짜",
                fallbackEn: "Date",
              })}
            </span>
            <input
              className={Sam.input.base}
              type="date"
              value={draftDate}
              data-gift-sales-datetime-date="1"
              onChange={(e) => setDraftDate(e.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1 text-sm">
              <span className="text-sam-muted">
                {safeT("gift_ops_datetime_hour_label", {
                  fallbackKo: "시",
                  fallbackEn: "Hour",
                })}
              </span>
              <select
                className={Sam.input.base}
                value={draftHour}
                data-gift-sales-datetime-hour="1"
                onChange={(e) => setDraftHour(e.target.value)}
              >
                {hourOptions.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-sam-muted">
                {safeT("gift_ops_datetime_minute_label", {
                  fallbackKo: "분",
                  fallbackEn: "Minute",
                })}
              </span>
              <select
                className={Sam.input.base}
                value={draftMinute}
                data-gift-sales-datetime-minute="1"
                onChange={(e) => setDraftMinute(e.target.value)}
              >
                {minuteOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {allowEmpty ? (
            <button
              type="button"
              className={`${Sam.btn.secondary} min-h-[44px] w-full px-4`}
              data-gift-sales-datetime-clear="1"
              onClick={() => {
                setDraftDate("");
                setDraftHour("00");
                setDraftMinute("00");
              }}
            >
              {safeT("gift_ops_datetime_clear", {
                fallbackKo: "비우기",
                fallbackEn: "Clear",
              })}
            </button>
          ) : null}
          {previousValue !== undefined && draftLocal !== value ? (
            <p className="text-xs text-sam-muted">
              {formatDisplay(previousValue, resolvedEmpty)} → {formatDisplay(draftLocal, resolvedEmpty)}
            </p>
          ) : null}
        </div>
      </DibayDialog>
    </div>
  );
}
