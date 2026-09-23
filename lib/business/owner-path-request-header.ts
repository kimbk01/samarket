/** Proxy → RSC layout bridge for `/stores/owner/*` (must be on the *request*, not only response). */
export const X_SAM_OWNER_PATH_HEADER = "x-sam-owner-path";

export function isStoresOwnerPath(pathname: string): boolean {
  return pathname === "/stores/owner" || pathname.startsWith("/stores/owner/");
}

export function isOwnerOrderChatEnsurePath(pathname: string): boolean {
  return (
    pathname === "/stores/owner/order-chat" ||
    pathname.startsWith("/stores/owner/order-chat/")
  );
}

/**
 * Inject pathname so `app/(main)/stores/owner/layout.tsx` can skip admin client on ensure.
 * Response-only headers are invisible to `headers()` in Server Components — that NO-OP left
 * ensure wrapping StoresOwnerLayoutClient and tripped Cap AppRouter React #310.
 */
export function applyOwnerPathRequestHeader(headers: Headers, pathname: string): void {
  if (!isStoresOwnerPath(pathname)) return;
  headers.set(X_SAM_OWNER_PATH_HEADER, pathname);
}
