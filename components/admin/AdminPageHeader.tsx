"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AppBackButton } from "@/components/navigation/AppBackButton";

interface AdminPageHeaderProps {
  title: string;
  backHref?: string;
  description?: string;
}

export function AdminPageHeader({ title, backHref, description }: AdminPageHeaderProps) {
  const { tt, t } = useI18n();
  return (
    <div className="mb-4 flex flex-wrap items-start gap-3">
      {backHref ? <AppBackButton backHref={backHref} ariaLabel={t("admin_back_to_list")} /> : null}
      <div className="min-w-0">
        <h1 className="text-[18px] font-semibold text-gray-900">{tt(title)}</h1>
        {description ? <p className="mt-1 text-[14px] text-gray-500">{tt(description)}</p> : null}
      </div>
    </div>
  );
}
