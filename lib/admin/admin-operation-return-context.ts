/**
 * CUT E — Admin operation return context (filter / search / page / tab preservation).
 * Uses existing query-string convention only — no sessionStorage history hack.
 */

export const ADMIN_OPS_RETURN_TO_PARAM = "returnTo" as const;

/** Safe internal Admin path only. */
export function sanitizeAdminReturnTo(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s.startsWith("/admin")) return null;
  if (s.startsWith("//")) return null;
  if (s.includes("://")) return null;
  return s;
}

export function withAdminReturnTo(href: string, returnTo: string | null | undefined): string {
  const base = href.trim();
  const ret = sanitizeAdminReturnTo(returnTo);
  if (!ret || !base.startsWith("/admin")) return base;
  const u = new URL(base, "https://admin.local");
  u.searchParams.set(ADMIN_OPS_RETURN_TO_PARAM, ret);
  return `${u.pathname}${u.search}${u.hash}`;
}

export function readAdminReturnToFromSearch(
  search: string | URLSearchParams | null | undefined
): string | null {
  if (!search) return null;
  const sp = typeof search === "string" ? new URLSearchParams(search) : search;
  return sanitizeAdminReturnTo(sp.get(ADMIN_OPS_RETURN_TO_PARAM));
}

/** Action Center entry anchors — reuse /admin, no new shell. */
export const ADMIN_CONTROL_PLANE_ENTRY = "/admin" as const;
export const ADMIN_ACTION_CENTER_HASH = "action-center" as const;

export function adminActionCenterHref(): string {
  return `${ADMIN_CONTROL_PLANE_ENTRY}#${ADMIN_ACTION_CENTER_HASH}`;
}
