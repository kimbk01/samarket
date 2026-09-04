/**
 * Platform Admin workspace routing — derived from `adminMenu` SSOT only.
 * LOCK: docs/admin/platform-admin-ia-lock.md · Phase 2 shell
 */

import {
  adminMenu,
  filterMenuByRole,
  type AdminMenuItem,
  type AdminMenuRole,
} from "@/components/admin/admin-menu";
import type { MessageKey } from "@/lib/i18n/messages";

export type AdminWorkspaceId =
  | "dashboard"
  | "delivery"
  | "trade"
  | "community"
  | "messenger"
  | "finance"
  | "ads"
  | "support"
  | "notifications"
  | "system";

export type AdminWorkspaceDescriptor = {
  id: AdminWorkspaceId;
  key: string;
  titleKey: MessageKey;
  rootPath: string;
  item: AdminMenuItem;
};

type AdminPathParts = {
  pathname: string;
  search: string;
  hash: string;
};

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname || "/admin";
}

function splitAdminPath(path: string): AdminPathParts {
  const hashIdx = path.indexOf("#");
  const hash = hashIdx >= 0 ? path.slice(hashIdx) : "";
  const beforeHash = hashIdx >= 0 ? path.slice(0, hashIdx) : path;
  const queryIdx = beforeHash.indexOf("?");
  if (queryIdx < 0) {
    return { pathname: normalizePathname(beforeHash), search: "", hash };
  }
  return {
    pathname: normalizePathname(beforeHash.slice(0, queryIdx)),
    search: beforeHash.slice(queryIdx),
    hash,
  };
}

function normalizePath(path: string): string {
  return splitAdminPath(path).pathname;
}

function normalizeMenuPath(path: string): string {
  const parts = splitAdminPath(path);
  return `${parts.pathname}${parts.search}${parts.hash}`;
}

/** Collect navigable menu paths including matchPaths (pending included for matching). */
export function collectWorkspaceMatchPaths(item: AdminMenuItem): string[] {
  const out: string[] = [];
  function walk(nodes: AdminMenuItem[]) {
    for (const node of nodes) {
      if (node.path) out.push(node.path);
      if (node.matchPaths?.length) out.push(...node.matchPaths);
      if (node.children?.length) walk(node.children);
    }
  }
  if (item.path) out.push(item.path);
  if (item.matchPaths?.length) out.push(...item.matchPaths);
  if (item.children?.length) walk(item.children);
  return out;
}

/**
 * Does `currentPath` match a menu path entry?
 * `/admin` matches only exact home (not every /admin/*).
 */
export function adminPathMatches(currentPath: string, menuPath: string): boolean {
  const current = splitAdminPath(currentPath);
  const target = splitAdminPath(menuPath);
  if (target.pathname === "/admin") {
    if (current.pathname !== "/admin") return false;
  } else if (
    current.pathname !== target.pathname &&
    !current.pathname.startsWith(`${target.pathname}/`)
  ) {
    return false;
  }

  if (target.search) {
    const required = new URLSearchParams(target.search);
    const actual = new URLSearchParams(current.search);
    for (const [key, value] of required.entries()) {
      if (actual.get(key) !== value) return false;
    }
  }

  if (target.hash && current.hash !== target.hash) return false;
  return true;
}

function bestMatchLength(currentPath: string, menuPath: string): number {
  if (!adminPathMatches(currentPath, menuPath)) return -1;
  const current = splitAdminPath(currentPath);
  const target = splitAdminPath(menuPath);
  let score = target.pathname.length * 1000;
  if (target.search) score += target.search.length;
  if (target.hash) score += 100 + target.hash.length;
  if (!target.hash && !current.hash) score += 50;
  if (current.pathname === target.pathname) score += 1;
  return score;
}

