"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { formatMoneyPhp } from "@/lib/utils/format";
import {
  itemTypeShortLabel,
  type MenuSection,
  type StoreDetailProductCard,
} from "@/lib/stores/group-store-products-by-menu";
import { approximateDiscountPercent } from "@/lib/stores/store-product-pricing";
import { STORE_DETAIL_GUTTER } from "@/lib/stores/store-detail-ui";
const SECTION_HEAD = "mb-3 text-[15px] font-bold text-gray-900";

/** 피드형 메뉴 카드 — 좌 썸네일 · 우 텍스트 · 우하단 + */
const CARD_WRAP =
  "flex w-full gap-3 rounded-2xl border border-stone-200 bg-white p-3 text-left shadow-sm transition-shadow active:shadow-md";

export function StorePublicMenuList({
  storeSlug,
  sections,
  canSell,
  menuSelectBlocked,
  menuSelectHint,
  sectionDomId,
  sectionScrollMarginClass = "scroll-mt-[132px]",
  sectionScrollMarginTopPx,
  onOpenProduct,
  onQuickAddProduct,
}: {
  storeSlug: string;
  sections: MenuSection[];
  canSell: boolean;
  menuSelectBlocked?: boolean;
  menuSelectHint?: string;
  sectionDomId?: (sectionIndex: number) => string;
  sectionScrollMarginClass?: string;
  sectionScrollMarginTopPx?: number;
  onOpenProduct?: (productId: string) => void;
  /** 옵션 없는 메뉴: true면 시트 없이 즉시 담기 */
  onQuickAddProduct?: (product: StoreDetailProductCard) => boolean;
}) {
  if (!canSell) {
    return (
      <div className={`${STORE_DETAIL_GUTTER} mt-4`}>
        <p className="rounded-2xl border border-stone-300 bg-white px-3 py-4 text-center text-[13px] font-normal leading-relaxed text-gray-500 shadow-sm">
          이 매장은 상품 판매 승인 전이거나 판매가 일시 중지된 상태입니다.
        </p>
      </div>
    );
  }

  const flatCount = sections.reduce((n, s) => n + s.items.length, 0);
  if (flatCount === 0) {
    return (
      <div className={`${STORE_DETAIL_GUTTER} mt-4`}>
        <p className="rounded-2xl border border-stone-300 bg-white px-3 py-4 text-center text-[13px] font-normal leading-relaxed text-gray-500 shadow-sm">
          {sections.length === 0 ? "검색 결과가 없습니다." : "등록된 상품이 없습니다."}
        </p>
      </div>
    );
  }

  return (
    <div className={`${STORE_DETAIL_GUTTER} mt-3 space-y-6 pb-4`}>
      {menuSelectBlocked ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] font-medium leading-snug text-amber-950 shadow-sm">
          {menuSelectHint?.trim() ||
            "지금은 메뉴를 선택할 수 없습니다. 목록은 볼 수 있습니다."}
        </p>
      ) : null}
      {sections.map((section, sectionIndex) => (
        <section
          key={`${section.heading}-${sectionIndex}`}
          id={sectionDomId ? sectionDomId(sectionIndex) : undefined}
          className={
            sectionDomId && sectionScrollMarginTopPx == null ? sectionScrollMarginClass : undefined
          }
          style={
            sectionDomId && sectionScrollMarginTopPx != null
              ? { scrollMarginTop: sectionScrollMarginTopPx }
              : undefined
          }
        >
          <h3 className={SECTION_HEAD}>{section.heading}</h3>
          <ul className="space-y-3">
            {section.items.map((p) => {
              const hasDiscount =
                p.discount_price != null &&
                Number.isFinite(p.discount_price) &&
                p.discount_price < p.price &&
                p.price > 0;
              const salePrice = hasDiscount ? p.discount_price! : p.price;
              const badgePct = hasDiscount
                ? p.discount_percent && p.discount_percent > 0
                  ? p.discount_percent
                  : approximateDiscountPercent(p.price, p.discount_price!)
                : 0;
              const soldOut = p.track_inventory && p.stock_qty <= 0;
              const typeLabel = itemTypeShortLabel(p.item_type);
              const openSheet = () => onOpenProduct?.(p.id);
              const onAddPress = (e: MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                if (onQuickAddProduct?.(p)) return;
                openSheet();
              };
              const thumb = (
                <div className="relative h-[5.25rem] w-[5.25rem] shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-gray-100 to-gray-200">
                  {hasDiscount && badgePct > 0 ? (
                    <span className="absolute left-1 top-1 z-10 rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow">
                      {badgePct}%
                    </span>
                  ) : null}
                  {p.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumbnail_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-2xl text-gray-400">
                      🍽️
                    </div>
                  )}
                  {soldOut ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/55">
                      <span className="rounded-md bg-white/95 px-2 py-1 text-[11px] font-bold text-gray-900">
                        품절
                      </span>
                    </div>
                  ) : null}
                </div>
              );
              const textBlock = (
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[15px] font-bold leading-snug text-gray-900">{p.title}</span>
                    {p.is_featured ? (
                      <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                        인기
                      </span>
                    ) : null}
                    {typeLabel && typeLabel !== "상품" ? (
                      <span className="rounded-md bg-signature/10 px-1.5 py-0.5 text-[10px] font-semibold text-signature">
                        {typeLabel}
                      </span>
                    ) : null}
                    {p.has_options ? (
                      <span className="rounded-md border border-stone-200 bg-stone-50 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600">
                        옵션
                      </span>
                    ) : null}
                  </div>
                  {p.summary ? (
                    <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-gray-500">{p.summary}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-baseline gap-2">
                    <span className="text-[16px] font-bold text-gray-900">{formatMoneyPhp(salePrice)}</span>
                    {hasDiscount ? (
                      <span className="text-xs font-normal text-gray-400 line-through">
                        {formatMoneyPhp(p.price)}
                      </span>
                    ) : null}
                    <span className="text-[11px] text-gray-400">부터</span>
                  </div>
                </div>
              );
              const addBtn = !menuSelectBlocked && onOpenProduct && !soldOut && (
                <button
                  type="button"
                  onClick={onAddPress}
                  className="flex h-10 w-10 shrink-0 items-center justify-center self-end rounded-full border-2 border-signature bg-white text-xl font-bold leading-none text-signature shadow-sm active:bg-signature/10"
                  aria-label={`${p.title} 담기`}
                >
                  +
                </button>
              );
              return (
                <li key={p.id}>
                  {menuSelectBlocked ? (
                    <div className={`${CARD_WRAP} cursor-not-allowed opacity-60`} role="group" aria-disabled>
                      {thumb}
                      <div className="flex min-w-0 flex-1 gap-2">
                        {textBlock}
                      </div>
                    </div>
                  ) : onOpenProduct ? (
                    <div className={`${CARD_WRAP} items-stretch`}>
                      <button type="button" onClick={openSheet} className="flex min-w-0 flex-1 gap-3 text-left">
                        {thumb}
                        {textBlock}
                      </button>
                      {addBtn}
                    </div>
                  ) : (
                    <Link href={`/stores/${encodeURIComponent(storeSlug)}/p/${encodeURIComponent(p.id)}`} className={CARD_WRAP}>
                      {thumb}
                      <div className="flex min-w-0 flex-1 items-stretch gap-2">
                        {textBlock}
                      </div>
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
