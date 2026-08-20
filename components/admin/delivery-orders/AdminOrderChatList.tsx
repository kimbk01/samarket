"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

/**
 * CUT 3 — Delivery order-chat Admin surface is an explicit STUB (not a live OPS list).
 * Do not treat empty inbox copy as PASS. Identity = community_messenger store_order rooms.
 */
export function AdminOrderChatList() {
  const { t, safeT } = useI18n();
  return (
    <div
      className="rounded-ui-rect border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
      data-admin-surface="stub"
      data-admin-domain="delivery"
      data-admin-entity="store_order_chat"
    >
      <p className="font-semibold">
        {safeT("admin_do_chat_stub_badge", {
          fallbackKo: "STUB · Admin 주문채팅 목록 미연결",
          fallbackEn: "STUB · Admin order-chat list not wired",
        })}
      </p>
      <p className="mt-2 text-amber-900/90">{t("admin_do_chat_list_merged")}</p>
      <p className="mt-2 sam-text-helper text-amber-900/80">
        {safeT("admin_do_chat_stub_hint", {
          fallbackKo:
            "운영 identity는 Messenger store_order 방입니다. 이 화면은 링크 허브만 제공합니다 — 목록 PASS로 보지 마세요.",
          fallbackEn:
            "Ops identity is Messenger store_order rooms. This page is a link hub only — do not mark the list as PASS.",
        })}
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <Link href="/community-messenger/delivery-chats" className="font-medium text-signature underline">
          {t("admin_do_chat_open_inbox")}
        </Link>
        <Link href="/admin/store-orders" className="font-medium text-sam-fg underline">
          {t("admin_do_chat_store_orders")}
        </Link>
      </div>
    </div>
  );
}
