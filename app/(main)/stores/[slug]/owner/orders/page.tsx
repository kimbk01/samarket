import { redirectSlugOwnerPage } from "@/lib/business/redirect-slug-owner-page";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** 구 `/stores/[slug]/owner/orders` → `/stores/owner/orders?storeId=` (slug→storeId, 쿼리 보존) */
export default async function StoreOwnerOrdersPage({ params, searchParams }: PageProps) {
  return redirectSlugOwnerPage("orders", params, searchParams);
}
