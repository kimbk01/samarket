"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function PostsNewServiceHubClient() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-background">
      {/* 헤더 = 전역 1단(`resolve-main-tier1` /posts/new, 폴백 /write) 단독 — 페이지 헤더 중복 제거 */}
      <div className="mx-auto max-w-[480px] space-y-4 px-4 py-6">
        <p className="sam-text-body text-sam-muted">{t("ui_finish_posts_new_body")}</p>
        <Link
          href="/write"
          className="inline-flex w-full items-center justify-center rounded-ui-rect bg-sam-ink py-3 sam-text-body font-medium text-white"
        >
          {t("ui_finish_posts_new_cta")}
        </Link>
      </div>
    </div>
  );
}
