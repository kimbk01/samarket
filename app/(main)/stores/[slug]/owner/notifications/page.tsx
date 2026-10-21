import { redirectSlugOwnerPage } from "@/lib/business/redirect-slug-owner-page";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** 구 `/stores/[slug]/owner/notifications` → `/stores/owner/notifications?storeId=` (분기 사본 제거) */
export default async function StoreOwnerNotificationsPage({ params, searchParams }: PageProps) {
  return redirectSlugOwnerPage("notifications", params, searchParams);
}
