"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function CommunityMessengerHomeDetailEmpty() {
  const { safeT } = useI18n();
  const label = safeT("cm_home_detail_empty", {
    fallbackKo: "목록에서 항목을 선택하세요",
    fallbackEn: "Select an item from the list",
  });
  return (
    <div className="flex flex-1 items-center justify-center bg-sam-app p-8 text-center">
      <p className="sam-text-body text-sam-fg-muted">{label}</p>
    </div>
  );
}
