"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";

export function ProfileEditHeader({
  backHref,
  formId,
}: {
  backHref: string;
  formId: string;
}) {
  const { t } = useI18n();
  const rightSlot = useMemo(
    () => (
      <button
        type="submit"
        form={formId}
        className="inline-flex min-h-9 items-center justify-center rounded-[10px] bg-[color:#1C8DB8] px-3 text-[13px] font-semibold text-white"
      >
        {t("common_save")}
      </button>
    ),
    [formId, t]
  );

  return (
    <MySubpageHeader
      title={t("profile_edit_title")}
      subtitle={t("profile_edit_subtitle")}
      backHref={backHref}
      hideCtaStrip
      rightSlot={rightSlot}
      showHubQuickActions={false}
    />
  );
}
