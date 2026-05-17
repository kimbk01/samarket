/** 매장 오너 알림 목록 — `/stores/:slug/owner/notifications` */
export function buildOwnerStoreNotificationsHref(slug: string): string {
  const safe = slug.trim();
  if (!safe) return "";
  return `/stores/${encodeURIComponent(safe)}/owner/notifications`;
}

export function resolveOwnerStoreNotificationsHref(
  row: { slug?: string | null } | null | undefined
): string | null {
  const href = buildOwnerStoreNotificationsHref(row?.slug ?? "");
  return href || null;
}
