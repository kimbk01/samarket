import type { AdminMenuItem } from "@/components/admin/admin-menu";

export type MenuPathParts = {
  pathname: string;
  search: string;
  hash: string;
};

/** Pathname only (no query/hash). Trailing slash normalized. */
export function normalizeMenuPathname(path: string): string {
  const noHash = path.split("#")[0] ?? path;
  const pathname = noHash.split("?")[0] ?? noHash;
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname || "/admin";
}

export function splitMenuPath(path: string): MenuPathParts {
  const hashIdx = path.indexOf("#");
  const hash = hashIdx >= 0 ? path.slice(hashIdx) : "";
  const beforeHash = hashIdx >= 0 ? path.slice(0, hashIdx) : path;
  const q = beforeHash.indexOf("?");
  if (q < 0) {
    return { pathname: normalizeMenuPathname(beforeHash), search: "", hash };
  }
  return {
    pathname: normalizeMenuPathname(beforeHash.slice(0, q)),
    search: beforeHash.slice(q),
    hash,
  };
}

/** Legacy alias used by collect helpers. */
export function normalizeMenuPath(path: string): string {
  return normalizeMenuPathname(path);
}

/**
 * Score how well `currentPath` (may include ?query#hash) matches a menu path entry.
 * Exact path-segment match / descendant; query keys and hash required when declared.
 * Returns -1 when no match.
 */
export function menuPathMatchScore(currentPath: string, menuPath: string): number {
  const current = splitMenuPath(currentPath);
  const menu = splitMenuPath(menuPath);

  if (menu.pathname === "/admin") {
    if (current.pathname !== "/admin") return -1;
  } else if (
    current.pathname !== menu.pathname &&
    !current.pathname.startsWith(`${menu.pathname}/`)
  ) {
    return -1;
  }

  if (menu.search) {
    const required = new URLSearchParams(menu.search);
    const actual = new URLSearchParams(current.search);
    for (const [key, value] of required.entries()) {
      if (actual.get(key) !== value) return -1;
    }
  }

  // Hash is significant when the menu entry declares one (CP Action Queue / Monitoring).
  if (menu.hash) {
    if (current.hash !== menu.hash) return -1;
  }

  let score = menu.pathname.length * 1000;
  if (menu.search) score += menu.search.length;
  if (menu.hash) score += 100 + menu.hash.length;
  // Prefer unhashed leaf when URL has no hash (beats hashed siblings that already returned -1).
  if (!menu.hash && !current.hash) score += 50;
  if (current.pathname === menu.pathname) score += 1;
  return score;
}

/** 그룹 내 모든 메뉴 path + matchPaths (중첩 포함) */
export function collectMenuPaths(items: AdminMenuItem[]): string[] {
  const out: string[] = [];
  for (const it of items) {
    if (it.path) out.push(it.path);
    if (it.matchPaths?.length) out.push(...it.matchPaths);
    if (it.children?.length) out.push(...collectMenuPaths(it.children));
  }
  return out;
}

/**
 * 현재 URL과 일치하는 메뉴 path 중 최고 점수 (형제 prefix·query·hash 구분).
 */
export function bestMatchingMenuPath(currentPath: string, paths: string[]): string | null {
  let best: string | null = null;
  let bestScore = -1;
  for (const p of paths) {
    const score = menuPathMatchScore(currentPath, p);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

/**
 * Leaf active — only the single best-matching path (or its matchPaths entry) is active.
 * Parent paths that merely own a longer descendant are NOT active.
 */
export function isLeafMenuActive(
  path: string | undefined,
  currentPath: string,
  pathsScope: string[],
  matchPaths?: string[]
): boolean {
  if (!path) return false;
  const best = bestMatchingMenuPath(currentPath, pathsScope);
  if (best == null) return false;
  if (best === path) return true;
  if (matchPaths?.includes(best)) return true;

  const bestParts = splitMenuPath(best);
  const pathParts = splitMenuPath(path);
  if (
    bestParts.pathname === pathParts.pathname &&
    bestParts.search === pathParts.search &&
    bestParts.hash === pathParts.hash
  ) {
    return true;
  }
  for (const m of matchPaths ?? []) {
    const mp = splitMenuPath(m);
    if (
      bestParts.pathname === mp.pathname &&
      bestParts.search === mp.search &&
      bestParts.hash === mp.hash
    ) {
      return true;
    }
  }
  return false;
}

/** 그룹 하위(중첩 포함)에 현재 경로와 매칭되는 path 가 있는지 */
export function hasActiveDescendantInMenu(
  items: AdminMenuItem[],
  currentPath: string
): boolean {
  const paths = collectMenuPaths(items);
  return bestMatchingMenuPath(currentPath, paths) != null;
}
