/** Global Search recent keywords. Domain recent keys are not deleted. */

const RECENT_KEY = "dibay:global-search:recent:v1";
const MAX_RECENT = 10;

export type GlobalRecentSearch = {
  keyword: string;
  createdAt: string;
};

function safeParse(raw: string | null): GlobalRecentSearch[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as GlobalRecentSearch[];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x) => x && typeof x.keyword === "string" && x.keyword.trim())
      .map((x) => ({
        keyword: x.keyword.trim(),
        createdAt: typeof x.createdAt === "string" ? x.createdAt : "",
      }))
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function getGlobalRecentSearches(): GlobalRecentSearch[] {
  if (typeof window === "undefined") return [];
  try {
    return safeParse(window.localStorage.getItem(RECENT_KEY));
  } catch {
    return [];
  }
}

export function addGlobalRecentSearch(keyword: string): GlobalRecentSearch[] {
  const k = keyword.trim().replace(/\s+/g, " ");
  if (!k) return getGlobalRecentSearches();
  const next = [
    { keyword: k, createdAt: new Date().toISOString() },
    ...getGlobalRecentSearches().filter((r) => r.keyword !== k),
  ].slice(0, MAX_RECENT);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return next;
}

export function removeGlobalRecentSearch(keyword: string): GlobalRecentSearch[] {
  const k = keyword.trim();
  const next = getGlobalRecentSearches().filter((r) => r.keyword !== k);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
