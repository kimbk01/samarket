"use client";

import Image from "next/image";
import type { MouseEvent } from "react";
import Link from "next/link";
import { memo, useCallback } from "react";
import { formatMoneyPhp } from "@/lib/utils/format";
import {
  itemTypeShortLabel,
  type MenuSection,
  type StoreDetailProductCard,
} from "@/lib/stores/group-store-products-by-menu";
import { approximateDiscountPercent } from "@/lib/stores/store-product-pricing";

const PLUS_BTN =
  "absolute -bottom-1.5 -right-1.5 flex h-[31px] w-[31px] shrink-0 touch-manipulation select-none items-center justify-center rounded-full bg-[#1C8DB8] text-[21px] font-normal leading-none text-white shadow-[0_2px_8px_rgba(28,141,184,0.35)] ring-1 ring-[#1C8DB8]/40 transition-all duration-150 hover:bg-[#197DA3] active:scale-[0.92] active:bg-[#166F92]";

type RowProps = {
  storeSlug: string;
  p: StoreDetailProductCard;
  canInteract: boolean;
  menuSelectBlocked?: boolean;
  onOpenProduct?: (productId: string) => void;
  onQuickAddProduct?: (product: StoreDetailProductCard) => boolean;
};

const StorePublicMenuRow = memo(function StorePublicMenuRow({
  storeSlug,
  p,
  canInteract,
  menuSelectBlocked,
  onOpenProduct,
  onQuickAddProduct,
}: RowProps) {
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
  const statusSoldOut = p.product_status === "sold_out";
  const stockSoldOut = p.track_inventory && p.stock_qty <= 0;
  const soldOut = statusSoldOut || stockSoldOut;
  const typeLabel = itemTypeShortLabel(p.item_type);
  const thumbSrc = p.thumbnail_url?.trim() || "";

  const openSheet = useCallback(() => {
    onOpenProduct?.(p.id);
  }, [onOpenProduct, p.id]);

  const onAddPress = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (onQuickAddProduct?.(p)) return;
      openSheet();
    },
    [onQuickAddProduct, openSheet, p]
  );

  const dimmed = soldOut || menuSelectBlocked;

  const badges = (
    <div className="flex flex-wrap gap-1">
      {p.is_owner_recommended ? (
        <span className="inline-flex h-[18px] items-center rounded-[3px] bg-[#E6F4F9] px-1.5 text-[10px] font-bold text-[#1C8DB8] ring-1 ring-[#1C8DB8]/15">
          사장님 추천
        </span>
      ) : null}
      {p.is_representative ? (
        <span className="inline-flex h-[18px] items-center rounded-[3px] bg-[#FFF4E5] px-1.5 text-[10px] font-bold text-[#B45309] ring-1 ring-amber-200/80">
          대표메뉴
        </span>
      ) : null}
      {typeLabel && typeLabel !== "상품" ? (
        <span className="inline-flex h-[18px] items-center rounded-[3px] bg-[#EEF8FC] px-1.5 text-[10px] font-bold text-[#1C8DB8] ring-1 ring-[#1C8DB8]/12">
          {typeLabel}
        </span>
      ) : null}
      {p.has_options ? (
        <span className="inline-flex h-[18px] items-center rounded-[3px] border border-neutral-200 bg-white px-1.5 text-[10px] font-bold text-neutral-600">
          옵션
        </span>
      ) : null}
      {soldOut ? (
        <span className="inline-flex h-[18px] items-center rounded-[3px] bg-red-50 px-1.5 text-[10px] font-bold text-red-700">
          품절
        </span>
      ) : null}
    </div>
  );

  const thumb = (
    <div className="relative h-[88px] w-[88px] shrink-0 overflow-visible">
      <div className="relative h-full w-full overflow-hidden rounded-[10px] bg-neutral-100">
      {hasDiscount && badgePct > 0 ? (
        <span className="absolute left-1 top-1 z-10 rounded-[3px] bg-red-600 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white shadow">
          {badgePct}%
        </span>
      ) : null}
      {thumbSrc ? (
        <Image src={thumbSrc} alt="" fill sizes="88px" className="object-cover" />
      ) : (
        <div className="h-full w-full bg-neutral-100" />
      )}
      {soldOut ? <div className="absolute inset-0 bg-white/45" aria-hidden /> : null}
      </div>
      {!menuSelectBlocked && onOpenProduct && !soldOut ? (
        <button type="button" onClick={onAddPress} className={PLUS_BTN} aria-label={`${p.title} 담기`}>
          +
        </button>
      ) : null}
    </div>
  );

  const textBlock = (
    <div className="min-h-[5rem] min-w-0 flex-1 pr-1">
      <div>{badges}</div>
      <p className="mt-1 line-clamp-2 text-[15px] font-extrabold leading-snug tracking-[-0.015em] text-neutral-900">{p.title}</p>
      {p.summary ? (
        <p className="mt-0.5 line-clamp-2 text-[12px] font-medium leading-snug text-[#777777]">{p.summary}</p>
      ) : null}
      <div className="mt-1.5 flex flex-wrap items-baseline gap-1.5">
        <span className="text-[15px] font-extrabold tabular-nums text-neutral-900">{formatMoneyPhp(salePrice)}</span>
        {hasDiscount ? (
          <span className="text-xs font-normal text-neutral-400 line-through">{formatMoneyPhp(p.price)}</span>
        ) : null}
      </div>
    </div>
  );

  const rowWrapClass = `border-b border-[#F1F1F1] py-[13px] ${dimmed ? "opacity-45" : ""}`;

  if (!canInteract) {
    return (
      <div
        className={`${rowWrapClass} flex min-h-[102px] cursor-not-allowed items-start gap-3`}
        role="group"
        aria-disabled
      >
        {thumb}
        {textBlock}
      </div>
    );
  }

  if (onOpenProduct) {
    return (
      <div className={`${rowWrapClass} flex min-h-[102px] items-start gap-3`}>
        <button type="button" onClick={openSheet} className="flex min-w-0 flex-1 text-left">
          {textBlock}
        </button>
        {thumb}
      </div>
    );
  }

  if (soldOut) {
    return (
      <div className={`${rowWrapClass} flex min-h-[102px] cursor-not-allowed items-start gap-3`} aria-disabled>
        {textBlock}
        {thumb}
      </div>
    );
  }

  return (
    <Link
      href={`/stores/${encodeURIComponent(storeSlug)}/p/${encodeURIComponent(p.id)}`}
      className={`${rowWrapClass} flex min-h-[102px] items-start gap-3`}
    >
      {textBlock}
      {thumb}
    </Link>
  );
});

