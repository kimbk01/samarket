/**
 * P1-C2 — New-store discovery signal (HOME shelf only).
 *
 * START AUTHORITY: stores.first_listed_at (P1-C1)
 * NULL first_listed_at ⇒ not new (legacy visible stores stay out).
 * created_at / approved_at must never substitute.
 *
 * OUT: sort=new · BROWSE · Admin boost · P1-B product authority
 */

/** Product lock — P1-C2 */
export const NEW_STORE_WINDOW_DAYS = 30 as const;

export const NEW_STORE_WINDOW_MS = NEW_STORE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export type NewStoreSignalInput = {
  firstListedAt: string | null | undefined;
  /** Deterministic evaluation — omit for Date.now() */
  nowMs?: number;
};

/**
 * New-store signal:
 * first_listed_at IS NOT NULL AND now - first_listed_at <= 30d
 */
export function isNewStoreSignal(input: NewStoreSignalInput): boolean {
  const raw = input.firstListedAt;
  if (raw == null) return false;
  const listed = String(raw).trim();
  if (!listed) return false;
  const listedMs = Date.parse(listed);
  if (!Number.isFinite(listedMs)) return false;
  const nowMs = input.nowMs ?? Date.now();
  const age = nowMs - listedMs;
  if (age < 0) return true; // clock skew: treat as just listed
  return age <= NEW_STORE_WINDOW_MS;
}

/** Newer first_listed_at first; stable id tie-break. */
export function compareNewStoreShelfRows(
  a: { id: string; firstListedAt: string },
  b: { id: string; firstListedAt: string }
): number {
  const am = Date.parse(a.firstListedAt);
  const bm = Date.parse(b.firstListedAt);
  if (am !== bm) return bm - am;
  return String(a.id).localeCompare(String(b.id));
}
