"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DetailHeader } from "@/components/layout/sector-header";

export function PostsNewServiceHubClient() {
  const { t } = useI18n();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background">
      <DetailHeader title={t("ui_finish_posts_new_title")} onBack={() => router.back()} />
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
