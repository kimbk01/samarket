"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function TermsPageClient() {
  const { t } = useI18n();

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-sam-fg">{t("ui_finish_terms_title")}</h1>
      <div className="mt-4 space-y-3 sam-text-body leading-relaxed text-sam-fg">
        <p>{t("ui_finish_terms_p1")}</p>
        <p>{t("ui_finish_terms_p2")}</p>
        <p>{t("ui_finish_terms_p3")}</p>
        <p>{t("ui_finish_terms_p4")}</p>
      </div>
    </div>
  );
}
