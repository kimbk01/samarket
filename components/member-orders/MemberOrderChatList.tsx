"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ORDER_CHAT_MESSENGER_LIST_HREF, ORDER_MANAGEMENT_HUB_PATH } from "@/lib/chats/surfaces/order-chat-surface";

/** 마이페이지 주문 채팅 — 채팅방 리스트 SSOT + 주문 관리 링크 분리 */
export function MemberOrderChatList() {
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface px-4 py-4 shadow-sm ring-1 ring-sam-border-soft">
        <p className="text-sm text-sam-muted">{t("member_order_chat_messenger_integrated")}</p>
        <Link
          href={ORDER_CHAT_MESSENGER_LIST_HREF}
          className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-ui-rect bg-signature px-4 text-sm font-semibold text-white"
        >
          {t("member_order_chat_open_delivery_inbox")}
        </Link>
      </div>
      <div className="rounded-ui-rect bg-sam-surface px-4 py-3 text-sm text-sam-muted ring-1 ring-sam-border-soft">
        {t("member_order_chat_hub_prefix")}{" "}
        <Link href={ORDER_MANAGEMENT_HUB_PATH} className="font-medium text-signature underline">
          {t("member_order_chat_list_link")}
        </Link>
        {t("member_order_chat_hub_suffix")}
      </div>
    </div>
  );
}
