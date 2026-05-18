"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyHubHeaderInfoHubTrigger } from "@/components/my/MyHubHeaderActions";

export function MyPageHeader() {
  const { t } = useI18n();
  return (
    <header className="sticky top-0 z-10 flex min-h-[length:var(--sam-header-row-height)] items-center justify-between border-b border-sam-border bg-sam-surface/95 px-4 py-3 backdrop-blur-[10px]">
      <h1 className="sam-text-section-title font-semibold text-sam-fg">{t("mypage_comp_header_title")}</h1>
      <MyHubHeaderInfoHubTrigger />
    </header>
  );
}
