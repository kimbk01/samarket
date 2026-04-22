"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function AdminCard({
  title,
  children,
  className = "",
  /** 카드 머리말. 기본 `sam-text-body` — 피드 주제 등은 `sam-text-section-title` 로 올릴 수 있음 */
  titleClassName = "sam-text-body font-medium text-sam-fg",
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
  titleClassName?: string;
}) {
  const { tt } = useI18n();
  return (
    <div className={`rounded-ui-rect border border-sam-border bg-sam-surface ${className}`}>
      {title && (
        <div className="border-b border-sam-border-soft px-4 py-3.5 sm:px-5">
          <h2 className={titleClassName}>{tt(title)}</h2>
        </div>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}
