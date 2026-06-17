"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type Props = { label: string; isQuestion?: boolean };

export function CommunityPostCategoryRow({ label, isQuestion }: Props) {
  const { t } = useI18n();
  return (
    <div className="mb-3">
      <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--cm-border)] bg-[var(--cm-page-bg)] px-3 py-1 text-[11px] font-medium text-[var(--cm-text-muted)]">
        <span className="truncate">{label}</span>
        {isQuestion ? <span className="shrink-0 text-amber-800">{t("community_post_category_question")}</span> : null}
      </div>
    </div>
  );
}
