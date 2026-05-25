"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function OwnerOrderChatsPageFallback() {
  const { t } = useI18n();
  return (
    <div className="flex h-full min-h-[12rem] items-center justify-center bg-[var(--biz-app-bg)] text-sm text-[var(--biz-text-muted)]">
      {t("store_owner_chats_loading")}
    </div>
  );
}
