/** 브라우저 로컬 — 거래 글쓰기 「자주 쓰는 문구」 (계정 연동 없음) */

const STORAGE_KEY = "samarket.tradeFrequentPhrases.v1";
const MAX_PHRASES = 40;
const MAX_PHRASE_LEN = 800;

export function loadTradeFrequentPhrases(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.slice(0, MAX_PHRASE_LEN))
      .slice(0, MAX_PHRASES);
  } catch {
    return [];
  }
}

export function saveTradeFrequentPhrases(phrases: string[]): void {
  if (typeof window === "undefined") return;
  const cleaned = phrases
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_PHRASES)
    .map((s) => s.slice(0, MAX_PHRASE_LEN));
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
  } catch {
    /* quota */
  }
}
