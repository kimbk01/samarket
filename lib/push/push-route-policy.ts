/** Push route navigation policy — shared by PushRouteListener. */

export function shouldReplaceRoute(path: string): boolean {
  return (
    /^\/community-messenger\/calls\/[^/?#]+/.test(path) &&
    (path.includes("action=accept") || path.includes("callAction=accept"))
  );
}

const PUSH_ROUTE_GUARD_ORIGIN = "https://dibay.internal";

/**
 * LINK-01 — same-origin guard for every in-app push/deep-link navigation.
 * Structural only (no prefix allowlist) so legacy native-resolved routes such as
 * `/calls/logs` keep working on installed binaries. Rejects protocol-relative
 * (`//host`), backslash (`/\host`) and control-character paths that a router would
 * resolve off-origin. Returns the original trimmed path when safe, otherwise null.
 */
export function resolveSameOriginPushRoutePath(raw: unknown): string | null {
  const path = typeof raw === "string" ? raw.trim() : "";
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(path)) return null;
  try {
    if (new URL(path, PUSH_ROUTE_GUARD_ORIGIN).origin !== PUSH_ROUTE_GUARD_ORIGIN) return null;
  } catch {
    return null;
  }
  return path;
}
