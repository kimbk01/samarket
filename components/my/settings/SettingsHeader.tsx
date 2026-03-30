"use client";

import { MySubpageHeader } from "@/components/my/MySubpageHeader";

interface SettingsHeaderProps {
  title: string;
  backHref?: string;
  /** null이면 부제목·빠른 이동 칩 숨김(로그아웃 등) */
  subtitle?: string | null;
}

export function SettingsHeader({
  title,
  backHref = "/mypage",
  subtitle = "앱·알림·계정",
}: SettingsHeaderProps) {
  return (
    <MySubpageHeader
      title={title}
      subtitle={subtitle ?? undefined}
      backHref={backHref}
      section={subtitle === null ? undefined : "account"}
      hideCtaStrip={subtitle === null}
    />
  );
}
