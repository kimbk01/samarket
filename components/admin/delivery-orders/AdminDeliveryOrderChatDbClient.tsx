"use client";

import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type Props = { orderId: string };

export function AdminDeliveryOrderChatDbClient({ orderId }: Props) {
  const { t } = useI18n();
  return (
    <div className="space-y-4 p-4 md:p-6">
      <AdminPageHeader
        title={t("admin_do_chat_title")}
        description={t("admin_do_chat_desc")}
        backHref="/admin/order-chats"
      />
      <div className="flex flex-wrap gap-2 sam-text-body-secondary">
        <Link href={`/admin/store-orders?order_id=${encodeURIComponent(orderId)}`} className="text-signature underline">
          {t("admin_do_chat_open_store_orders")}
        </Link>
        <span className="text-sam-muted">·</span>
        <Link href={`/admin/stores/orders/${encodeURIComponent(orderId)}`} className="text-sam-muted underline">
          {t("admin_do_chat_delivery_table")}
        </Link>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-sm text-sam-muted">
        {t("admin_do_chat_room_hint", { orderId })}
      </div>
    </div>
  );
}
