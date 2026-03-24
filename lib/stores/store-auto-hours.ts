import { coerceBusinessHoursRecord } from "@/lib/stores/coerce-business-hours-json";

export type AutoBusinessHoursConfig = {
  enabled: true;
  timezone: string;
  open: string;
  close: string;
};

/** "9:00" | "09:00" → "09:00", 실패 시 null */
export function normalizeHHMM(raw: string): string | null {
  const t = raw.trim();
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(t);
  if (!m) return null;
  const h = String(Number(m[1])).padStart(2, "0");
  return `${h}:${m[2]}`;
}

function hhmmToMinutes(hhmm: string): number | null {
  const n = normalizeHHMM(hhmm);
  if (!n) return null;
  const [h, m] = n.split(":").map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function getClockMinutesInTimeZone(date: Date, timeZone: string): number | null {
  try {
    const dtf = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    });
    const parts = dtf.formatToParts(date);
    const hv = parts.find((p) => p.type === "hour")?.value ?? "0";
    const mv = parts.find((p) => p.type === "minute")?.value ?? "0";
    const h = Number(hv);
    const m = Number(mv);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  } catch {
    return null;
  }
}

export function readAutoBusinessHoursConfig(json: unknown): AutoBusinessHoursConfig | null {
  const o = coerceBusinessHoursRecord(json);
  const a = o.auto_business_hours;
  if (!a || typeof a !== "object" || Array.isArray(a)) return null;
  const rec = a as Record<string, unknown>;
  if (rec.enabled !== true) return null;
  const tz =
    typeof rec.timezone === "string" && rec.timezone.trim()
      ? rec.timezone.trim()
      : "Asia/Manila";
  const open = typeof rec.open === "string" ? normalizeHHMM(rec.open) : null;
  const close = typeof rec.close === "string" ? normalizeHHMM(rec.close) : null;
  if (!open || !close) return null;
  if (open === close) return null;
  return { enabled: true, timezone: tz, open, close };
}

export function isNowWithinAutoSchedule(cfg: AutoBusinessHoursConfig, now: Date): boolean {
  const openM = hhmmToMinutes(cfg.open);
  const closeM = hhmmToMinutes(cfg.close);
  const nowM = getClockMinutesInTimeZone(now, cfg.timezone);
  if (openM == null || closeM == null || nowM == null) return false;
  if (openM < closeM) {
    return nowM >= openM && nowM < closeM;
  }
  return nowM >= openM || nowM < closeM;
}

/** auto_business_hours.timezone 또는 기본값 */
export function readStoreFrontTimeZone(businessHoursJson: unknown): string {
  const autoCfg = readAutoBusinessHoursConfig(businessHoursJson);
  if (autoCfg) return autoCfg.timezone;
  const o = coerceBusinessHoursRecord(businessHoursJson);
  const a = o.auto_business_hours;
  if (a && typeof a === "object" && !Array.isArray(a)) {
    const t = (a as Record<string, unknown>).timezone;
    if (typeof t === "string" && t.trim()) return t.trim();
  }
  return "Asia/Manila";
}

/** 정규화된 휴게 구간(없으면 null) */
export function readNormalizedBreakInterval(
  businessHoursJson: unknown
): { start: string; end: string } | null {
  const { breakHoursStart, breakHoursEnd } = readBreakHoursFormFields(businessHoursJson);
  const s = normalizeHHMM(breakHoursStart.trim());
  const e = normalizeHHMM(breakHoursEnd.trim());
  if (!s || !e || s === e) return null;
  return { start: s, end: e };
}

function isNowWithinBreakWindow(
  startHHmm: string,
  endHHmm: string,
  timeZone: string,
  now: Date
): boolean {
  const startM = hhmmToMinutes(startHHmm);
  const endM = hhmmToMinutes(endHHmm);
  const nowM = getClockMinutesInTimeZone(now, timeZone);
  if (startM == null || endM == null || nowM == null) return false;
  if (startM < endM) {
    return nowM >= startM && nowM < endM;
  }
  return nowM >= startM || nowM < endM;
}

export type StoreFrontCommerceState = {
  /** 메뉴 담기·주문 가능 */
  isOpenForCommerce: boolean;
  /** 휴게 시간대 안(영업 시간대 안에서만 true) */
  inBreak: boolean;
  breakConfigured: boolean;
  /** 표시용 "HH:mm–HH:mm" */
  breakRangeLabel: string;
};

/**
 * 공개 매장 — 영업 스케줄·임시휴무·휴게 시간 반영.
 * - 휴게 중이면 isOpenForCommerce false, inBreak true
 */
