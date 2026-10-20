/**
 * 통합 대시보드 기간 (설계 v4 §3 상태 줄 「기간: 오늘 · 어제 · 7일 · 30일 (PHT)」).
 * 기간은 PHT 날짜(양끝 포함)로 정하고, 질의는 UTC [fromIso, toIso) 로 바꾼다.
 * 기간 지표의 링크는 같은 날짜를 목록 필터로 넘긴다 → 대시보드 값 = 이동한 화면 값.
 * 클라이언트 안전.
 */
import { formatAdminManilaDate, manilaDateRangeToUtc } from "@/lib/admin/metrics/manila-period";

export const ADMIN_DASHBOARD_PERIODS = ["today", "yesterday", "7d", "30d"] as const;
export type AdminDashboardPeriod = (typeof ADMIN_DASHBOARD_PERIODS)[number];

export const ADMIN_DASHBOARD_DEFAULT_PERIOD: AdminDashboardPeriod = "today";

export const ADMIN_DASHBOARD_PERIOD_LABEL: Readonly<Record<AdminDashboardPeriod, { ko: string; en: string }>> = {
  today: { ko: "오늘", en: "Today" },
  yesterday: { ko: "어제", en: "Yesterday" },
  "7d": { ko: "7일", en: "7 days" },
  "30d": { ko: "30일", en: "30 days" },
};

/** `?period=` → 기간 (모르는 값 = 오늘). */
export function parseAdminDashboardPeriod(raw: string | null | undefined): AdminDashboardPeriod {
  const v = String(raw ?? "").trim();
  return (ADMIN_DASHBOARD_PERIODS as readonly string[]).includes(v)
    ? (v as AdminDashboardPeriod)
    : ADMIN_DASHBOARD_DEFAULT_PERIOD;
}

export type AdminDashboardPeriodRange = {
  period: AdminDashboardPeriod;
  /** PHT 날짜 "YYYY-MM-DD" (양끝 포함) */
  fromDay: string;
  toDay: string;
  /** UTC [fromIso, toIso) */
  fromIso: string;
  toIso: string;
  /** 추세 일수 (30일 = 30, 그 밖 = 7) — 추세는 선택 기간의 마지막 날(toDay)에서 끝나는 N일 */
  trendDays: 7 | 30;
  /** 추세 창 — PHT 날짜 [trendFromDay, trendToDay] (양끝 포함) · UTC [trendFromIso, trendToIso) */
  trend: AdminDashboardTrendWindow;
};

/** 추세 창 — 선택 기간이 끝나는 날(PHT)까지 N일. 「어제」면 어제에서 끝난다 (오늘까지 7일이 아니다). */
export type AdminDashboardTrendWindow = {
  days: 7 | 30;
  fromDay: string;
  toDay: string;
  fromIso: string;
  toIso: string;
};

export function resolveAdminDashboardTrendWindow(toDay: string, days: 7 | 30): AdminDashboardTrendWindow {
  const fromDay = shiftAdminDashboardDay(toDay, -(days - 1));
  const { fromIso, toIso } = manilaDateRangeToUtc(fromDay, toDay);
  return { days, fromDay, toDay, fromIso: fromIso as string, toIso: toIso as string };
}

/** 추세 창의 PHT 날짜 키 (오래된 날 → 마지막 날). */
export function adminDashboardTrendDayKeys(w: Pick<AdminDashboardTrendWindow, "days" | "toDay">): string[] {
  return Array.from({ length: w.days }, (_, i) => shiftAdminDashboardDay(w.toDay, i - (w.days - 1)));
}

/** 달력 날짜 "YYYY-MM-DD" ± N일 (시각 없는 날짜 산술 — 시간대 변환 없음). */
export function shiftAdminDashboardDay(day: string, deltaDays: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function resolveAdminDashboardPeriod(
  period: AdminDashboardPeriod,
  now: Date = new Date()
): AdminDashboardPeriodRange {
  const today = formatAdminManilaDate(now);
  const [fromDay, toDay] =
    period === "yesterday"
      ? [shiftAdminDashboardDay(today, -1), shiftAdminDashboardDay(today, -1)]
      : period === "7d"
        ? [shiftAdminDashboardDay(today, -6), today]
        : period === "30d"
          ? [shiftAdminDashboardDay(today, -29), today]
          : [today, today];
  const { fromIso, toIso } = manilaDateRangeToUtc(fromDay, toDay);
  const trendDays: 7 | 30 = period === "30d" ? 30 : 7;
  return {
    period,
    fromDay,
    toDay,
    fromIso: fromIso as string,
    toIso: toIso as string,
    trendDays,
    trend: resolveAdminDashboardTrendWindow(toDay, trendDays),
  };
}
