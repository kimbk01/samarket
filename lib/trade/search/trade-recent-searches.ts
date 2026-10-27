/** 거래 찾기 최근 검색어 — 거래 전용 키(전역 검색·배달과 섞지 않는다). 이 기기에만 저장. */

const KEY = "dibay:trade:recent-searches:v1";
const MAX = 10;

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x.trim() !== "").slice(0, MAX);
  } catch {
    return [];
  }
}

function write(list: string[]): string[] {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* 저장 불가(사생활 모드 등) — 화면은 그대로 */
  }
  return list;
}

export function getTradeRecentSearches(): string[] {
  return read();
}

export function addTradeRecentSearch(keyword: string): string[] {
  const k = keyword.trim().replace(/\s+/g, " ");
  if (!k) return read();
  const lower = k.toLowerCase();
  return write([k, ...read().filter((x) => x.toLowerCase() !== lower)].slice(0, MAX));
}

export function removeTradeRecentSearch(keyword: string): string[] {
  return write(read().filter((x) => x !== keyword));
}

export function clearTradeRecentSearches(): string[] {
  return write([]);
}
