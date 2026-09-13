/**
 * Parse source dates without inventing timezone when absent.
 * Returns ISO only when unambiguous enough; otherwise null (CASE C).
 */
export function parseExternalBoardSourceDate(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  const isoLike = s.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?/
  );
  if (isoLike) {
    const hasTz = Boolean(isoLike[7]);
    if (hasTz) {
      const t = Date.parse(s);
      return Number.isNaN(t) ? null : new Date(t).toISOString();
    }
    // No TZ — store as UTC midnight/time components without inventing local zone.
    const y = Number(isoLike[1]);
    const mo = Number(isoLike[2]);
    const d = Number(isoLike[3]);
    const hh = Number(isoLike[4] ?? 0);
    const mm = Number(isoLike[5] ?? 0);
    const ss = Number(isoLike[6] ?? 0);
    return new Date(Date.UTC(y, mo - 1, d, hh, mm, ss)).toISOString();
  }

  const slash = s.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (slash) {
    const y = Number(slash[1]);
    const mo = Number(slash[2]);
    const d = Number(slash[3]);
    const hh = Number(slash[4] ?? 0);
    const mm = Number(slash[5] ?? 0);
    const ss = Number(slash[6] ?? 0);
    return new Date(Date.UTC(y, mo - 1, d, hh, mm, ss)).toISOString();
  }

  const ko = s.match(/^(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (ko) {
    return new Date(Date.UTC(Number(ko[1]), Number(ko[2]) - 1, Number(ko[3]))).toISOString();
  }

  // English month names with explicit year — still no TZ invent beyond UTC calendar date.
  const t = Date.parse(s);
  if (!Number.isNaN(t) && /\d{4}/.test(s) && /[A-Za-z]{3,}/.test(s)) {
    const d = new Date(t);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds())).toISOString();
  }

  return null;
}
