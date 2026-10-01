/**
 * DIBAY Intro — publication schedule (expansion P5). Pure.
 *
 * Owner decision (P5): single Live. A schedule is part of ONE immutable publication's eligibility
 * (startAt / endAt). Publishing it replaces the current Live at once; before startAt and after endAt
 * devices show no Intro. No queue, no automatic hand-over.
 *
 * Admin enters times in Philippine time (Asia/Manila, fixed UTC+08:00, no DST — Owner decision P6
 * uses the same clock). Stored as ISO-8601 instants. Devices judge with their own clock in
 * `startup-destination` (`now < startAt` → not yet, `now >= endAt` → ended) — same rule as here.
 */
import { LAUNCH_INTRO_FREQUENCIES, type LaunchIntroEligibility, type LaunchIntroFrequency } from "@/lib/launch-intro/document";

export const LAUNCH_INTRO_SCHEDULE_TZ = "Asia/Manila";
const MANILA_OFFSET = "+08:00";
/** `YYYY-MM-DDTHH:mm` as typed into a datetime-local input. */
const LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export type LaunchIntroScheduleInput = { startLocal: string; endLocal: string };

/** Manila wall time (datetime-local value) → ISO instant. "" → null. Invalid → undefined. */
export function manilaLocalToIso(local: string): string | null | undefined {
  if (!local) return null;
  if (!LOCAL_RE.test(local)) return undefined;
  const ms = Date.parse(`${local}:00${MANILA_OFFSET}`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

/** ISO instant → Manila wall time for a datetime-local input. */
export function isoToManilaLocal(iso: string): string {
  const d = new Date(Date.parse(iso) + 8 * 3600_000);
  return d.toISOString().slice(0, 16);
}

/** Human display in Manila time, e.g. "2026. 10. 2. 오후 7:00 (필리핀)". */
export function formatManila(iso: string, locale: string | undefined): string {
  return new Date(iso).toLocaleString(locale, { timeZone: LAUNCH_INTRO_SCHEDULE_TZ, dateStyle: "medium", timeStyle: "short" });
}

/**
 * The ONE eligibility validator (Admin input and server publish authority).
 * Rules: start/end optional; end > start; end must be in the future at publish time.
 */
export function validateLaunchIntroEligibility(
  raw: unknown,
  nowMs: number
): { ok: true; eligibility: LaunchIntroEligibility } | { ok: false; error: string } {
  if (raw == null) return { ok: true, eligibility: { frequency: "every_launch" } };
  if (typeof raw !== "object") return { ok: false, error: "eligibility_invalid" };
  const o = raw as Record<string, unknown>;
  const frequency = (o.frequency ?? "every_launch") as LaunchIntroFrequency;
  if (!LAUNCH_INTRO_FREQUENCIES.includes(frequency)) return { ok: false, error: "frequency_invalid" };
  const iso = (v: unknown): string | null | undefined => {
    if (v == null || v === "") return null;
    if (typeof v !== "string") return undefined;
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
  };
  const startAt = iso(o.startAt);
  const endAt = iso(o.endAt);
  if (startAt === undefined) return { ok: false, error: "schedule_start_invalid" };
  if (endAt === undefined) return { ok: false, error: "schedule_end_invalid" };
  if (startAt && endAt && Date.parse(endAt) <= Date.parse(startAt)) return { ok: false, error: "schedule_end_before_start" };
  if (endAt && Date.parse(endAt) <= nowMs) return { ok: false, error: "schedule_already_ended" };
  const eligibility: LaunchIntroEligibility = { frequency };
  if (startAt) eligibility.startAt = startAt;
  if (endAt) eligibility.endAt = endAt;
  return { ok: true, eligibility };
}

/** Field-wise equality (stored jsonb key order is irrelevant). */
export function sameLaunchIntroEligibility(a: LaunchIntroEligibility | null | undefined, b: LaunchIntroEligibility): boolean {
  const norm = (e: LaunchIntroEligibility | null | undefined) => ({
    frequency: e?.frequency ?? "every_launch",
    startAt: e?.startAt ? new Date(e.startAt).toISOString() : null,
    endAt: e?.endAt ? new Date(e.endAt).toISOString() : null,
  });
  const x = norm(a);
  const y = norm(b);
  return x.frequency === y.frequency && x.startAt === y.startAt && x.endAt === y.endAt;
}

export type LaunchIntroScheduleState = "always" | "scheduled" | "running" | "ended";

/** Where `now` falls in the window (same comparisons as the device decision). */
export function launchIntroScheduleState(e: LaunchIntroEligibility | null | undefined, nowMs: number): LaunchIntroScheduleState {
  const start = e?.startAt ? Date.parse(e.startAt) : NaN;
  const end = e?.endAt ? Date.parse(e.endAt) : NaN;
  if (!Number.isFinite(start) && !Number.isFinite(end)) return "always";
  if (Number.isFinite(start) && nowMs < start) return "scheduled";
  if (Number.isFinite(end) && nowMs >= end) return "ended";
  return "running";
}
