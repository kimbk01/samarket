"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminOrderChatList } from "@/components/admin/delivery-orders/AdminOrderChatList";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

/**
 * Delivery order-chat hub — lookup list + cross-links.
 * Authority = Delivery (store_orders). Messenger may open this with ?from=messenger as REFERENCE only.
 */
function AdminOrderChatsHubInner() {
  const { t, safeT } = useI18n();
  const searchParams = useSearchParams();
  const fromMessenger = (searchParams.get("from") ?? "").trim().toLowerCase() === "messenger";

  return (
    <div className="space-y-6 p-4 md:p-6">
      <AdminPageHeader titleKey="admin_order_chats_hub_title" descriptionKey="admin_order_chats_hub_desc" />

      {fromMessenger ? (
        <div
          className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 sam-text-helper text-amber-950"
          data-testid="admin-messenger-order-reference-banner"
          data-admin-entry="messenger-reference"
        >
          {safeT("admin_messenger_order_reference_banner", {
            fallbackKo: "메신저 메뉴에서 들어왔습니다. 주문 채팅은 이 화면에서 조회합니다. 관리자 화면에서는 채팅방을 새로 만들지 않습니다.",
            fallbackEn: "Opened from the Messenger menu. Order chats are looked up on this screen. Admin screens never create chat rooms.",
          })}
        </div>
      ) : null}

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
            </li>
            <li>
              <Link className="text-signature underline" href="/admin/stores/orders">
                {t("admin_order_chats_link_delivery_kpi")}
              </Link>
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
        {safeT("admin_order_chats_foot_authority", {
          fallbackKo: "주문 채팅은 주문에 연결된 채팅방이 있을 때만 열립니다. 관리자 화면에서는 채팅방을 새로 만들지 않습니다. 주문번호를 누르면 주문 상세가 열립니다.",
          fallbackEn: "An order chat opens only when the order already has a chat room. Admin screens never create rooms. Tap an order number to open its detail.",
        })}
      </p>
    </div>
  );
}

export default function AdminOrderChatsHubPage() {
  return (
    <Suspense fallback={null}>
      <AdminOrderChatsHubInner />
    </Suspense>
  );
}
