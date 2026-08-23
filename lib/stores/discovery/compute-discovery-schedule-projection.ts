import {
  getClockMinutesInTimeZone,
  readAutoBusinessHoursConfig,
  readNormalizedBreakInterval,
  readStoreFrontTimeZone,
  resolveStoreFrontCommerceState,
} from "@/lib/stores/store-auto-hours";
import { isStorePointCommerceBlocked } from "@/lib/stores/store-point-commerce-block";

export type DiscoveryScheduleState =
  | "ORDERABLE"
  | "IN_BREAK"
  | "CLOSED"
  | "PREPARING"
  | "UNKNOWN";

export type DiscoveryScheduleProjectionInput = {
  business_hours_json: unknown;
  is_open: boolean | null;
  point_commerce_blocked?: boolean | null;
  now?: Date;
};

export type DiscoveryScheduleProjection = {
  discoveryScheduleState: DiscoveryScheduleState;
  nextScheduleTransitionAt: string | null;
};

function hhmmToMinutes(hhmm: string): number | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(hhmm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function zonedDateParts(date: Date, timeZone: string): { y: number; m: number; d: number } | null {
  try {
    const dtf = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = dtf.formatToParts(date);
    const y = Number(parts.find((p) => p.type === "year")?.value);
    const m = Number(parts.find((p) => p.type === "month")?.value);
    const d = Number(parts.find((p) => p.type === "day")?.value);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    return { y, m, d };
  } catch {
    return null;
  }
}

function zonedDateTimeToUtcMs(
  timeZone: string,
  y: number,
  m: number,
  d: number,
  minutes: number
): number | null {
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  let guess = Date.UTC(y, m - 1, d, hh, mm, 0, 0);
  for (let i = 0; i < 5; i += 1) {
    const probe = new Date(guess);
    const clock = getClockMinutesInTimeZone(probe, timeZone);
    const parts = zonedDateParts(probe, timeZone);
    if (clock == null || parts == null) return null;
    const dayDelta =
      (Date.UTC(parts.y, parts.m - 1, parts.d) - Date.UTC(y, m - 1, d)) / 86_400_000;
    const deltaMin = dayDelta * 24 * 60 + (clock - minutes);
    if (deltaMin === 0) return guess;
    guess -= deltaMin * 60_000;
  }
  return guess;
}

function collectScheduleBoundaryMinutes(
  businessHoursJson: unknown,
  now: Date
): number[] {
  const auto = readAutoBusinessHoursConfig(businessHoursJson);
  if (!auto) return [];
  const openM = hhmmToMinutes(auto.open);
  const closeM = hhmmToMinutes(auto.close);
  const breakIv = readNormalizedBreakInterval(businessHoursJson);
  const mins = new Set<number>();
  if (openM != null) mins.add(openM);
  if (closeM != null) mins.add(closeM);
  if (breakIv) {
    const bs = hhmmToMinutes(breakIv.start);
    const be = hhmmToMinutes(breakIv.end);
    if (bs != null) mins.add(bs);
    if (be != null) mins.add(be);
  }
  const tz = auto.timezone;
  const today = zonedDateParts(now, tz);
  if (!today) return [];
  const out: number[] = [];
  for (const minute of mins) {
    const todayMs = zonedDateTimeToUtcMs(tz, today.y, today.m, today.d, minute);
    if (todayMs != null && todayMs > now.getTime()) out.push(todayMs);
    const tomorrow = new Date(Date.UTC(today.y, today.m - 1, today.d) + 86_400_000);
    const tp = zonedDateParts(tomorrow, tz);
    if (!tp) continue;
    const tomorrowMs = zonedDateTimeToUtcMs(tz, tp.y, tp.m, tp.d, minute);
    if (tomorrowMs != null && tomorrowMs > now.getTime()) out.push(tomorrowMs);
  }
  return out.sort((a, b) => a - b);
}

/** Canonical schedule projection — reuses store-auto-hours commerce authority. */
export function computeDiscoveryScheduleProjection(
  input: DiscoveryScheduleProjectionInput
): DiscoveryScheduleProjection {
  const now = input.now ?? new Date();
  const commerce = resolveStoreFrontCommerceState(
    input.business_hours_json,
    input.is_open,
    now
  );
  const blocked = isStorePointCommerceBlocked({
    point_commerce_blocked: input.point_commerce_blocked,
  });

  let discoveryScheduleState: DiscoveryScheduleState;
  if (blocked) {
    discoveryScheduleState = "PREPARING";
  } else if (commerce.inBreak) {
    discoveryScheduleState = "IN_BREAK";
  } else if (commerce.isOpenForCommerce) {
    discoveryScheduleState = "ORDERABLE";
  } else if (!commerce.isOpenForCommerce) {
    discoveryScheduleState = "CLOSED";
  } else {
    discoveryScheduleState = "UNKNOWN";
  }

  const boundaries = collectScheduleBoundaryMinutes(input.business_hours_json, now);
  const nextMs = boundaries[0] ?? null;

  return {
    discoveryScheduleState,
    nextScheduleTransitionAt: nextMs != null ? new Date(nextMs).toISOString() : null,
  };
}

export function readDiscoveryScheduleTimeZone(businessHoursJson: unknown): string {
  return readStoreFrontTimeZone(businessHoursJson);
}
