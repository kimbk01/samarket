"use client";

import Link from "next/link";
import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminOrderChatList } from "@/components/admin/delivery-orders/AdminOrderChatList";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

/**
 * Delivery order-chat hub — lookup list + cross-links.
 * Authority = Delivery (store orders). Chat workspace 「배달 주문」 = /admin/chats?type=store_order (J-AMD-4).
 * DEF-60/61: every 「주문 채팅 열기」 goes to /admin/stores/orders/{orderId}/chat — the single read-only
 * order-chat viewer (never the community messenger admin room screen).
 */
function AdminOrderChatsHubInner() {
  const { safeT, t, language } = useI18n();
  const ko = language !== "en";

  return (
    <div className="space-y-6 p-4 md:p-6">
      <AdminPageHeader
        titleKey="admin_menu_order_chats"
        description={
          ko
            ? "매장 주문에 연결된 채팅을 조회합니다. 거래 채팅·커뮤니티 메신저는 아래 관련 링크에서 엽니다."
            : "Look up chats linked to store orders. Trade chats and the community messenger open from the related links below."
        }
      />

      {/* R7 — 목록 전체를 서버 페이지네이션으로 넘긴다 (건수 상한 문구 없음 · 전체 건수는 목록 하단). */}
      <AdminCard title={ko ? "주문 채팅 목록" : "Order chats"}>
        <AdminOrderChatList />
      </AdminCard>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="text-sm font-semibold text-sam-fg">{ko ? "매장 주문" : "Store orders"}</h2>
          <ul className="mt-2 space-y-2 sam-text-body-secondary text-sam-fg">
            <li>
              <Link className="text-signature underline" href="/admin/store-orders">
                {t("admin_menu_store_orders_action_queue")}
              </Link>
            </li>
            <li>
              <Link className="text-signature underline" href="/admin/stores/orders">
                {t("admin_menu_delivery_order_list")}
              </Link>
            </li>
          </ul>
        </section>

        <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="text-sm font-semibold text-sam-fg">{ko ? "관련 링크" : "Related links"}</h2>
          <ul className="mt-2 space-y-2 sam-text-body-secondary text-sam-fg">
            <li>
              <Link className="text-signature underline" href="/admin/chats/trade">
                {ko ? "거래 채팅" : "Trade chats"}
              </Link>
            </li>
            <li>
              <Link className="text-signature underline" href="/admin/chats/messenger">
                {ko ? "커뮤니티 메신저 운영" : "Community messenger ops"}
              </Link>
            </li>
            <li>
              <Link className="text-signature underline" href="/admin/chats">
                {ko ? "채팅 전체 목록" : "All chats"}
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
