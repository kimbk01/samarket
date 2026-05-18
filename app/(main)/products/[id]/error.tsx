"use client";

import { useEffect } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ProductDetailError({ error, reset }: ErrorProps) {
  const { t } = useI18n();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <p className="sam-text-body font-medium text-sam-fg">{t("app_error_title")}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 sam-text-body font-medium text-signature"
      >
        {t("common_retry")}
      </button>
    </div>
  );
}
