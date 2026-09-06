import type { AdminMenuItem } from "@/components/admin/admin-menu";

export type MenuPathParts = {
  pathname: string;
  search: string;
  hash: string;
};

export type MenuPathScopeEntry = {
  path: string;
  exactPath?: boolean;
  /** current pathname must start with this prefix (after normalize). */
  asPrefix?: boolean;
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
 * When `exactPath` is true, descendant prefix matches are rejected.
 * When `asPrefix` is true, menu pathname is treated as a required prefix of current.
 */
export function menuPathMatchScore(
  currentPath: string,
  menuPath: string,
  opts?: { exactPath?: boolean; asPrefix?: boolean }
): number {
  const current = splitMenuPath(currentPath);
  const menu = splitMenuPath(menuPath);

  if (menu.pathname === "/admin") {
    if (current.pathname !== "/admin") return -1;
  } else if (opts?.asPrefix) {
    // Prefix catch-all is descendants only — exact leaf is owned by its own menu path.
    if (!current.pathname.startsWith(`${menu.pathname}/`)) {
      return -1;
    }
  } else if (opts?.exactPath) {
    if (current.pathname !== menu.pathname) return -1;
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
  // Prefix-only catch-alls should lose to longer exact siblings.
  if (opts?.asPrefix) score -= 10;
  return score;
}

/** 그룹 내 모든 메뉴 path + matchPaths (+ optional prefix catch-alls) */
export function collectMenuPathEntries(items: AdminMenuItem[]): MenuPathScopeEntry[] {
  const out: MenuPathScopeEntry[] = [];
  for (const it of items) {
    if (it.path) {
      out.push({ path: it.path, exactPath: it.exactPath === true });
    }
    if (it.matchPaths?.length) {
      for (const m of it.matchPaths) out.push({ path: m });
    }
    if (it.matchPathPrefixes?.length) {
      for (const m of it.matchPathPrefixes) out.push({ path: m, asPrefix: true });
    }
    if (it.children?.length) out.push(...collectMenuPathEntries(it.children));
  }
  return out;
}

export function collectMenuPaths(items: AdminMenuItem[]): string[] {
  return collectMenuPathEntries(items).map((e) => e.path);
}

/**
 * 현재 URL과 일치하는 메뉴 path 중 최고 점수 엔트리.
 */
export function bestMatchingMenuEntry(
  currentPath: string,
  paths: string[] | MenuPathScopeEntry[]
): MenuPathScopeEntry | null {
  const entries: MenuPathScopeEntry[] = paths.map((p) =>
    typeof p === "string" ? { path: p } : p
  );
  let best: MenuPathScopeEntry | null = null;
  let bestScore = -1;
  for (const e of entries) {
    const score = menuPathMatchScore(currentPath, e.path, {
      exactPath: e.exactPath,
      asPrefix: e.asPrefix,
    });
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

export function bestMatchingMenuPath(
  currentPath: string,
  paths: string[] | MenuPathScopeEntry[]
): string | null {
  return bestMatchingMenuEntry(currentPath, paths)?.path ?? null;
}

/**
 * Leaf active — only the single best-matching path (or its matchPaths entry) is active.
 * Parent paths that merely own a longer descendant are NOT active.
 * Prefix catch-alls attribute only to leaves that declare `matchPathPrefixes`.
 */
export function isLeafMenuActive(
  path: string | undefined,
  currentPath: string,
  pathsScope: string[] | MenuPathScopeEntry[],
  matchPaths?: string[],
  opts?: { exactPath?: boolean; matchPathPrefixes?: string[] }
): boolean {
  if (!path) return false;
  const best = bestMatchingMenuEntry(currentPath, pathsScope);
  if (best == null) return false;

  if (best.asPrefix) {
    const prefixes = opts?.matchPathPrefixes ?? [];
    return prefixes.some((p) => splitMenuPath(p).pathname === splitMenuPath(best.path).pathname);
  }

  if (best.path === path) return true;
  if (matchPaths?.includes(best.path)) return true;

  const bestParts = splitMenuPath(best.path);
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
  const entries = collectMenuPathEntries(items);
  return bestMatchingMenuPath(currentPath, entries) != null;
}
