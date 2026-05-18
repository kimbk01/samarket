"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AccountDeletionRequestForm } from "@/components/account/AccountDeletionRequestForm";

export function AccountDeleteRequestPageClient() {
  const { t } = useI18n();

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-sam-fg">{t("ui_finish_account_delete_title")}</h1>
      <p className="mt-2 sam-text-body-secondary leading-relaxed text-sam-muted">
        {t("ui_finish_account_delete_desc")}
      </p>
      <div className="mt-6">
        <AccountDeletionRequestForm source="web_delete_request" />
      </div>
    </div>
  );
}