/** First non-pending leaf path under a workspace (fallback: workspace.path). */
export function resolveWorkspaceRootPath(item: AdminMenuItem): string {
  function firstLeaf(nodes: AdminMenuItem[]): string | null {
    for (const node of nodes) {
      if (node.path && !node.pendingRoute) {
        const base = normalizePath(node.path);
        // Prefer non-hash overview roots when available
        if (!node.path.includes("#")) return base;
      }
      if (node.children?.length) {
        const nested = firstLeaf(node.children);
        if (nested) return nested;
      }
    }
    // hash-only fallback
    for (const node of nodes) {
      if (node.path && !node.pendingRoute) return normalizePath(node.path);
      if (node.children?.length) {
        const nested = firstLeaf(node.children);
        if (nested) return nested;
      }
    }
    return null;
  }

  if (item.children?.length) {
    const leaf = firstLeaf(item.children);
    if (leaf) return leaf;
  }
  if (item.path) return normalizePath(item.path);
  return "/admin";
}

export function listAdminWorkspaces(
  role: AdminMenuRole,
  menu: AdminMenuItem[] = adminMenu
): AdminWorkspaceDescriptor[] {
  const filtered = filterMenuByRole(menu, role);
  return filtered.map((item) => ({
    id: item.key as AdminWorkspaceId,
    key: item.key,
    titleKey: (item.titleKey ?? `admin_menu_${item.key.replace(/-/g, "_")}`) as MessageKey,
    rootPath: resolveWorkspaceRootPath(item),
    item,
  }));
}

export function resolveActiveWorkspace(
  pathname: string,
  role: AdminMenuRole,
  menu: AdminMenuItem[] = adminMenu
): AdminWorkspaceDescriptor {
  const workspaces = listAdminWorkspaces(role, menu);
  const current = normalizeMenuPath(pathname);

  let best: AdminWorkspaceDescriptor | null = null;
  let bestLen = -1;

  for (const ws of workspaces) {
    const paths = collectWorkspaceMatchPaths(ws.item);
    for (const p of paths) {
      const len = bestMatchLength(current, p);
      if (len > bestLen) {
        bestLen = len;
        best = ws;
      }
    }
  }

  if (best) return best;
  return (
    workspaces.find((w) => w.id === "dashboard") ??
    workspaces[0] ?? {
      id: "dashboard",
      key: "dashboard",
      titleKey: "admin_menu_home" as MessageKey,
      rootPath: "/admin",
      item: menu[0]!,
    }
  );
}

export type AdminBreadcrumbCrumb = {
  key: string;
  titleKey?: MessageKey;
  path?: string;
};

/** Ancestors from workspace root to best matching leaf (inclusive). */
export function resolveAdminBreadcrumb(
  pathname: string,
  workspace: AdminWorkspaceDescriptor
): AdminBreadcrumbCrumb[] {
  const crumbs: AdminBreadcrumbCrumb[] = [
    {
      key: workspace.key,
      titleKey: workspace.titleKey,
      path: workspace.rootPath,
    },
  ];

  const current = normalizePath(pathname);
  const children = workspace.item.children ?? [];
  if (children.length === 0) return crumbs;

  type StackEntry = { node: AdminMenuItem; chain: AdminMenuItem[] };
  const stack: StackEntry[] = children.map((node) => ({ node, chain: [node] }));
  let bestChain: AdminMenuItem[] | null = null;
  let bestScore = -1;

  while (stack.length > 0) {
    const { node, chain } = stack.pop()!;
    const candidates = [
      ...(node.path ? [node.path] : []),
      ...(node.matchPaths ?? []),
    ];
    for (const p of candidates) {
      const score = bestMatchLength(current, p);
      if (score > bestScore) {
        bestScore = score;
        bestChain = chain;
      }
    }
    if (node.children?.length) {
      for (const child of node.children) {
        stack.push({ node: child, chain: [...chain, child] });
      }
    }
  }

  if (!bestChain) return crumbs;

  for (const node of bestChain) {
    if (node.key === workspace.key) continue;
    crumbs.push({
      key: node.key,
      titleKey: node.titleKey,
      path: node.path && !node.pendingRoute ? normalizeMenuPath(node.path) : undefined,
    });
  }
  return crumbs;
}

/** True when pathname is under /admin and not owner routes (isolation guard). */
export function isPlatformAdminPathname(pathname: string): boolean {
  const p = normalizePath(pathname);
  if (p.startsWith("/stores/owner")) return false;
  return p === "/admin" || p.startsWith("/admin/");
}
