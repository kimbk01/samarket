/** Bridge — open Owner public-store preview without leaving Owner stack. */

type Listener = (slug: string) => void;

let openListener: Listener | null = null;
let pendingSlug: string | null = null;

export const OWNER_STORE_PREVIEW_HREF = "owner-action:store-preview";

export function isOwnerStorePreviewActionHref(href: string): boolean {
  return href === OWNER_STORE_PREVIEW_HREF || href.startsWith("owner-action:store-preview");
}

export function registerOwnerStorePreviewOpen(listener: Listener | null): void {
  openListener = listener;
  if (listener && pendingSlug) {
    const slug = pendingSlug;
    pendingSlug = null;
    listener(slug);
  }
}

export function openOwnerStorePreview(slug: string): boolean {
  const s = slug.trim();
  if (!s) return false;
  if (openListener) {
    openListener(s);
    return true;
  }
  pendingSlug = s;
  return true;
}
