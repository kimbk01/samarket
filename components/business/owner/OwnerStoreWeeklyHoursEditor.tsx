"use client";

import { useState } from "react";
import {
  OWNER_STORE_PROFILE_CONTROL_CLASS,
  OWNER_STORE_PROFILE_FIELD_LABEL_CLASS,
  OWNER_STORE_PROFILE_SELECT_CLASS,
} from "@/lib/business/owner-store-stack";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { STORE_WEEKDAY_LABEL_KEY } from "@/lib/stores/store-weekly-hours-display";
import {
  isValidStoreYmd,
  STORE_CLOSED_DATES_MAX,
  STORE_WEEKDAY_DISPLAY_ORDER,
  STORE_WEEKLY_MAX_INTERVALS_PER_DAY,
  type StoreHoursInterval,
  type StoreWeekdayKey,
  type StoreWeeklyHours,
} from "@/lib/stores/store-weekly-hours";


type DayMode = "default" | "closed" | "custom";

function dayMode(weekly: StoreWeeklyHours | null, day: StoreWeekdayKey): DayMode {
  const v = weekly?.[day];
  if (v === undefined) return "default";
  return v.length === 0 ? "closed" : "custom";
}

/** 저장 전 검증 — 직접 지정 요일의 각 구간은 유효한 시각이고 시작≠종료 */
export function isOwnerWeeklyHoursDraftValid(weekly: StoreWeeklyHours | null): boolean {
  if (!weekly) return true;
  const re = /^([01]\d|2[0-3]):[0-5]\d$/;
  for (const day of STORE_WEEKDAY_DISPLAY_ORDER) {
    const v = weekly[day];
    if (!v) continue;
    for (const iv of v) {
      if (!re.test(iv.open) || !re.test(iv.close) || iv.open === iv.close) return false;
    }
  }
  return true;
}

/**
 * OPS-03 — 요일별 영업시간·휴무일(임시휴무) 편집. 값은 `business_hours_json.auto_business_hours.weekly / closed_dates`.
 * 매장 어드민 셸 §3 컨트롤 클래스 사용.
 */
