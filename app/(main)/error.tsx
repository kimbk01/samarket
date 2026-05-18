"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AppError({ error, reset }: ErrorProps) {
  const { t } = useI18n();

  useEffect(() => {
    console.error("[AppError]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="sam-text-body font-medium text-sam-fg">{t("app_error_title")}</p>
      <p className="mt-2 sam-text-body-secondary text-sam-muted">{t("app_error_subtitle")}</p>
      <div className="mt-8 flex flex-col gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body font-medium text-white"
        >
          {t("common_retry")}
        </button>
        <Link href="/philife" className="sam-text-body font-medium text-signature">
          {t("app_error_go_home")}
        </Link>
      </div>
    </div>
  );
}
