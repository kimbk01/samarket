import { OwnerRoutes } from "@/lib/business/owner-routes";
import { isStoreSlugConsumerSubtree } from "@/lib/stores/store-consumer-route";

/** 매장 오너 하단 「홈」— 소비자 매장 메뉴(`/stores/[slug]`) */
export function resolveOwnerStoreConsumerHomeHref(
  storeId: string,
  storeSlug?: string | null
): string {
  const slug = (storeSlug ?? "").trim();
  if (slug) return `/stores/${encodeURIComponent(slug)}`;
  return OwnerRoutes.hub(storeId);
}

export function isOwnerStoreConsumerHomePath(
  pathname: string,
  storeSlug?: string | null
): boolean {
  const slug = (storeSlug ?? "").trim();
  if (!slug) return false;
  return isStoreSlugConsumerSubtree(pathname, slug);
}
