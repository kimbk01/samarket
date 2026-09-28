"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function IntroV3OpenNotice({ campaignId }: { campaignId: string }) {
  const { safeT } = useI18n();
  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <p className="sam-text-body text-sam-fg">
        {safeT("admin_intro_v3_legacy_guard", {
          fallbackKo: "이 초안은 V3 경로에서 열어야 합니다.",
          fallbackEn: "Open this draft on the V3 route.",
        })}
      </p>
      <Link
        href={`/admin/intro-v3/${encodeURIComponent(campaignId)}`}
        className="mt-3 inline-flex min-h-9 items-center rounded-ui-rect bg-[var(--admin-action-primary-bg,#111827)] px-3 py-1.5 text-[13px] font-semibold text-white"
      >
        {safeT("admin_intro_v3_open_v3", { fallbackKo: "V3에서 열기", fallbackEn: "Open in V3" })}
      </Link>
    </div>
  );
}
