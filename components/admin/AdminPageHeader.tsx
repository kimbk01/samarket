"use client";

import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AppBackButton } from "@/components/navigation/AppBackButton";

type AdminPageHeaderBase = {
  backHref?: string;
  /** h1. 기본값은 `sam-text-page-title`(약 20px) */
  titleClassName?: string;
  /** 설명 문단. 기본값 `sam-text-body` */
  descriptionClassName?: string;
};

export type AdminPageHeaderProps = AdminPageHeaderBase &
  (
    | {
        titleKey: MessageKey;
        descriptionKey?: MessageKey;
        /** `tr`/`t` 결과 등 — `tt`로 보조 번역(레거시 한글 소스) */
        description?: string;
        title?: never;
      }
    | {
        title: string;
        description?: string;
        titleKey?: never;
        descriptionKey?: never;
      }
  );

export function AdminPageHeader(props: AdminPageHeaderProps) {
  const { tt, t } = useI18n();
  const {
    backHref,
    titleClassName = "sam-text-page-title font-semibold text-sam-fg",
    descriptionClassName = "mt-1 font-normal text-sam-muted sam-text-body",
  } = props;

  const resolvedTitle =
    "titleKey" in props && props.titleKey !== undefined ? t(props.titleKey) : tt(props.title);

  const resolvedDescription = (() => {
    if ("descriptionKey" in props && props.descriptionKey !== undefined) {
      return t(props.descriptionKey);
    }
    if ("description" in props && props.description !== undefined) {
      return tt(props.description);
    }
    return undefined;
  })();

  return (
    <div className="mb-4 flex flex-wrap items-start gap-3" data-admin-page-header="1">
      {backHref ? <AppBackButton backHref={backHref} ariaLabel={t("admin_back_to_list")} /> : null}
      <div className="min-w-0 flex-1">
        <h1 className={titleClassName}>{resolvedTitle}</h1>
        {resolvedDescription !== undefined ? (
          <p className={descriptionClassName}>{resolvedDescription}</p>
        ) : null}
      </div>
    </div>
  );
}
