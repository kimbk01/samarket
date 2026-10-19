"use client";

import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminTechDetails } from "@/components/admin/ui/AdminStateViews";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type Props = { orderId: string };

/** Empty lookup-only state when the order has no linked messenger room (admin never creates rooms). */
export function AdminDeliveryOrderChatLookupEmpty({ orderId }: Props) {
  const { language, t } = useI18n();
  const ko = language !== "en";
  return (
    <div
      className="space-y-4 p-4 md:p-6"
      data-admin-surface="live"
      data-admin-domain="delivery"
      data-testid="admin-order-chat-lookup-empty"
    >
      <AdminPageHeader titleKey="admin_menu_order_chats" descriptionKey="admin_r4b_chat_desc" backHref="/admin/order-chats" />
      <div className="flex flex-wrap gap-2 sam-text-body-secondary">
        <Link href={`/admin/stores/orders/${encodeURIComponent(orderId)}`} className="text-signature underline">
          {ko ? "주문 상세 보기" : "Open order detail"}
        </Link>
        <span className="text-sam-muted">·</span>
        <Link href="/admin/store-orders" className="text-sam-muted underline">
          {ko ? "처리 필요 주문" : "Orders needing action"}
        </Link>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-sm text-sam-muted">
        {t("admin_r4b_chat_no_room")}
        <AdminTechDetails ko={ko}>orderId={orderId}</AdminTechDetails>
      </div>
    </div>
  );
}
