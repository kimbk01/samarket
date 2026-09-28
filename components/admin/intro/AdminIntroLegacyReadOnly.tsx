"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function AdminIntroLegacyReadOnly({ campaignId }: { campaignId: string }) {
  const { safeT } = useI18n();
  return (
    <div
      className="mx-auto max-w-xl rounded-ui-rect border border-sam-border bg-sam-surface p-6"
      data-intro-legacy-readonly="1"
    >
      <h1 className="sam-text-page-title font-semibold text-sam-fg">
        {safeT("admin_intro_legacy_heading", {
          fallbackKo: "기존 인트로",
          fallbackEn: "Existing intro",
        })}
      </h1>
      <p className="mt-3 sam-text-body text-sam-fg">
        {safeT("admin_intro_legacy_published", {
          fallbackKo: "현재 게시된 기존 형식입니다.",
          fallbackEn: "This is the currently published existing format.",
        })}
      </p>
      <p className="mt-2 sam-text-body text-sam-muted">
        {safeT("admin_intro_legacy_readonly", {
          fallbackKo: "새 편집 형식으로 변환되기 전에는 내용을 변경하지 않습니다.",
          fallbackEn: "Content is not changed until it is converted to the new editing format.",
        })}
      </p>
      <p className="mt-4 sam-text-helper text-sam-muted" data-intro-legacy-id={campaignId}>
        {campaignId}
      </p>
      <Link
        href="/admin/intro"
        className="mt-5 inline-flex min-h-9 items-center rounded-ui-rect border border-sam-border px-3 py-1.5 text-[13px] font-semibold text-sam-fg"
      >
        {safeT("admin_intro_title", { fallbackKo: "인트로 관리", fallbackEn: "Intro campaigns" })}
      </Link>
    </div>
  );
}
