"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";

export function MyInfoHeader({
  title,
  backHref = "/philife",
  rightSlot,
}: {
  title?: string;
  backHref?: string;
  rightSlot?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <MySubpageHeader
      title={title ?? t("mypage_comp_myinfo_header_title_default")}
      backHref={backHref}
      preferHistoryBack
      hideCtaStrip
      showHubQuickActions={rightSlot == null}
      rightSlot={rightSlot}
    />
  );
}

