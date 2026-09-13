export type ExternalBoardDiscoverOpts = {
  /** Max articles to return (default 5, hard max 50). */
  limit?: number;
  /** Inclusive page range when source supports page pagination. */
  pageFrom?: number;
  pageTo?: number;
  /** ISO date or Admin YYYY-MM-DD lower bound (inclusive calendar day when date-only). */
  dateFrom?: string | null;
  /** ISO date or Admin YYYY-MM-DD upper bound (inclusive calendar day when date-only). */
  dateTo?: string | null;
};

export type ExternalBoardCollectionCapability = {
  paginationType: "page_param" | "next_link" | "wp_json" | "none";
  pageParam?: string;
  supportsLatestN: boolean;
  supportsPageRange: boolean;
  supportsDateRange: boolean;
  maxSafePages: number;
};

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Same UTC calendar authority as parseExternalBoardSourceDate (no second TZ system). */
export function isExternalBoardAdminDateOnly(raw: string): boolean {
  return DATE_ONLY_RE.test(String(raw ?? "").trim());
}

function startOfUtcDayMs(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d, 0, 0, 0, 0);
}

/**
 * Admin date-only / ISO bounds → half-open filter window.
 * dateFrom inclusive start; dateTo exclusive end (`t < toExclusive`).
 *
 * YYYY-MM-DD dateTo means inclusive end of that UTC calendar day
 * ≡ `[start(dateTo), start(dateTo+1))`.
 */
export function normalizeExternalBoardDateBounds(
  dateFromRaw: string | null | undefined,
  dateToRaw: string | null | undefined
): {
  dateFromInclusive: string | null;
  dateToExclusive: string | null;
  inputKind: { from: "absent" | "date_only" | "datetime"; to: "absent" | "date_only" | "datetime" };
} {
  const fromRaw = dateFromRaw != null && String(dateFromRaw).trim() ? String(dateFromRaw).trim() : null;
  const toRaw = dateToRaw != null && String(dateToRaw).trim() ? String(dateToRaw).trim() : null;

  let dateFromInclusive: string | null = null;
  let fromKind: "absent" | "date_only" | "datetime" = "absent";
  if (fromRaw) {
    if (isExternalBoardAdminDateOnly(fromRaw)) {
      fromKind = "date_only";
      const m = fromRaw.match(DATE_ONLY_RE)!;
      dateFromInclusive = new Date(startOfUtcDayMs(Number(m[1]), Number(m[2]), Number(m[3]))).toISOString();
    } else {
      fromKind = "datetime";
      const t = Date.parse(fromRaw);
      dateFromInclusive = Number.isNaN(t) ? null : new Date(t).toISOString();
    }
  }

  let dateToExclusive: string | null = null;
  let toKind: "absent" | "date_only" | "datetime" = "absent";
  if (toRaw) {
    if (isExternalBoardAdminDateOnly(toRaw)) {
      toKind = "date_only";
      const m = toRaw.match(DATE_ONLY_RE)!;
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      // Exclusive: start of next UTC calendar day.
      dateToExclusive = new Date(startOfUtcDayMs(y, mo, d) + 86400000).toISOString();
    } else {
      toKind = "datetime";
      const t = Date.parse(toRaw);
      // Datetime treated as inclusive end → exclusive next millisecond (avoids 23:59:59.999 traps).
      dateToExclusive = Number.isNaN(t) ? null : new Date(t + 1).toISOString();
    }
  }

  return {
    dateFromInclusive,
    dateToExclusive,
    inputKind: { from: fromKind, to: toKind },
  };
}

export function normalizeDiscoverOpts(opts?: ExternalBoardDiscoverOpts): {
  limit: number;
  pageFrom: number;
  pageTo: number;
  /** Inclusive lower bound ISO (UTC), or null. */
  dateFrom: string | null;
  /**
   * Exclusive upper bound ISO (UTC), or null.
   * Admin YYYY-MM-DD `dateTo=D` → start of D+1 (half-open).
   */
  dateTo: string | null;
  dateRangeMeta: {
    inputFrom: string | null;
    inputTo: string | null;
    inputKind: { from: "absent" | "date_only" | "datetime"; to: "absent" | "date_only" | "datetime" };
    comparison: "half_open_utc";
    timezoneAuthority: "UTC_same_as_source_published_at";
  };
} {
  const limit = Math.min(Math.max(Number(opts?.limit ?? 10) || 10, 1), 50);
  const pageFrom = Math.max(1, Number(opts?.pageFrom ?? 1) || 1);
  const pageTo = Math.max(pageFrom, Number(opts?.pageTo ?? pageFrom) || pageFrom);
  const inputFrom = opts?.dateFrom ? String(opts.dateFrom).trim() : null;
  const inputTo = opts?.dateTo ? String(opts.dateTo).trim() : null;
  const bounds = normalizeExternalBoardDateBounds(inputFrom, inputTo);
  return {
    limit,
    pageFrom,
    pageTo: Math.min(pageTo, pageFrom + 19),
    dateFrom: bounds.dateFromInclusive,
    dateTo: bounds.dateToExclusive,
    dateRangeMeta: {
      inputFrom,
      inputTo,
      inputKind: bounds.inputKind,
      comparison: "half_open_utc",
      timezoneAuthority: "UTC_same_as_source_published_at",
    },
  };
}

/**
 * Filter against normalized bounds from normalizeDiscoverOpts.
 * Semantics: dateFrom inclusive, dateTo exclusive (`t < dateTo`).
 * Unknown/null source dates never invent a date — excluded when any bound is set.
 */
export function withinDateRange(
  sourcePublishedAt: string | null | undefined,
  dateFrom: string | null,
  dateTo: string | null
): boolean {
  if (!dateFrom && !dateTo) return true;
  if (!sourcePublishedAt) return false;
  const t = Date.parse(sourcePublishedAt);
  if (Number.isNaN(t)) return false;
  if (dateFrom) {
    const from = Date.parse(dateFrom);
    if (!Number.isNaN(from) && t < from) return false;
  }
  if (dateTo) {
    const toExclusive = Date.parse(dateTo);
    if (!Number.isNaN(toExclusive) && t >= toExclusive) return false;
  }
  return true;
}