export function OwnerStoreWeeklyHoursEditor({
  weekly,
  closedDates,
  defaultOpen,
  defaultClose,
  onChange,
}: {
  weekly: StoreWeeklyHours | null;
  closedDates: string[];
  defaultOpen: string;
  defaultClose: string;
  onChange: (next: { weekly: StoreWeeklyHours | null; closedDates: string[] }) => void;
}) {
  const { t } = useI18n();
  const [dateDraft, setDateDraft] = useState("");

  const setDay = (day: StoreWeekdayKey, value: StoreHoursInterval[] | undefined) => {
    const next: StoreWeeklyHours = { ...(weekly ?? {}) };
    if (value === undefined) delete next[day];
    else next[day] = value;
    const hasAny = STORE_WEEKDAY_DISPLAY_ORDER.some((d) => next[d] !== undefined);
    onChange({ weekly: hasAny ? next : null, closedDates });
  };

  const setMode = (day: StoreWeekdayKey, mode: DayMode) => {
    if (mode === "default") setDay(day, undefined);
    else if (mode === "closed") setDay(day, []);
    else setDay(day, [{ open: defaultOpen, close: defaultClose }]);
  };

  const updateInterval = (day: StoreWeekdayKey, idx: number, patch: Partial<StoreHoursInterval>) => {
    const cur = weekly?.[day] ?? [];
    setDay(
      day,
      cur.map((iv, i) => (i === idx ? { ...iv, ...patch } : iv))
    );
  };

  const addClosedDate = () => {
    const d = dateDraft.trim();
    if (!isValidStoreYmd(d) || closedDates.includes(d) || closedDates.length >= STORE_CLOSED_DATES_MAX) return;
    onChange({ weekly, closedDates: [...closedDates, d].sort() });
    setDateDraft("");
  };

  return (
    <div className="space-y-4 border-t border-[var(--biz-card-border)] pt-4" data-owner-weekly-hours-editor="1">
      <div>
        <span className={OWNER_STORE_PROFILE_FIELD_LABEL_CLASS}>{t("business_ops3b_weekly_title")}</span>
        <p className="mb-3 sam-text-helper text-[var(--biz-text-muted)]">{t("business_ops3b_weekly_hint")}</p>
        <div className="space-y-2">
          {STORE_WEEKDAY_DISPLAY_ORDER.map((day) => {
            const mode = dayMode(weekly, day);
            const intervals = weekly?.[day] ?? [];
            return (
              <div key={day} className="flex flex-wrap items-center gap-2" data-owner-weekly-day={day}>
                <span className="w-8 shrink-0 text-[13px] font-semibold text-[var(--biz-text)]">
                  {t(STORE_WEEKDAY_LABEL_KEY[day])}
                </span>
                <select
                  value={mode}
                  onChange={(e) => setMode(day, e.target.value as DayMode)}
                  className={`${OWNER_STORE_PROFILE_SELECT_CLASS} !w-auto min-w-[7.5rem]`}
                  aria-label={t(STORE_WEEKDAY_LABEL_KEY[day])}
                >
                  <option value="default">{t("business_ops3b_weekly_mode_default")}</option>
                  <option value="closed">{t("business_ops3b_weekly_mode_closed")}</option>
                  <option value="custom">{t("business_ops3b_weekly_mode_custom")}</option>
                </select>
                {mode === "custom"
                  ? intervals.map((iv, idx) => (
                      <span key={idx} className="flex items-center gap-1">
                        <input
                          type="time"
                          value={iv.open}
                          aria-label={t("business_ops3b_weekly_open")}
                          onChange={(e) => updateInterval(day, idx, { open: e.target.value })}
                          className={`${OWNER_STORE_PROFILE_CONTROL_CLASS} !w-[7rem]`}
                        />
                        <span className="text-[var(--biz-text-muted)]">–</span>
                        <input
                          type="time"
                          value={iv.close}
                          aria-label={t("business_ops3b_weekly_close")}
                          onChange={(e) => updateInterval(day, idx, { close: e.target.value })}
                          className={`${OWNER_STORE_PROFILE_CONTROL_CLASS} !w-[7rem]`}
                        />
                        {intervals.length > 1 ? (
                          <button
                            type="button"
                            className="px-1 text-[12px] font-semibold text-[var(--biz-text-muted)]"
                            onClick={() => setDay(day, intervals.filter((_, i) => i !== idx))}
                          >
                            {t("business_ops3b_closed_dates_remove")}
                          </button>
                        ) : null}
                      </span>
                    ))
                  : null}
                {mode === "custom" && intervals.length < STORE_WEEKLY_MAX_INTERVALS_PER_DAY ? (
                  <button
                    type="button"
                    className="px-1 text-[12px] font-semibold text-[var(--biz-primary)]"
                    onClick={() => setDay(day, [...intervals, { open: defaultOpen, close: defaultClose }])}
                    aria-label={`${t(STORE_WEEKDAY_LABEL_KEY[day])} +`}
                  >
                    +
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <span className={OWNER_STORE_PROFILE_FIELD_LABEL_CLASS}>{t("business_ops3b_closed_dates_title")}</span>
        <p className="mb-3 sam-text-helper text-[var(--biz-text-muted)]">{t("business_ops3b_closed_dates_hint")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={dateDraft}
            onChange={(e) => setDateDraft(e.target.value)}
            className={`${OWNER_STORE_PROFILE_CONTROL_CLASS} !w-auto`}
            aria-label={t("business_ops3b_closed_dates_title")}
          />
          <button
            type="button"
            onClick={addClosedDate}
            disabled={!isValidStoreYmd(dateDraft)}
            className="rounded-ui-rect border border-[var(--biz-primary)] px-3 py-2 text-[13px] font-semibold text-[var(--biz-primary)] disabled:opacity-40"
          >
            {t("business_ops3b_closed_dates_add")}
          </button>
        </div>
        {closedDates.length === 0 ? (
          <p className="mt-2 sam-text-helper text-[var(--biz-text-muted)]">{t("business_ops3b_closed_dates_empty")}</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {closedDates.map((d) => (
              <li
                key={d}
                className="flex items-center gap-1 rounded-full border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] px-3 py-1 text-[12px] text-[var(--biz-text)]"
              >
                <span className="tabular-nums">{d}</span>
                <button
                  type="button"
                  className="font-semibold text-[var(--biz-text-muted)]"
                  aria-label={`${t("business_ops3b_closed_dates_remove")} ${d}`}
                  onClick={() => onChange({ weekly, closedDates: closedDates.filter((x) => x !== d) })}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
