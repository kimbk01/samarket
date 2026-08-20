"use client";

import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type Props = { orderId: string };

/** Empty lookup-only state when store_orders has no community_messenger_room_id. */
export function AdminDeliveryOrderChatLookupEmpty({ orderId }: Props) {
  const { t, safeT } = useI18n();
  return (
    <div
      className="space-y-4 p-4 md:p-6"
      data-admin-surface="live"
      data-admin-domain="delivery"
      data-testid="admin-order-chat-lookup-empty"
    >
      <AdminPageHeader
        title={t("admin_do_chat_title")}
        description={t("admin_do_chat_desc")}
        backHref="/admin/order-chats"
      />
      <div className="flex flex-wrap gap-2 sam-text-body-secondary">
        <Link
          href={`/admin/store-orders?order_id=${encodeURIComponent(orderId)}`}
          className="text-signature underline"
        >
          {t("admin_do_chat_open_store_orders")}
        </Link>
        <span className="text-sam-muted">·</span>
        <Link
          href={`/admin/stores/orders/${encodeURIComponent(orderId)}`}
          className="text-sam-muted underline"
        >
          {t("admin_do_chat_delivery_table")}
        </Link>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-sm text-sam-muted">
        {safeT("admin_do_chat_lookup_empty", {
          fallbackKo:
            "이 주문에 연결된 메신저 채팅방이 없습니다. (조회 전용 — 방을 생성하지 않습니다)",
          fallbackEn:
            "No messenger room is linked to this order. (Lookup only — rooms are not created here.)",
        })}
        <div className="mt-2 font-mono sam-text-xxs">orderId={orderId}</div>
      </div>
    </div>
  );
}