export function StorePublicMenuList({
  storeSlug,
  sections,
  canSell,
  menuSelectBlocked,
  menuSelectHint,
  sectionDomId,
  sectionScrollMarginClass = "scroll-mt-[132px]",
  sectionScrollMarginTopPx,
  /** 예: calc(env(safe-area)+sticky헤더+블록) */
  sectionScrollMarginCss,
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
  sectionScrollMarginCss?: string;
  onOpenProduct?: (productId: string) => void;
  onQuickAddProduct?: (product: StoreDetailProductCard) => boolean;
}) {
  if (!canSell) {
    return (
      <div className="mt-4 px-4">
        <p className="rounded-[14px] border border-neutral-200 bg-white px-4 py-8 text-center text-[14px] leading-relaxed text-neutral-500 shadow-sm">
          이 매장은 상품 판매 승인 전이거나 판매가 일시 중지된 상태입니다.
        </p>
      </div>
    );
  }

  const flatCount = sections.reduce((n, s) => n + s.items.length, 0);
  if (flatCount === 0) {
    return (
      <div className="mt-4 px-4">
        <p className="rounded-[14px] border border-neutral-200 bg-white px-4 py-8 text-center text-[14px] leading-relaxed text-neutral-500 shadow-sm">
          {sections.length === 0 ? "검색 결과가 없습니다." : "등록된 상품이 없습니다."}
        </p>
      </div>
    );
  }

  const canInteract = !menuSelectBlocked;

  return (
    <div className="space-y-0 bg-white px-4 pb-4">
      {menuSelectBlocked ? (
        <p className="rounded-[14px] border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] font-medium leading-snug text-amber-950">
          {menuSelectHint?.trim() || "지금은 메뉴를 선택할 수 없습니다. 목록은 볼 수 있습니다."}
        </p>
      ) : null}
      {sections.map((section, sectionIndex) => (
        <section
          key={`${section.heading}-${sectionIndex}`}
          id={sectionDomId ? sectionDomId(sectionIndex) : undefined}
          className={
            sectionDomId &&
            !sectionScrollMarginCss &&
            sectionScrollMarginTopPx == null
              ? sectionScrollMarginClass
              : undefined
          }
          style={
            sectionDomId && sectionScrollMarginCss
              ? { scrollMarginTop: sectionScrollMarginCss }
              : sectionDomId && sectionScrollMarginTopPx != null
                ? { scrollMarginTop: sectionScrollMarginTopPx }
                : undefined
          }
        >
          <div className={sectionIndex === 0 ? "pt-3.5" : "pt-4.5"}>
            <h3 className="text-[16px] font-extrabold tracking-[-0.02em] text-neutral-900">
              {section.listHeading ?? section.heading}
            </h3>
            {section.listHeading && section.heading === "인기" ? (
              <p className="mt-0.5 text-[12px] font-medium text-neutral-500">
                한 달간 주문수가 많고 만족도가 높은 메뉴예요.
              </p>
            ) : null}
          </div>
          <ul className="mt-0.5 divide-y-0">
            {section.items.map((p) => (
              <li key={p.id}>
                <StorePublicMenuRow
                  storeSlug={storeSlug}
                  p={p}
                  canInteract={canInteract}
                  menuSelectBlocked={menuSelectBlocked}
                  onOpenProduct={onOpenProduct}
                  onQuickAddProduct={onQuickAddProduct}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
