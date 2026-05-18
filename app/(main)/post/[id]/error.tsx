"use client";

import { useEffect } from "react";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export default function PostDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    console.error("[post/[id]]", error);
  }, [error]);

  const isTimeout = error.message.includes("trade_detail_load_timeout");

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="sam-text-body-lg font-semibold text-sam-fg">
        {isTimeout ? t("post_error_timeout_title") : t("post_error_load_failed_title")}
      </p>
      <p className="max-w-sm sam-text-body-secondary text-sam-muted">
        {isTimeout ? t("post_error_network_check") : t("common_try_again_later")}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body font-medium text-white"
        >
          {t("common_retry")}
        </button>
        <AppBackButton className="rounded-ui-rect border border-sam-border px-4 py-2 sam-text-body text-sam-fg" />
      </div>
    </div>
  );
}
