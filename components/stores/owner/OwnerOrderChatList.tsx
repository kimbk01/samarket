"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function OwnerOrderChatList({ slug, storeId }: { slug: string; storeId: string }) {
  const { t } = useI18n();
  return (
    <div className="rounded-ui-rect bg-sam-surface p-6 text-sm text-sam-muted">
      <p>{t("business_phase7_085", { v1: slug || storeId })}</p>
      <Link href="/community-messenger/delivery-chats" className="mt-3 inline-block font-medium text-signature underline">
        {t("store_owner_chats_open_delivery")}
      </Link>
    </div>
  );
}
