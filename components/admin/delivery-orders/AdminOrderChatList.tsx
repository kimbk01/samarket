"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function AdminOrderChatList() {
  const { t } = useI18n();
  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-sm text-sam-muted">
      <p>{t("admin_do_chat_list_merged")}</p>
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
