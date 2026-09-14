/**
 * Proven Production contamination sources — block AUTO + publish eligibility.
 * Only entries with Production provenance evidence. Not a keyword blacklist.
 *
 * Evidence 2026-09-14:
 * board_import_sources id=53b6b238-74c9-49b3-92fe-78d703faca4f
 * URL=https://en.wikivoyage.org/wiki/Category:Philippines
 * mode=AUTO → generic discovery → non-PH pages → community_posts
 */

export const BOARD_IMPORT_BLOCKED_SOURCE_IDS = new Set<string>([
  "53b6b238-74c9-49b3-92fe-78d703faca4f",
]);

export function isBoardImportSourceBlocked(input: {
  id?: string | null;
  siteKey?: string | null;
  sourceUrl?: string | null;
}): boolean {
  const id = String(input.id ?? "").trim();
  if (id && BOARD_IMPORT_BLOCKED_SOURCE_IDS.has(id)) return true;
  const site = String(input.siteKey ?? "").trim().toLowerCase();
  if (site === "en.wikivoyage.org" || site === "wikivoyage.org") return true;
  const url = String(input.sourceUrl ?? "").trim().toLowerCase();
  if (url.includes("en.wikivoyage.org") || url.includes("wikivoyage.org")) return true;
  return false;
}

export const BOARD_IMPORT_SOURCE_BLOCKED_CODE = "source_blocked_proven_contamination" as const;
export const BOARD_IMPORT_SOURCE_BLOCKED_MESSAGE =
  "이 SOURCE는 Production 오염이 증명되어 수집/게시가 차단되었습니다. (Wikivoyage Category:Philippines AUTO)" as const;
