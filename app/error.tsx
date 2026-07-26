"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { tryDismissNativeSplash } from "@/lib/app-boot/dibay-boot-metrics";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RootError({ error, reset }: ErrorProps) {
  const { t } = useI18n();

  useEffect(() => {
    console.error("[RootError]", error);
    // Error UI must not sit under cold-boot intro; dismiss once (idempotent).
    tryDismissNativeSplash("error_boundary");
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-sam-app px-4 antialiased">
      <div className="flex flex-col items-center justify-center text-center">
        <p className="sam-text-body font-medium text-sam-fg">{t("app_error_root_title")}</p>
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
    </div>
  );
}
