import Link from "next/link";
import { Suspense } from "react";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { OwnerSubpageDetailHeader } from "@/components/stores/owner/OwnerSubpageDetailHeader";
import { OwnerNotificationList } from "@/components/stores/owner/OwnerNotificationList";
import { resolveServerInitialLanguage } from "@/lib/i18n/language-preference";
import { translate } from "@/lib/i18n/messages";
import { resolveStoreIdBySlug } from "@/lib/store-owner/queries";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";

type PageProps = { params: Promise<{ slug: string }> };

export default function StoreOwnerNotificationsPage({ params }: PageProps) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={5} />}>
      <StoreOwnerNotificationsPageBody params={params} />
    </Suspense>
  );
}

async function StoreOwnerNotificationsPageBody({ params }: PageProps) {
  const { slug } = await params;
  const safe = typeof slug === "string" ? slug : "";
  const storeId = await resolveStoreIdBySlug(safe);
  const ordersHubHref = storeId ? buildStoreOrdersHref({ storeId }) : "/stores/owner/orders";
  const ownerHubHref = storeId
    ? `/stores/owner?storeId=${encodeURIComponent(storeId)}`
    : "/stores/owner";
  const lang = resolveServerInitialLanguage({});

  if (!storeId) {
    return (
      <div className="min-h-screen bg-sam-app px-4 py-16 text-center text-sm text-sam-fg">
        {translate(lang, "store_owner_slug_not_found")}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-sam-app pb-10">
      <OwnerSubpageDetailHeader
        title={translate(lang, "store_owner_notifications_title")}
        backHref={ownerHubHref}
      />
      <div className="mx-auto max-w-3xl space-y-4 px-3 pt-4">
        <OwnerNotificationList slug={safe} storeId={storeId} />
        <Link href={ordersHubHref} className="text-sm text-signature underline">
          {translate(lang, "store_owner_go_order_management")}
        </Link>
      </div>
    </div>
  );
}
