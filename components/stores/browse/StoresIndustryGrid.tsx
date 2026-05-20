"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { listBrowsePrimaryIndustries, listBrowseSubIndustries } from "@/lib/stores/browse-mock/queries";
import { useBrowseIndustryDatasetVersion } from "@/lib/stores/browse-mock/use-browse-industry-dataset-version";
import { storesBrowsePrimaryPath, storesBrowsePath } from "./stores-browse-paths";
import { resolveStorePrimaryIndustryLabel } from "@/lib/i18n/store-browse-label-i18n";
import { I18N_COMPACT_SUB_CARD_LABEL } from "@/lib/ui/i18n-compact-label-classes";

export function StoresIndustryGrid({
  headerTrailing,
}: {
  /** 예: 소유 매장이 있을 때만 노출되는 「매장 관리」— 제목과 같은 행 우측 */
  headerTrailing?: ReactNode;
}) {
  const { t, language } = useI18n();
  const industryVersion = useBrowseIndustryDatasetVersion();
  const primaries = useMemo(
    () => listBrowsePrimaryIndustries(),
    [industryVersion]
  );

  return (
    <section className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 shrink text-sm font-semibold text-sam-fg">{t("store_industry_grid_title")}</h2>
        {headerTrailing ? (
          <div className="shrink-0 pt-0.5">{headerTrailing}</div>
        ) : null}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {primaries.map((p) => {
          const subs = listBrowseSubIndustries(p.slug);
          const firstSub = subs[0]?.slug;
          const href = firstSub ? storesBrowsePath(p.slug, firstSub) : storesBrowsePrimaryPath(p.slug);
          return (
            <li key={p.id}>
              <Link
                href={href}
                className="flex flex-col items-center justify-center gap-1 rounded-ui-rect border border-sam-border-soft bg-sam-surface px-2 py-4 text-center shadow-sm active:bg-sam-surface-muted"
              >
                <span className="text-2xl leading-none" aria-hidden>
                  {p.symbol}
                </span>
                <span className={`${I18N_COMPACT_SUB_CARD_LABEL} font-semibold text-sam-fg`}>
                  {resolveStorePrimaryIndustryLabel(language, p.slug, p.nameKo)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
