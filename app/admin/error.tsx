"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AdminError({ error, reset }: ErrorProps) {
  const { t } = useI18n();
  useEffect(() => {
    console.error("[AdminError]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="sam-text-body font-medium text-sam-fg">
        {t("admin_error_title")}
      </p>
      <p className="mt-2 sam-text-body-secondary text-sam-muted">
        {t("admin_error_hint")}
      </p>
      <div className="mt-8 flex flex-col gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body font-medium text-white"
        >
          {t("admin_error_retry")}
        </button>
        <Link href="/admin" className="sam-text-body font-medium text-signature">
          {t("admin_error_home")}
        </Link>
      </div>
    </div>
  );
}
