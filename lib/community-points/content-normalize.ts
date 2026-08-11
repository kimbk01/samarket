/**
 * Community D-Point Level 1/2 shared normalization.
 * CONTRACT: server authority. No AI. Deterministic.
 */

const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF\u2060\u180E\u00AD]/g;
const MULTI_SPACE_RE = /\s+/g;

/** Letters (incl. Hangul) and numbers count as meaningful. */
const MEANINGFUL_RE = /[\p{L}\p{N}]/gu;

export type NormalizedCommunityText = {
  raw: string;
  normalized: string;
  meaningful: string;
  meaningfulCount: number;
  uniqueMeaningfulCount: number;
  maxRunRatio: number;
  maxCharRatio: number;
};

export function normalizeCommunityText(raw: string): NormalizedCommunityText {
  const source = typeof raw === "string" ? raw : "";
  const normalized = source
    .normalize("NFKC")
    .replace(ZERO_WIDTH_RE, "")
    .replace(MULTI_SPACE_RE, " ")
    .trim();
  const meaningful = (normalized.match(MEANINGFUL_RE) ?? []).join("");
  const meaningfulCount = meaningful.length;
  const uniqueMeaningfulCount = new Set([...meaningful]).size;
  let maxRun = 0;
  let run = 0;
  let prev = "";
  const freq = new Map<string, number>();
  for (const ch of meaningful) {
    freq.set(ch, (freq.get(ch) ?? 0) + 1);
    if (ch === prev) {
      run += 1;
    } else {
      prev = ch;
      run = 1;
    }
    if (run > maxRun) maxRun = run;
  }
  const maxFreq = [...freq.values()].reduce((a, b) => Math.max(a, b), 0);
  return {
    raw: source,
    normalized,
    meaningful,
    meaningfulCount,
    uniqueMeaningfulCount,
    maxRunRatio: meaningfulCount > 0 ? maxRun / meaningfulCount : 0,
    maxCharRatio: meaningfulCount > 0 ? maxFreq / meaningfulCount : 0,
  };
}

export function communityTextContentHash(normalized: string): string {
  return `v1:${normalized.normalize("NFKC").trim()}`;
}
