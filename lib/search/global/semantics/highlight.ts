import { findGlobalSearchMatchRanges } from "@/lib/search/global/semantics/match";

export type SearchHighlightSegment = {
  text: string;
  matched: boolean;
};

export function buildSearchHighlightSegments(
  text: string,
  query: string
): SearchHighlightSegment[] {
  const raw = (text ?? "").normalize("NFC");
  if (!raw) return [];
  const ranges = findGlobalSearchMatchRanges(raw, query);
  if (ranges.length === 0) return [{ text: raw, matched: false }];

  const segments: SearchHighlightSegment[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      segments.push({ text: raw.slice(cursor, range.start), matched: false });
    }
    if (range.end > range.start) {
      segments.push({ text: raw.slice(range.start, range.end), matched: true });
    }
    cursor = range.end;
  }
  if (cursor < raw.length) {
    segments.push({ text: raw.slice(cursor), matched: false });
  }
  return segments.filter((s) => s.text.length > 0);
}
