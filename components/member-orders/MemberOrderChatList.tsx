"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

const BASE = "/my/store-orders";

export function MemberOrderChatList() {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface px-4 py-3 text-sm text-sam-muted shadow-sm ring-1 ring-sam-border-soft">
        {t("member_order_chat_hub_prefix")}{" "}
        <Link href={BASE} className="font-medium text-signature underline">
          {t("member_order_chat_hub_link")}
        </Link>
        {t("member_order_chat_hub_suffix")}
      </div>
      <div className="rounded-ui-rect bg-sam-surface p-6 text-sm text-sam-muted ring-1 ring-sam-border-soft">
        <p>{t("member_order_chat_messenger_integrated")}</p>
        <Link
          href="/community-messenger/delivery-chats"
          className="mt-3 inline-block font-medium text-signature underline"
        >
          {t("member_order_chat_open_delivery_inbox")}
        </Link>
      </div>
    </div>
  );
}