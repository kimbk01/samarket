"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildStoreOrdersHref, type StoreOrderTabId } from "@/lib/business/store-orders-tab";

const TRY_TABS: StoreOrderTabId[] = ["progress", "shipping", "done", "cancelled"];

export function OwnerStoreOrderDeepLinkMissBanner({
  storeId,
  orderId,
  onRefresh,
}: {
  storeId: string;
  orderId: string;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const oid = orderId.trim();

  return (
    <div className="rounded-ui-rect border border-sam-warning/30 bg-sam-warning-soft p-4 text-[14px] leading-[1.35] text-sam-fg">
      <p className="font-bold">{t("store_owner_orders_deeplink_miss_title")}</p>
      <p className="mt-1">{t("store_owner_orders_deeplink_miss_body")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-ui-rect border border-sam-warning/30 bg-sam-surface px-3 py-2 text-[12px] font-bold text-sam-fg"
        >
          {t("store_owner_orders_deeplink_miss_refresh")}
        </button>
        {TRY_TABS.map((tabId) => (
          <Link
            key={tabId}
            href={buildStoreOrdersHref({ storeId, tab: tabId, orderId: oid })}
            className="rounded-ui-rect border border-sam-warning/30 bg-sam-surface px-3 py-2 text-[12px] font-semibold text-sam-fg underline"
          >
            {t("store_owner_orders_deeplink_miss_try_tab", {
              tab: t(
                tabId === "progress"
                  ? "store_owner_mobile_tab_progress"
                  : tabId === "shipping"
                    ? "store_owner_mobile_tab_shipping"
                    : tabId === "done"
                      ? "store_owner_mobile_tab_done"
                      : "store_owner_mobile_tab_cancelled"
              ),
            })}
          </Link>
        ))}
      </div>
    </div>
  );
}
