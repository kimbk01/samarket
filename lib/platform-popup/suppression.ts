/**
 * Platform Popup CUT 1 — suppression pure helpers.
 * TODAY = campaign timezone local calendar day end — NOT now+24h.
 */

import {
  PLATFORM_POPUP_DEFAULT_TIMEZONE,
  type PlatformPopupSuppressionMode,
} from "@/lib/platform-popup/types";

export type PlatformPopupSuppressionRecord = {
  mode: PlatformPopupSuppressionMode;
  sessionKey?: string | null;
  suppressUntil?: string | Date | null;
  campaignRevision?: string | null;
  timezone?: string | null;
  createdAt?: string | Date | null;
};

export type PlatformPopupSuppressionEvalInput = {
  now: Date;
  currentSessionKey?: string | null;
  currentCampaignRevision?: string | null;
  /** Campaign timezone (default Asia/Manila). */
  timezone?: string | null;
};

function asDate(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Local YYYY-MM-DD in the given IANA timezone. */
export function platformPopupLocalCalendarDate(
  instant: Date,
  timeZone: string = PLATFORM_POPUP_DEFAULT_TIMEZONE
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/**
 * End of the local calendar day that contains `instant` in `timeZone`,
 * returned as an absolute Date (exclusive upper bound for suppression).
 */
export function platformPopupLocalDayEndExclusive(
  instant: Date,
  timeZone: string = PLATFORM_POPUP_DEFAULT_TIMEZONE
): Date {
  const day = platformPopupLocalCalendarDate(instant, timeZone);
  // Manila is fixed UTC+8; for general TZ use noon probe + format to avoid DST edge ambiguity.
  // Product default is Asia/Manila (no DST). Construct next local midnight via UTC offset of TZ.
  const noonUtcGuess = new Date(`${day}T12:00:00+00:00`);
  const localAtNoon = platformPopupLocalCalendarDate(noonUtcGuess, timeZone);
  // Walk forward one calendar day in the same formatter space.
  const parts = day.split("-").map(Number) as [number, number, number];
  const next = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + 1, 0, 0, 0));
  // Convert "next local calendar date 00:00" by finding UTC instant whose local date is next day
  // and local time is 00:00 — binary search on a day window.
  const nextDay = platformPopupLocalCalendarDate(
    new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + 1, 12, 0, 0)),
    timeZone
  );
  void localAtNoon;
  // Use fixed offset path for Asia/Manila (CUT 0-C default); generic TZ: offset from formatter.
  if (timeZone === "Asia/Manila" || timeZone === "Asia/Singapore") {
    return new Date(`${nextDay}T00:00:00+08:00`);
  }
  // Generic: sample offsets near next midnight.
  let lo = next.getTime() - 36 * 3600 * 1000;
  let hi = next.getTime() + 36 * 3600 * 1000;
  for (let i = 0; i < 40; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const midDate = new Date(mid);
    const local = platformPopupLocalCalendarDate(midDate, timeZone);
    const hm = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(midDate);
    if (local < nextDay || (local === nextDay && hm < "00:00:00")) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return new Date(hi);
}

/** Compute suppress_until for a newly applied suppression action. */
export function computePlatformPopupSuppressUntil(
  mode: PlatformPopupSuppressionMode,
  input: {
    now: Date;
    timezone?: string | null;
    durationSeconds?: number | null;
  }
): Date | null {
  const tz = input.timezone?.trim() || PLATFORM_POPUP_DEFAULT_TIMEZONE;
  if (mode === "CLOSE" || mode === "SESSION" || mode === "CAMPAIGN") {
    return null;
  }
  if (mode === "TODAY") {
    return platformPopupLocalDayEndExclusive(input.now, tz);
  }
  if (mode === "DURATION") {
    const sec = input.durationSeconds;
    if (sec == null || !(sec > 0)) return null;
    return new Date(input.now.getTime() + sec * 1000);
  }
  return null;
}

/**
 * Returns true when the suppression still blocks exposure.
 * CLOSE never blocks future exposures (current exposure end only).
 */
export function isPlatformPopupSuppressionActive(
  record: PlatformPopupSuppressionRecord,
  evalInput: PlatformPopupSuppressionEvalInput
): boolean {
  const mode = record.mode;
  const now = evalInput.now;
  const tz =
    record.timezone?.trim() ||
    evalInput.timezone?.trim() ||
    PLATFORM_POPUP_DEFAULT_TIMEZONE;

  if (mode === "CLOSE") return false;

  if (mode === "SESSION") {
    const a = (record.sessionKey ?? "").trim();
    const b = (evalInput.currentSessionKey ?? "").trim();
    if (!a || !b) return false;
    return a === b;
  }

  if (mode === "CAMPAIGN") {
    const a = (record.campaignRevision ?? "").trim();
    const b = (evalInput.currentCampaignRevision ?? "").trim();
    if (!a) return true; // campaign-lifetime without revision → active until cleared
    if (!b) return true;
    return a === b;
  }

  if (mode === "DURATION") {
    const until = asDate(record.suppressUntil);
    if (!until) return false;
    return now.getTime() < until.getTime();
  }

  if (mode === "TODAY") {
    const until = asDate(record.suppressUntil);
    if (until) {
      return now.getTime() < until.getTime();
    }
    // Legacy/incomplete row: derive from createdAt local day end (still NOT +24h).
    const created = asDate(record.createdAt) ?? now;
    const dayEnd = platformPopupLocalDayEndExclusive(created, tz);
    return now.getTime() < dayEnd.getTime();
  }

  return false;
}

/** Hard guard: TODAY must never be encoded as now+24h. */
export function assertTodayIsNotRolling24h(
  suppressUntil: Date,
  now: Date,
  timeZone: string = PLATFORM_POPUP_DEFAULT_TIMEZONE
): boolean {
  const rolling = new Date(now.getTime() + 24 * 3600 * 1000);
  const dayEnd = platformPopupLocalDayEndExclusive(now, timeZone);
  // suppressUntil should match day end, not rolling 24h (allow 2s clock skew on dayEnd).
  const matchesDayEnd = Math.abs(suppressUntil.getTime() - dayEnd.getTime()) < 2000;
  const matchesRolling = Math.abs(suppressUntil.getTime() - rolling.getTime()) < 2000;
  return matchesDayEnd && !matchesRolling;
}