export function resolveStoreFrontCommerceState(
  businessHoursJson: unknown,
  dbIsOpen: boolean | null | undefined,
  now: Date = new Date()
): StoreFrontCommerceState {
  const breakIv = readNormalizedBreakInterval(businessHoursJson);
  const breakConfigured = breakIv != null;
  const breakRangeLabel = breakIv ? `${breakIv.start}–${breakIv.end}` : "";
  const tz = readStoreFrontTimeZone(businessHoursJson);
  const autoCfg = readAutoBusinessHoursConfig(businessHoursJson);
  const dbOk = dbIsOpen !== false;

  const withinSchedule = autoCfg ? isNowWithinAutoSchedule(autoCfg, now) : true;
  const inBreak =
    breakIv != null &&
    dbOk &&
    withinSchedule &&
    isNowWithinBreakWindow(breakIv.start, breakIv.end, tz, now);

  const isOpenForCommerce = dbOk && withinSchedule && !inBreak;

  return {
    isOpenForCommerce,
    inBreak,
    breakConfigured,
    breakRangeLabel,
  };
}

/**
 * 공개 매장 UI용 영업중(주문 가능) 여부.
 * - 자동 영업시간·휴게·DB is_open 반영
 */
export function resolveStoreFrontOpen(
  businessHoursJson: unknown,
  dbIsOpen: boolean | null | undefined,
  now: Date = new Date()
): boolean {
  return resolveStoreFrontCommerceState(businessHoursJson, dbIsOpen, now).isOpenForCommerce;
}

/** 오너 폼 초기값 — DB에 auto 없으면 기존 weekdays 문구에서 시각 추출 시도 */
export function readAutoHoursFormFields(raw: unknown): {
  autoHoursTz: string;
  autoHoursOpen: string;
  autoHoursClose: string;
} {
  const o = coerceBusinessHoursRecord(raw);
  const a = o.auto_business_hours;
  if (a && typeof a === "object" && !Array.isArray(a)) {
    const r = a as Record<string, unknown>;
    if (r.enabled === true) {
      return {
        autoHoursTz:
          typeof r.timezone === "string" && r.timezone.trim()
            ? r.timezone.trim()
            : "Asia/Manila",
        autoHoursOpen: typeof r.open === "string" ? r.open : "09:00",
        autoHoursClose: typeof r.close === "string" ? r.close : "22:00",
      };
    }
  }
  const wd =
    typeof o.weekdays === "string"
      ? o.weekdays
      : typeof o.weekdays_hours === "string"
        ? o.weekdays_hours
        : "";
  const m = /(\d{1,2}:\d{2})\s*[-–~〜]\s*(\d{1,2}:\d{2})/.exec(wd);
  let open = "09:00";
  let close = "22:00";
  if (m) {
    const o1 = normalizeHHMM(m[1] ?? "");
    const o2 = normalizeHHMM(m[2] ?? "");
    if (o1 && o2) {
      open = o1;
      close = o2;
    }
  }
  return {
    autoHoursTz: "Asia/Manila",
    autoHoursOpen: open,
    autoHoursClose: close,
  };
}

/** business_hours_json — 휴게(쉬는 시간) 구간. 비우면 저장 시 break 필드 생략 */
export function readBreakHoursFormFields(raw: unknown): {
  breakHoursStart: string;
  breakHoursEnd: string;
} {
  const o = coerceBusinessHoursRecord(raw);
  const bh = o.break_hours;
  if (bh && typeof bh === "object" && !Array.isArray(bh)) {
    const r = bh as Record<string, unknown>;
    const s =
      typeof r.start === "string"
        ? normalizeHHMM(r.start)
        : typeof r.open === "string"
          ? normalizeHHMM(r.open)
          : null;
    const e =
      typeof r.end === "string"
        ? normalizeHHMM(r.end)
        : typeof r.close === "string"
          ? normalizeHHMM(r.close)
          : null;
    if (s && e && s !== e) {
      return { breakHoursStart: s, breakHoursEnd: e };
    }
  }
  const legacy = String(o.break_time ?? o.breakTime ?? "").trim();
  if (legacy && legacy !== "없음") {
    const seg = legacy.split(/[–\-~〜]/);
    if (seg.length >= 2) {
      const s = normalizeHHMM(seg[0].trim());
      const tail = seg[1].trim().split(/\s+/)[0] ?? "";
      const e = normalizeHHMM(tail);
      if (s && e && s !== e) {
        return { breakHoursStart: s, breakHoursEnd: e };
      }
    }
  }
  return { breakHoursStart: "", breakHoursEnd: "" };
}

export const STORE_AUTO_TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: "Asia/Manila", label: "필리핀 (Asia/Manila)" },
  { value: "Asia/Seoul", label: "한국 (Asia/Seoul)" },
  { value: "Asia/Tokyo", label: "일본 (Asia/Tokyo)" },
  { value: "UTC", label: "UTC" },
];
