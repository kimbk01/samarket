"use client";

import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminOrderChatList } from "@/components/admin/delivery-orders/AdminOrderChatList";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

/**
 * 주문·채팅 관련 관리 화면으로의 허브 (404 방지 및 운영 동선 통일).
 */
export default function AdminOrderChatsHubPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-6 p-4 md:p-6">
      <AdminPageHeader titleKey="admin_order_chats_hub_title" descriptionKey="admin_order_chats_hub_desc" />

      <AdminCard title={t("admin_order_chats_recent_title")}>
        <AdminOrderChatList />
      </AdminCard>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="text-sm font-semibold text-sam-fg">{t("admin_order_chats_store_section_title")}</h2>
          <ul className="mt-2 space-y-2 sam-text-body-secondary text-sam-fg">
            <li>
              <Link className="text-signature underline" href="/admin/store-orders">
                {t("admin_order_chats_link_store_action")}
              </Link>
              <span className="text-sam-muted"> · </span>
              <code className="rounded bg-sam-app px-1 sam-text-xxs">?order_id=UUID</code>
            </li>
            <li>
              <Link className="text-signature underline" href="/admin/stores/orders">
                {t("admin_order_chats_link_delivery_kpi")}
              </Link>
            </li>
            <li>
              <span className="text-sam-fg">{t("admin_order_chats_order_chat_ui_label")}</span>
              <code className="rounded bg-sam-app px-1 sam-text-xxs">
                /admin/stores/orders/{"{"}주문UUID{"}"}/chat
              </code>
            </li>
          </ul>
        </section>

        <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="text-sm font-semibold text-sam-fg">{t("admin_order_chats_trade_section_title")}</h2>
          <ul className="mt-2 space-y-2 sam-text-body-secondary text-sam-fg">
            <li>
              <Link className="text-signature underline" href="/admin/chats/trade">
                {t("admin_order_chats_link_trade")}
              </Link>
            </li>
            <li>
              <Link className="text-signature underline" href="/admin/chats/messenger">
                {t("admin_order_chats_link_messenger")}
              </Link>
              <span className="text-sam-muted">{t("admin_order_chats_room_search_hint")}</span>
              <code className="rounded bg-sam-app px-1 sam-text-xxs">?room=UUID</code>
              <span className="text-sam-muted">{t("admin_order_chats_or")}</span>
              <code className="rounded bg-sam-app px-1 sam-text-xxs">{t("admin_order_chats_q_keyword_example")}</code>
            </li>
            <li>
              <Link className="text-signature underline" href="/admin/chats">
                {t("admin_order_chats_link_all")}
              </Link>
            </li>
          </ul>
        </section>
      </div>

      <p className="sam-text-helper leading-relaxed text-sam-muted">
        {t("admin_order_chats_foot_1")}
        <code className="rounded bg-sam-app px-1">order_chat_*</code>
        {t("admin_order_chats_foot_2")}
        <code className="rounded bg-sam-app px-1">/api/order-chat/…</code>
        {t("admin_order_chats_foot_3")}
        <code className="rounded bg-sam-app px-1">/admin/stores/orders/{"{"}주문UUID{"}"}/chat</code>
        {t("admin_order_chats_foot_4")}
        <code className="rounded bg-sam-app px-1">/api/admin/order-chat/…</code>
        {t("admin_order_chats_foot_5")}
        <Link href="/admin/store-orders" className="text-signature underline">
          {t("admin_order_chats_link_store_action")}
        </Link>
        {t("admin_order_chats_foot_6")}
        <code className="rounded bg-sam-app px-1">order_id</code>
        {t("admin_order_chats_foot_7")}
      </p>
    </div>
  );
}
