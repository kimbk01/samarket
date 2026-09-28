import { isSearchableGlobalQuery } from "@/lib/search/global/semantics/is-searchable-query";
import { normalizeGlobalSearchText } from "@/lib/search/global/semantics/normalize";
import {
  countHangulSyllables,
  countLatinLetters,
  isMeaningfulSearchToken,
  MIN_LATIN_PREFIX_CHARS,
  tokenizeGlobalSearchQuery,
} from "@/lib/search/global/semantics/tokenize";

export type GlobalSearchMatchRange = { start: number; end: number };

export type GlobalSearchFieldMatch<K extends string> = {
  matched: boolean;
  matchedField: K | "NONE";
};

function latinFoldDisplay(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFC")) {
    const cp = ch.codePointAt(0)!;
    out += cp >= 0x41 && cp <= 0x5a ? String.fromCodePoint(cp + 32) : ch;
  }
  return out;
}

function mergeRanges(ranges: GlobalSearchMatchRange[]): GlobalSearchMatchRange[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: GlobalSearchMatchRange[] = [{ ...sorted[0]! }];
  for (let i = 1; i < sorted.length; i += 1) {
    const cur = sorted[i]!;
    const last = out[out.length - 1]!;
    if (cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

function hangulTokenRanges(folded: string, token: string): GlobalSearchMatchRange[] {
  if (countHangulSyllables(token) < 2) return [];
  const ranges: GlobalSearchMatchRange[] = [];
  let from = 0;
  while (from < folded.length) {
    const i = folded.indexOf(token, from);
    if (i < 0) break;
    ranges.push({ start: i, end: i + token.length });
    from = i + token.length;
  }
  return ranges;
}

function latinTokenRanges(folded: string, token: string): GlobalSearchMatchRange[] {
  if (countLatinLetters(token) < MIN_LATIN_PREFIX_CHARS && token.length < MIN_LATIN_PREFIX_CHARS) {
    return [];
  }
  const ranges: GlobalSearchMatchRange[] = [];
  const re = /[a-z][a-z']*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(folded))) {
    const word = m[0];
    if (word === token || word.startsWith(token)) {
      ranges.push({ start: m.index, end: m.index + token.length });
    }
  }
  return ranges;
}

function digitTokenRanges(folded: string, token: string): GlobalSearchMatchRange[] {
  if (!/^[0-9]+$/.test(token) || token.length < MIN_LATIN_PREFIX_CHARS) return [];
  const ranges: GlobalSearchMatchRange[] = [];
  const re = /[0-9]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(folded))) {
    const word = m[0];
    if (word === token || word.startsWith(token)) {
      ranges.push({ start: m.index, end: m.index + token.length });
    }
  }
  return ranges;
}

export function findGlobalSearchMatchRanges(hay: string, query: string): GlobalSearchMatchRange[] {
  if (!isSearchableGlobalQuery(query)) return [];
  const folded = latinFoldDisplay(hay);
  const tokens = tokenizeGlobalSearchQuery(query).filter(isMeaningfulSearchToken);
  const ranges: GlobalSearchMatchRange[] = [];
  for (const token of tokens) {
    if (countHangulSyllables(token) >= 2) {
      ranges.push(...hangulTokenRanges(folded, token));
      continue;
    }
    if (countLatinLetters(token) >= MIN_LATIN_PREFIX_CHARS) {
      ranges.push(...latinTokenRanges(folded, token));
      continue;
    }
    ranges.push(...digitTokenRanges(folded, token));
  }
  return mergeRanges(ranges.filter((r) => r.end > r.start));
}

export function matchTokenInText(hay: string, token: string): boolean {
  if (!isMeaningfulSearchToken(token)) return false;
  const folded = latinFoldDisplay(hay);
  if (countHangulSyllables(token) >= 2) return hangulTokenRanges(folded, token).length > 0;
  if (countLatinLetters(token) >= MIN_LATIN_PREFIX_CHARS) return latinTokenRanges(folded, token).length > 0;
  return digitTokenRanges(folded, token).length > 0;
}

/** All meaningful tokens must match this one searchable string. */
export function matchGlobalSearchText(hay: string, query: string): boolean {
  if (!isSearchableGlobalQuery(query)) return false;
  const tokens = tokenizeGlobalSearchQuery(query).filter(isMeaningfulSearchToken);
  if (tokens.length === 0) return false;
  return tokens.every((token) => matchTokenInText(hay, token));
}

export function matchGlobalSearchRecord<K extends string>(
  fields: Record<K, string | null | undefined>,
  fieldOrder: readonly K[],
  query: string
): GlobalSearchFieldMatch<K> {
  if (!isSearchableGlobalQuery(query)) {
    return { matched: false, matchedField: "NONE" };
  }
  const tokens = tokenizeGlobalSearchQuery(query).filter(isMeaningfulSearchToken);
  if (tokens.length === 0) return { matched: false, matchedField: "NONE" };

  const tokenField = new Map<string, K>();
  for (const key of fieldOrder) {
    const value = fields[key] ?? "";
    for (const token of tokens) {
      if (!tokenField.has(token) && matchTokenInText(value, token)) {
        tokenField.set(token, key);
      }
    }
  }
  if (tokenField.size !== tokens.length) {
    return { matched: false, matchedField: "NONE" };
  }

  for (const key of fieldOrder) {
    if (matchGlobalSearchText(fields[key] ?? "", query)) {
      return { matched: true, matchedField: key };
    }
  }
  for (const key of fieldOrder) {
    if ([...tokenField.values()].includes(key)) {
      return { matched: true, matchedField: key };
    }
  }
  return { matched: false, matchedField: "NONE" };
}

export function buildMatchedSnippet(text: string, query: string, maxLen = 88): string {
  const raw = (text ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const ranges = findGlobalSearchMatchRanges(raw, query);
  if (ranges.length === 0) return raw.slice(0, maxLen);
  const hit = ranges[0]!;
  const pad = Math.max(0, Math.floor((maxLen - (hit.end - hit.start)) / 2));
  let start = Math.max(0, hit.start - pad);
  let end = Math.min(raw.length, hit.end + pad);
  if (end - start < Math.min(maxLen, raw.length)) {
    end = Math.min(raw.length, start + maxLen);
    start = Math.max(0, end - maxLen);
  }
  const prefix = start > 0 ? "…" : "";
  const suffix = end < raw.length ? "…" : "";
  return `${prefix}${raw.slice(start, end)}${suffix}`;
}

export function assertMatchHighlightInvariant(text: string, query: string, matched: boolean): boolean {
  const ranges = findGlobalSearchMatchRanges(text, query);
  if (matched) return ranges.length > 0;
  return ranges.length === 0;
}

/** @internal re-export for tests that inspect normalized query text */
export function debugNormalizedQuery(query: string): string {
  return normalizeGlobalSearchText(query);
}
