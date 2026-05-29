"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyHubHeaderActions } from "@/components/my/MyHubHeaderActions";
import { SectionHeader } from "@/components/layout/sector-header";

export function MyPageHeader() {
  const { t } = useI18n();
  return (
    <SectionHeader
      title={t("mypage_comp_header_title")}
      titleAlign="left"
      rightSlot={<MyHubHeaderActions />}
    />
  );
}
