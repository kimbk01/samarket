import type { AdminMenuItem } from "@/components/admin/admin-menu";

function normalizeMenuPath(path: string): string {
  return path.split("?")[0] ?? path;
}

/** 그룹 내 모든 메뉴 path (중첩 포함) */
export function collectMenuPaths(items: AdminMenuItem[]): string[] {
  const out: string[] = [];
  for (const it of items) {
    if (it.path) out.push(it.path);
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
  pathsScope: string[]
): boolean {
  if (!path) return false;
  const best = bestMatchingMenuPath(currentPath, pathsScope);
  return best === path;
}
