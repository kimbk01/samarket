/**
 * Member App Icon / Bell badge-count runtime surface.
 *
 * CONTRACT: Member + Owner/member shared routes own `/api/me/notifications/badge-count`.
 * Platform Admin (`/admin`, `/admin/*`) does not. Admin ops count SSOT is
 * `loadAdminActionQueueCounts` → `/api/admin/admin-bell`.
 *
 * DO NOT: pathname===one admin page cancel · force digit 0 · mask API on Admin.
 * DO NOT: disable this runtime on Member / Owner / Messenger / Trade / order surfaces.
 */

export function normalizeSurfacePathname(pathname: string | null | undefined): string {
  const raw = String(pathname ?? "").trim();
  const noHash = raw.split("#")[0] ?? "";
  const noQuery = noHash.split("?")[0] ?? "";
  const p = noQuery.trim();
  if (!p) return "/";
  return p.startsWith("/") ? p : `/${p}`;
}

export function isPlatformAdminSurfacePath(pathname: string | null | undefined): boolean {
  const p = normalizeSurfacePathname(pathname);
  return p === "/admin" || p.startsWith("/admin/");
}

export function readClientSurfacePathname(): string {
  if (typeof window === "undefined") return "/";
  try {
    return normalizeSurfacePathname(window.location?.pathname);
  } catch {
    return "/";
  }
}

/** True where Member badge-count / App Icon / Member Bell projection may run. */
export function isMemberBadgeAuthoritySurface(pathname?: string | null): boolean {
  const p = pathname == null ? readClientSurfacePathname() : normalizeSurfacePathname(pathname);
  return !isPlatformAdminSurfacePath(p);
}
