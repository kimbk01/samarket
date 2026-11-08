"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { HomeCategoriesConfig } from "@/lib/home/home-layout-contract";
import { homeCatalogName, type HomeStoreCategory } from "@/lib/home/home-catalog-types";
import { HomeSectionHead } from "@/components/home-hub/HomeSectionHead";

/**
 * 배달 · 매장 업종 줄 — 기본 한 줄 가로 넘김(아래 매장 메뉴가 첫 화면에 빨리 보이게), 어드민에서 두 줄 선택 가능.
 * 업종 그림 = 어드민 「매장 업종 관리」 그림 그대로. 누르면 그 업종 매장 목록(`/stores/browse/업종`) —
 * 비로그인은 배달 화면의 기존 로그인 안내(S-07)가 그대로 나온다.
 */
export function HomeCategoryRow({
  config,
  categories,
  title,
}: {
  config: HomeCategoriesConfig;
  categories: HomeStoreCategory[];
  title: string;
}) {
  const { language } = useI18n();
  const router = useRouter();
  const ordered =
    config.slugs.length > 0
      ? config.slugs
          .map((slug) => categories.find((c) => c.slug === slug))
          .filter((c): c is HomeStoreCategory => Boolean(c))
      : categories;
  if (ordered.length === 0) return null;
  const row = config.layout === "row";
  return (
    <section className="mt-3 bg-white pb-4 pt-[18px]" data-home-categories>
      <HomeSectionHead title={title} />
      <div
        className={
          row
            ? "flex snap-x gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            : "grid grid-cols-4 gap-y-3.5 px-2.5"
        }
      >
        {ordered.map((c) => (
          <button
            key={c.slug}
            type="button"
            onClick={() => router.push(`/stores/browse/${encodeURIComponent(c.slug)}`)}
            className={`flex snap-start flex-col items-center gap-1.5 text-[12.5px] text-[#333] transition-transform active:scale-95 ${
              row ? "w-[72px] shrink-0" : ""
            }`}
          >
            {c.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- 어드민 업종 그림
              <img src={c.imageUrl} alt="" className="rounded-full bg-[#F2F4F2] object-contain p-[7px]" style={{ width: 58, height: 58 }} />
            ) : (
              <span className="h-[58px] w-[58px] rounded-full bg-[#F2F4F2]" />
            )}
            <span className="max-w-full truncate">{homeCatalogName(c, language)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
