import type { RecurrenceKind } from "@/lib/admin/notification-campaigns/campaign-occurrence-types";

export type RecurrencePolicyInput = {
  kind: RecurrenceKind;
  timeLocal: string; // HH:mm
  timezone: string;
  startAt: string; // ISO
  endAt?: string | null;
  maxCount?: number | null;
  weekday?: number | null; // 0=Sun..6=Sat for weekly
};

function parseTimeLocal(timeLocal: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(timeLocal.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/** Compute next occurrence scheduled_for in UTC ISO from policy + after instant. */
export function computeNextRecurrenceScheduledFor(
  policy: RecurrencePolicyInput,
  after: Date,
  sequenceNumber: number
): Date | null {
  if (policy.kind === "none") return null;

  const timeParts = parseTimeLocal(policy.timeLocal);
  if (!timeParts) return null;

  const start = new Date(policy.startAt);
  if (Number.isNaN(start.getTime())) return null;

  if (policy.maxCount != null && sequenceNumber > policy.maxCount) return null;
  if (policy.endAt) {
    const end = new Date(policy.endAt);
    if (!Number.isNaN(end.getTime()) && after > end) return null;
  }

  // 운영 시간 기준 PHT (AGENTS 규정 9) — 값이 없을 때만.
  const tz = policy.timezone?.trim() || "Asia/Manila";
  let cursor = new Date(Math.max(after.getTime(), start.getTime()));

  for (let guard = 0; guard < 400; guard += 1) {
    const candidate = applyLocalTime(cursor, timeParts.hour, timeParts.minute, tz);
    if (candidate.getTime() > after.getTime() && candidate.getTime() >= start.getTime()) {
      if (policy.endAt) {
        const end = new Date(policy.endAt);
        if (!Number.isNaN(end.getTime()) && candidate > end) return null;
      }
      if (policy.kind === "weekly" && policy.weekday != null) {
        // 요일은 그 시간대의 요일이다(PHT 07:00 화요일 = UTC 월요일 23:00 — UTC 요일로 비교하면 한 주씩 밀린다).
        const dow = weekdayInTimeZone(candidate, tz);
        if (dow !== policy.weekday) {
          cursor = new Date(candidate.getTime() + 86_400_000);
          continue;
        }
      }
      return candidate;
    }

    if (policy.kind === "daily") {
      cursor = new Date(cursor.getTime() + 86_400_000);
    } else if (policy.kind === "weekly") {
      // 요일을 정한 매주는 하루씩 찾는다(오늘 시각이 이미 지났으면 다음 그 요일 — 7일씩 건너뛰면 한 주가 밀린다).
      cursor = new Date(cursor.getTime() + (policy.weekday != null ? 1 : 7) * 86_400_000);
    } else if (policy.kind === "monthly") {
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate()));
    } else {
      return null;
    }
  }

  return null;
}

function weekdayInTimeZone(at: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(at);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

function applyLocalTime(base: Date, hour: number, minute: number, timeZone: string): Date {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(base);
  const y = Number(parts.find((p) => p.type === "year")?.value ?? "1970");
  const mo = Number(parts.find((p) => p.type === "month")?.value ?? "1") - 1;
  const d = Number(parts.find((p) => p.type === "day")?.value ?? "1");
  const utcGuess = Date.UTC(y, mo, d, hour, minute, 0, 0);
  const offset = timezoneOffsetMs(new Date(utcGuess), timeZone);
  return new Date(utcGuess - offset);
}

function timezoneOffsetMs(date: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const mi = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const s = Number(parts.find((p) => p.type === "second")?.value ?? "0");
  const raw =
    (h * 3600 + mi * 60 + s) * 1000 - date.getUTCHours() * 3_600_000 - date.getUTCMinutes() * 60_000 - date.getUTCSeconds() * 1000;
  // 현지 시각이 UTC 와 날짜가 다르면(PHT 02:00 = 전날 UTC 18:00) 시·분만 뺀 값이 24시간 틀린다 → 실제 오프셋 범위로.
  const DAY = 86_400_000;
  if (raw > 14 * 3_600_000) return raw - DAY;
  if (raw <= -12 * 3_600_000) return raw + DAY;
  return raw;
}
