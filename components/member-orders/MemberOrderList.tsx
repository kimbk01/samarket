"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MemberOrder } from "@/lib/member-orders/types";
import { MemberOrderCard } from "./MemberOrderCard";

export function MemberOrderList({
  orders,
  basePath,
  onOpenCancel,
}: {
  orders: MemberOrder[];
  basePath: string;
  onOpenCancel?: (order: MemberOrder) => void;
}) {
  const { t } = useI18n();
  if (orders.length === 0) {
    return (
      <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app py-16 text-center text-sm text-sam-muted">
        {t("member_order_list_empty")}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {orders.map((o) => (
        <MemberOrderCard
          key={o.id}
          order={o}
          detailHref={`${basePath}/${encodeURIComponent(o.id)}`}
          chatHref={`${basePath}/${encodeURIComponent(o.id)}/chat`}
          onOpenCancel={onOpenCancel}
        />
      ))}
    </div>
  );
}
