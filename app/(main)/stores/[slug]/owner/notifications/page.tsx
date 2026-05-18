import Link from "next/link";
import { Suspense } from "react";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { AppBackButton } from "@/components/navigation/AppBackButton";
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
      <header className="sticky top-0 z-10 border-b border-sam-border bg-sam-surface px-2 py-2">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <AppBackButton backHref={ownerHubHref} preferHistoryBack={false} />
          <h1 className="min-w-0 flex-1 truncate text-center sam-text-body-lg font-bold text-sam-fg">
            {translate(lang, "store_owner_notifications_title")}
          </h1>
          <span className="w-11 shrink-0" />
        </div>
      </header>
      <div className="mx-auto max-w-3xl space-y-4 px-3 pt-4">
        <OwnerNotificationList slug={safe} storeId={storeId} />
        <Link href={ordersHubHref} className="text-sm text-signature underline">
          {translate(lang, "store_owner_go_order_management")}
        </Link>
      </div>
    </div>
  );
}
