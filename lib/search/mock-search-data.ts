/**
 * 8단계: 최근 검색어·인기 검색어 mock (localStorage 연동 가능)
 */

const RECENT_KEY = "kasama-recent-searches";
const MAX_RECENT = 10;

export interface RecentSearch {
  id: string;
  keyword: string;
  createdAt: string;
}

export function getRecentSearches(): RecentSearch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as RecentSearch[];
    return Array.isArray(arr) ? arr.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export function addRecentSearch(keyword: string): void {
  const k = keyword?.trim();
  if (!k) return;
  const list = getRecentSearches().filter((r) => r.keyword !== k);
  list.unshift({
    id: `rs-${Date.now()}`,
    keyword: k,
    createdAt: new Date().toISOString(),
  });
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch (_) {}
}

export function removeRecentSearch(id: string): void {
  const list = getRecentSearches().filter((r) => r.id !== id);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch (_) {}
}

export function clearRecentSearches(): void {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch (_) {}
}

/** 인기 검색어 placeholder (추후 API 연동) */
export const POPULAR_SEARCHES = [
  "아이폰",
  "맥북",
  "에어팟",
  "갤럭시",
  "무선이어폰",
];
