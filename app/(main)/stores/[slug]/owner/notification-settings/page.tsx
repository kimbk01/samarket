import { Suspense } from "react";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { OwnerSubpageDetailHeader } from "@/components/stores/owner/OwnerSubpageDetailHeader";
import { OwnerNotificationSettings } from "@/components/stores/owner/OwnerNotificationSettings";
import { resolveServerInitialLanguage } from "@/lib/i18n/language-preference";
import { translate } from "@/lib/i18n/messages";
import { resolveStoreIdBySlug } from "@/lib/store-owner/queries";

type PageProps = { params: Promise<{ slug: string }> };

export default function StoreOwnerNotificationSettingsPage({ params }: PageProps) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={4} />}>
      <StoreOwnerNotificationSettingsPageBody params={params} />
    </Suspense>
  );
}

async function StoreOwnerNotificationSettingsPageBody({ params }: PageProps) {
  const { slug } = await params;
  const safe = typeof slug === "string" ? slug : "";
  const storeId = await resolveStoreIdBySlug(safe);
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
        title={translate(lang, "store_owner_notification_settings_title")}
        backHref={`/stores/${encodeURIComponent(safe)}/owner/notifications`}
      />
      <div className="mx-auto max-w-3xl px-3 pt-4">
        <OwnerNotificationSettings storeId={storeId} />
      </div>
    </div>
  );
}
