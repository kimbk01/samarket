"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export default function CommunityMessengerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    console.error("[community-messenger]", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 py-8 text-center">
      <p className="text-base font-medium text-sam-text-primary">{t("app_error_messenger_title")}</p>
      <p className="max-w-sm text-sm text-sam-text-secondary">{t("app_error_messenger_subtitle")}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          className="rounded-ui-rect bg-sam-primary px-4 py-2 text-sm font-medium text-sam-text-on-primary"
          onClick={() => reset()}
        >
          {t("common_retry")}
        </button>
        <Link
          href="/philife"
          className="rounded-ui-rect border border-sam-border-default px-4 py-2 text-sm text-sam-text-primary"
        >
          {t("app_error_go_home_short")}
        </Link>
      </div>
    </div>
  );
}
