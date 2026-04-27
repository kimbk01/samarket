"use client";

import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export type AdminCardProps = {
  children: React.ReactNode;
  className?: string;
  /** 카드 머리말. 기본 `sam-text-body` — 피드 주제 등은 `sam-text-section-title` 로 올릴 수 있음 */
  titleClassName?: string;
} & (
  | { titleKey: MessageKey; title?: never }
  | { title?: string; titleKey?: never }
);

export function AdminCard(props: AdminCardProps) {
  const { children, className = "", titleClassName = "sam-text-body font-medium text-sam-fg" } = props;
  const { tt, t } = useI18n();
  const resolvedTitle =
    "titleKey" in props && props.titleKey !== undefined
      ? t(props.titleKey)
      : props.title !== undefined
        ? tt(props.title)
        : null;

  return (
    <div className={`rounded-ui-rect border border-sam-border bg-sam-surface ${className}`}>
      {resolvedTitle !== null ? (
        <div className="border-b border-sam-border-soft px-4 py-3.5 sm:px-5">
          <h2 className={titleClassName}>{resolvedTitle}</h2>
        </div>
      ) : null}
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}
