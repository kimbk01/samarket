"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AppBackButton } from "@/components/navigation/AppBackButton";

interface AdminPageHeaderProps {
  title: string;
  backHref?: string;
  description?: string;
  /** h1. 기본값은 `sam-text-page-title`(약 20px) */
  titleClassName?: string;
  /** 설명 문단. 기본값 `sam-text-body` */
  descriptionClassName?: string;
}

export function AdminPageHeader({
  title,
  backHref,
  description,
  titleClassName = "sam-text-page-title font-semibold text-sam-fg",
  descriptionClassName = "mt-1 font-normal text-sam-muted sam-text-body",
}: AdminPageHeaderProps) {
  const { tt, t } = useI18n();
  return (
    <div className="mb-4 flex flex-wrap items-start gap-3">
      {backHref ? <AppBackButton backHref={backHref} ariaLabel={t("admin_back_to_list")} /> : null}
      <div className="min-w-0">
        <h1 className={titleClassName}>{tt(title)}</h1>
        {description ? <p className={descriptionClassName}>{tt(description)}</p> : null}
      </div>
    </div>
  );
}
