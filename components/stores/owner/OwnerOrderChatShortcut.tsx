"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function OwnerOrderChatShortcut() {
  const { t } = useI18n();
  return (
    <Link
      href="/stores/owner/inquiries"
      className="flex shrink-0 items-center gap-1 rounded-full bg-signature/5 px-2.5 py-1 sam-text-xxs font-bold text-sam-fg ring-1 ring-sam-border"
    >
      {t("store_owner_inquiry_shortcut")}
    </Link>
  );
}
