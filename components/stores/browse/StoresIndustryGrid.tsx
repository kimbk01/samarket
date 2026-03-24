"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { listBrowsePrimaryIndustries, listBrowseSubIndustries } from "@/lib/stores/browse-mock/queries";
import { useBrowseIndustryDatasetVersion } from "@/lib/stores/browse-mock/use-browse-industry-dataset-version";
import { storesBrowsePrimaryPath, storesBrowsePath } from "./stores-browse-paths";

export function StoresIndustryGrid({
  headerTrailing,
}: {
  /** 예: 소유 매장이 있을 때만 노출되는 「매장 관리」— 제목과 같은 행 우측 */
  headerTrailing?: ReactNode;
}) {
  const industryVersion = useBrowseIndustryDatasetVersion();
  const primaries = useMemo(
    () => listBrowsePrimaryIndustries(),
    [industryVersion]
  );

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 shrink text-sm font-semibold text-gray-900">업종별 둘러보기</h2>
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
                className="flex flex-col items-center justify-center gap-1 rounded-xl border border-gray-100 bg-[#F7F7F7] px-2 py-4 text-center shadow-sm active:bg-gray-100"
              >
                <span className="text-2xl leading-none" aria-hidden>
                  {p.symbol}
                </span>
                <span className="text-[13px] font-semibold text-gray-900">{p.nameKo}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
