/**
 * Shared schedule window for HOME shelf + CATEGORY browse scope.
 * null/empty start+end ⇒ always on (no schedule restriction).
 */

export function isWithinProductScheduleWindow(
  scheduleStart: string | null | undefined,
  scheduleEnd: string | null | undefined,
  nowMs: number = Date.now()
): boolean {
  const startRaw = scheduleStart?.trim() || "";
  const endRaw = scheduleEnd?.trim() || "";
  if (!startRaw && !endRaw) return true;

  const startMs = startRaw ? Date.parse(startRaw) : Number.NEGATIVE_INFINITY;
  const endMs = endRaw ? Date.parse(endRaw) : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(startMs) && startRaw) return false;
  if (!Number.isFinite(endMs) && endRaw) return false;
  return nowMs >= startMs && nowMs <= endMs;
}
