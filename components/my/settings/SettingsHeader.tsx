"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { buildMypageInfoHubHref } from "@/lib/my/mypage-info-hub";

interface SettingsHeaderProps {
  title: string;
  backHref?: string;
  /** null이면 부제목·빠른 이동 칩 숨김(로그아웃 등) */
  subtitle?: string | null;
}

export function SettingsHeader({
  title,
  backHref = buildMypageInfoHubHref(),
  subtitle,
}: SettingsHeaderProps) {
  const { t } = useI18n();
  return (
    <MySubpageHeader
      title={title}
      subtitle={subtitle === undefined ? t("settings_global_subtitle") : subtitle ?? undefined}
      backHref={backHref}
      section={subtitle === null ? undefined : "account"}
      hideCtaStrip={subtitle === null}
    />
  );
}
