import { normalizeGlobalSearchText } from "@/lib/search/global/semantics/normalize";

export const MIN_LATIN_PREFIX_CHARS = 3;
export const MIN_HANGUL_SYLLABLES = 2;

const HANGUL_SYLLABLE_START = 0xac00;
const HANGUL_SYLLABLE_END = 0xd7a3;
const JAMO_CHOSEONG_START = 0x1100;
const JAMO_JUNGSEONG_END = 0x11ff;
const COMPAT_JAMO_START = 0x3131;
const COMPAT_JAMO_END = 0x318e;

export function isHangulJamoCodePoint(cp: number): boolean {
  return (
    (cp >= JAMO_CHOSEONG_START && cp <= JAMO_JUNGSEONG_END) ||
    (cp >= COMPAT_JAMO_START && cp <= COMPAT_JAMO_END)
  );
}

export function isHangulSyllableCodePoint(cp: number): boolean {
  return cp >= HANGUL_SYLLABLE_START && cp <= HANGUL_SYLLABLE_END;
}

export function countHangulSyllables(text: string): number {
  let n = 0;
  for (const ch of text) {
    if (isHangulSyllableCodePoint(ch.codePointAt(0)!)) n += 1;
  }
  return n;
}

export function countLatinLetters(text: string): number {
  let n = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if ((cp >= 0x61 && cp <= 0x7a) || (cp >= 0x41 && cp <= 0x5a)) n += 1;
  }
  return n;
}

export function countDigits(text: string): number {
  let n = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x30 && cp <= 0x39) n += 1;
  }
  return n;
}

export function tokenizeGlobalSearchQuery(raw: string | null | undefined): string[] {
  const n = normalizeGlobalSearchText(raw);
  if (!n) return [];
  return n.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

export function isMeaningfulSearchToken(token: string): boolean {
  if (!token) return false;
  for (const ch of token) {
    if (isHangulJamoCodePoint(ch.codePointAt(0)!)) return false;
  }
  if (countHangulSyllables(token) >= MIN_HANGUL_SYLLABLES) return true;
  if (countLatinLetters(token) >= MIN_LATIN_PREFIX_CHARS) return true;
  if (countDigits(token) >= MIN_LATIN_PREFIX_CHARS) return true;
  return false;
}

export function meaningfulGlobalSearchTokens(raw: string | null | undefined): string[] {
  return tokenizeGlobalSearchQuery(raw).filter(isMeaningfulSearchToken);
}
