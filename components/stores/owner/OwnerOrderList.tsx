"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { OwnerOrder } from "@/lib/store-owner/types";
import { OwnerOrderCard } from "./OwnerOrderCard";

export function OwnerOrderList({
  storeId,
  slug,
  orders,
  onActionDone,
}: {
  storeId: string;
  slug: string;
  orders: OwnerOrder[];
  onActionDone?: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  if (orders.length === 0) {
    return (
      <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/80 py-16 text-center text-sm text-sam-muted">
        {t("store_owner_tab_empty")}
      </div>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {orders.map((o) => (
        <OwnerOrderCard
          key={o.id}
          storeId={storeId}
          slug={slug}
          order={o}
          onActionDone={onActionDone}
        />
      ))}
    </div>
  );
}
