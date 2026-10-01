/**
 * DIBAY Intro — show frequency (expansion P6). Separate from the launch epoch.
 *
 * - every_launch: unchanged — once per native launch epoch (launch-epoch.ts), nothing recorded here.
 * - once_per_publication: a device shows a publication once, ever.
 * - once_per_day: a device shows a publication at most once per Philippine calendar day
 *   (Asia/Manila, UTC+08:00, Owner decision P6). A new publication starts its own count.
 *
 * Consumption = the Intro's first frame after the OS release (the same instant the epoch is
 * marked), recorded per publication id in ONE localStorage record. The startup decision reads it
 * synchronously. Storage unavailable → nothing can be remembered, so the frequency check allows
 * the Intro (it can never block startup; worst case = every_launch behaviour).
 */
import type { LaunchIntroFrequency } from "@/lib/launch-intro/document";

const SEEN_KEY = "dibay:launch-intro:seen";
const KEEP = 20;

export type LaunchIntroSeenRecord = Record<string, { at: string; day: string }>;

/** Philippine calendar day (YYYY-MM-DD) of an instant. */
export function manilaDayOf(ms: number): string {
  return new Date(ms + 8 * 3600_000).toISOString().slice(0, 10);
}

export function launchIntroFrequencyAllows(
  frequency: LaunchIntroFrequency,
  publicationId: string,
  nowMs: number,
  seen: LaunchIntroSeenRecord
): boolean {
  if (frequency === "every_launch") return true;
  const last = seen[publicationId];
  if (!last) return true;
  if (frequency === "once_per_publication") return false;
  return last.day !== manilaDayOf(nowMs);
}

export function readLaunchIntroSeen(): LaunchIntroSeenRecord {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    if (!raw) return {};
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: LaunchIntroSeenRecord = {};
    for (const [id, e] of Object.entries(v as Record<string, unknown>)) {
      const r = e as { at?: unknown; day?: unknown };
      if (typeof r?.at === "string" && typeof r?.day === "string") out[id] = { at: r.at, day: r.day };
    }
    return out;
  } catch {
    return {};
  }
}

/** One setItem; keeps the newest KEEP publications. */
export function recordLaunchIntroShown(publicationId: string, nowMs: number): void {
  try {
    const seen = readLaunchIntroSeen();
    seen[publicationId] = { at: new Date(nowMs).toISOString(), day: manilaDayOf(nowMs) };
    const newest = Object.entries(seen)
      .sort((a, b) => b[1].at.localeCompare(a[1].at))
      .slice(0, KEEP);
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(Object.fromEntries(newest)));
  } catch {
    /* storage unavailable: see module comment */
  }
}
