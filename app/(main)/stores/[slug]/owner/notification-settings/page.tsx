import { redirectSlugOwnerPage } from "@/lib/business/redirect-slug-owner-page";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** 구 `/stores/[slug]/owner/notification-settings` → `/stores/owner/notification-settings?storeId=` */
export default async function StoreOwnerNotificationSettingsPage({ params, searchParams }: PageProps) {
  return redirectSlugOwnerPage("notification-settings", params, searchParams);
}
