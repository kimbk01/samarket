/**
 * Normalize PH LGU / address municipality strings for exact alias matching.
 * Not fuzzy search — strip diacritics + punctuation only.
 */

export function normalizeTradeNationalLguName(raw: string | null | undefined): string {
  let s = String(raw ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
  s = s.replace(/[^a-z0-9\s]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/** Variant forms used as exact alias keys (still explicit, not substring search). */
export function expandTradeNationalLguNameVariants(raw: string | null | undefined): string[] {
  const base = normalizeTradeNationalLguName(raw);
  if (!base) return [];
  const out = new Set<string>([base]);
  if (base.startsWith("city of ")) {
    const rest = base.slice("city of ".length).trim();
    if (rest) {
      out.add(rest);
      out.add(`${rest} city`);
    }
  } else if (base.endsWith(" city")) {
    const rest = base.slice(0, -" city".length).trim();
    if (rest) {
      out.add(rest);
      out.add(`city of ${rest}`);
    }
  } else {
    out.add(`${base} city`);
    out.add(`city of ${base}`);
  }
  return [...out];
}
