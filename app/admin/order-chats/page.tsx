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
            fallbackKo:
              "REFERENCE · Messenger 메뉴 진입입니다. 주문 채팅 Authority는 Delivery(/admin/order-chats · store_orders lookup)입니다. 방 생성·소유 이전 없음.",
            fallbackEn:
              "REFERENCE · Entered from Messenger menu. Order-chat authority stays on Delivery (/admin/order-chats · store_orders lookup). No create or ownership move.",
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
        {safeT("admin_order_chats_foot_authority", {
          fallbackKo:
            "주문 채팅 Authority = Delivery(store_orders lookup). CM room은 메시지 chrome 참조만 합니다. 주문 UUID는 매장 주문(액션)에서 확인하고, 연결된 방이 있을 때만 대화 UI를 엽니다(생성 없음).",
          fallbackEn:
            "Order-chat authority = Delivery (store_orders lookup). CM rooms are message chrome only. Resolve order UUIDs in store orders (actions) and open chat UI only when a room already exists (no create).",
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
