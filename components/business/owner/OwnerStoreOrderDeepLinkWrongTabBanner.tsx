"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import type { OwnerMobileOrderTabId } from "@/lib/business/owner-mobile-orders-tab";
import type { MessageKey } from "@/lib/i18n/messages";

const TAB_LABEL_KEYS: Record<OwnerMobileOrderTabId, MessageKey> = {
  new: "store_owner_mobile_tab_new_orders",
  progress: "store_owner_mobile_tab_progress",
  shipping: "store_owner_mobile_tab_shipping",
  done: "store_owner_mobile_tab_done",
  cancelled: "store_owner_mobile_tab_cancelled",
};

export function OwnerStoreOrderDeepLinkWrongTabBanner({
  storeId,
  orderId,
  wantTab,
}: {
  storeId: string;
  orderId: string;
  wantTab: OwnerMobileOrderTabId;
}) {
  const { t } = useI18n();
  const tabLabel = t(TAB_LABEL_KEYS[wantTab]);

  return (
    <div className="rounded-[4px] border border-amber-200 bg-amber-50 p-4 text-[14px] leading-[1.35] text-amber-950">
      <p className="font-bold">{t("store_owner_orders_deeplink_wrong_tab_title")}</p>
      <p className="mt-1">{t("store_owner_orders_deeplink_wrong_tab_body")}</p>
      <Link
        href={buildStoreOrdersHref({ storeId, tab: wantTab, orderId, freshList: true })}
        className="mt-3 inline-flex rounded-[4px] border border-amber-300 bg-white px-3 py-2 text-[12px] font-bold text-amber-950 underline"
      >
        {t("store_owner_orders_deeplink_wrong_tab_open", { tab: tabLabel })}
      </Link>
    </div>
  );
}
