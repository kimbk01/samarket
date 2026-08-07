import type { AdminMenuItem } from "@/components/admin/admin-menu";

function normalizeMenuPath(path: string): string {
  return path.split("#")[0]?.split("?")[0] ?? path;
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
 * 현재 URL과 일치하는 메뉴 path 중 가장 긴 것 (형제 간 /admin/stores vs /admin/stores/… 구분)
 */
export function bestMatchingMenuPath(currentPath: string, paths: string[]): string | null {
  const candidates = paths.filter((p) => {
    const normalizedPath = normalizeMenuPath(p);
    return currentPath === normalizedPath || currentPath.startsWith(`${normalizedPath}/`);
  });
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) =>
    normalizeMenuPath(b).length > normalizeMenuPath(a).length ? b : a
  );
}

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
  const owned = [path, ...(matchPaths ?? [])].map(normalizeMenuPath);
  const bestNorm = normalizeMenuPath(best);
  const ownsBest = owned.some((p) => bestNorm === p || bestNorm.startsWith(`${p}/`));
  if (!ownsBest) return false;
  // Ensure no longer sibling path owns the current URL
  return bestMatchingMenuPath(currentPath, pathsScope) === best;
}

/** 그룹 하위(중첩 포함)에 현재 경로와 매칭되는 path 가 있는지 */
export function hasActiveDescendantInMenu(
  items: AdminMenuItem[],
  currentPath: string
): boolean {
  const paths = collectMenuPaths(items);
  return bestMatchingMenuPath(currentPath, paths) != null;
}
