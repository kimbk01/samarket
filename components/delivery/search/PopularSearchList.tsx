"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function PopularSearchList({
  keywords,
  onPick,
  limit = 5,
}: {
  keywords: string[];
  onPick: (keyword: string) => void;
  limit?: number;
}) {
  const { t } = useI18n();
  const visibleKeywords = keywords.slice(0, Math.max(0, limit));
  if (!visibleKeywords || visibleKeywords.length === 0) {
    return (
      <section>
        <h2 className="sam-text-body-secondary font-semibold text-sam-fg">{t("ui_delivery_search_popular_heading")}</h2>
        <p className="mt-2 sam-text-body text-sam-muted">{t("ui_delivery_search_popular_empty")}</p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="sam-text-body-secondary font-semibold text-sam-fg">{t("ui_delivery_search_popular_heading")}</h2>
      <ol className="mt-2 space-y-1.5">
        {visibleKeywords.map((k, idx) => (
          <li key={`${k}:${idx}`}>
            <button
              type="button"
              onClick={() => onPick(k)}
              className="flex w-full items-center justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-left hover:bg-sam-surface-muted"
            >
              <span className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-center sam-text-helper font-bold text-sam-muted">{idx + 1}</span>
                <span className="sam-text-body-secondary font-semibold text-sam-fg">{k}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

