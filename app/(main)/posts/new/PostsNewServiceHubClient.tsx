"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AppBackButton } from "@/components/navigation/AppBackButton";

export function PostsNewServiceHubClient() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-sam-border-soft bg-sam-surface px-4 py-3">
        <AppBackButton />
        <h1 className="sam-text-body-lg font-semibold text-sam-fg">{t("ui_finish_posts_new_title")}</h1>
        <span className="w-11 shrink-0" />
      </header>
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
