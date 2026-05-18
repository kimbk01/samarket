"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

interface CategoryEmptyStateProps {
  /** 빈 상태 메시지 */
  message?: string;
  /** 부가 설명 */
  subMessage?: string;
}

export function CategoryEmptyState({ message, subMessage }: CategoryEmptyStateProps) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <p className="sam-text-body font-medium text-sam-fg">{message ?? t("ui_category_empty_message")}</p>
      <p className="mt-1 sam-text-body-secondary text-sam-muted">{subMessage ?? t("ui_category_empty_sub")}</p>
    </div>
  );
}
