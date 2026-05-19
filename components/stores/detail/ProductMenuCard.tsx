"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import { memo, useCallback } from "react";
import { DibayMenuBoard } from "@/lib/stores/dibay-menu-board-tokens";
import { cardIsMenuSoldOut, type StoreDetailProductCard } from "@/lib/stores/group-store-products-by-menu";
import { approximateDiscountPercent } from "@/lib/stores/store-product-pricing";
import { formatMoneyPhp } from "@/lib/utils/format";
import { ProductBadgeRow } from "@/components/stores/detail/ProductBadgeRow";
import { SoldOutOverlay } from "@/components/stores/detail/SoldOutOverlay";
import { storeMenuProductDomId } from "@/lib/dibay/store-menu-product-focus";
import { StoreProductThumbnail } from "@/components/stores/common/StoreProductThumbnail";

const PLUS_BTN =
  "absolute bottom-1 right-1 z-10 flex h-[28px] w-[28px] shrink-0 touch-manipulation select-none items-center justify-center rounded-full bg-[#2386B1] text-[19px] font-normal leading-none text-white shadow-[0_2px_6px_rgba(35,134,177,0.35)] ring-1 ring-[#2386B1]/40 transition-all duration-150 hover:bg-[#1F769C] active:scale-[0.92] active:bg-[#1A6A8F]";

type Props = {
  storeSlug: string;
  p: StoreDetailProductCard;
  canInteract: boolean;
  menuSelectBlocked?: boolean;
  onOpenProduct?: (productId: string) => void;
  onQuickAddProduct?: (product: StoreDetailProductCard) => boolean;
};

export const ProductMenuCard = memo(function ProductMenuCard({
  storeSlug: _storeSlug,
  p,
  canInteract,
  menuSelectBlocked,
  onOpenProduct,
  onQuickAddProduct,
}: Props) {
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
  const soldOut = cardIsMenuSoldOut(p);
  const thumbSrc = p.thumbnail_url?.trim() || "";
  const dimmed = soldOut || menuSelectBlocked;

  const openSheet = useCallback(() => {
    onOpenProduct?.(p.id);
  }, [onOpenProduct, p.id]);

  const onCardKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      openSheet();
    },
    [openSheet]
  );

  const onAddPress = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (soldOut) return;
      if (onQuickAddProduct?.(p)) return;
      openSheet();
    },
    [onQuickAddProduct, openSheet, p, soldOut]
  );

  const sz = DibayMenuBoard.thumbSize;

  const textBlock = (
    <div className="min-w-0 flex-1" style={{ padding: DibayMenuBoard.productCardPadding }}>
      <div className="flex flex-wrap items-start gap-1">
        <h3
          className="min-w-0 flex-1 leading-snug tracking-[-0.015em] text-neutral-900"
          style={{
            fontSize: DibayMenuBoard.title.fontSizePx,
            fontWeight: DibayMenuBoard.title.fontWeight,
          }}
        >
          {p.title}
          {soldOut ? (
            <span className="ml-1.5 text-[11px] font-semibold text-neutral-400">품절</span>
          ) : null}
        </h3>
      </div>
      <ProductBadgeRow p={p} />
      {p.summary ? (
        <p
          className="mt-0.5 line-clamp-2 leading-snug"
          style={{
            fontSize: DibayMenuBoard.desc.fontSizePx,
            color: DibayMenuBoard.desc.color,
          }}
        >
          {p.summary}
        </p>
      ) : null}
      <div className="mt-1.5 flex flex-wrap items-baseline gap-1.5">
        <ProductBadgeRow p={p} inPriceRow />
        <span
          className="tabular-nums text-neutral-900"
          style={{
            fontSize: DibayMenuBoard.price.fontSizePx,
            fontWeight: DibayMenuBoard.price.fontWeight,
          }}
        >
          {formatMoneyPhp(salePrice)}
        </span>
        {hasDiscount ? (
          <span className="text-xs font-normal text-neutral-400 line-through">
            {formatMoneyPhp(p.price)}
          </span>
        ) : null}
      </div>
    </div>
  );

  const thumb = (
    <div className="relative shrink-0" style={{ width: sz, height: sz }}>
      <div className="relative h-full w-full overflow-hidden rounded-[12px]">
        <StoreProductThumbnail
          src={thumbSrc}
          size={sz}
          roundedClassName="rounded-[12px]"
        />
        {hasDiscount && badgePct > 0 ? (
          <span className="absolute left-1 top-1 z-10 rounded-[3px] bg-red-600 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white shadow">
            {badgePct}%
          </span>
        ) : null}
        {soldOut ? <SoldOutOverlay /> : null}
        {!menuSelectBlocked && onOpenProduct && !soldOut ? (
          <button type="button" onClick={onAddPress} className={PLUS_BTN} aria-label={`${p.title} 담기`}>
            +
          </button>
        ) : null}
      </div>
    </div>
  );

  const rowWrapClass = `flex min-h-[102px] flex-row items-stretch bg-white`;
  const cardStyle = {
    borderRadius: DibayMenuBoard.cardRadiusPx,
    boxShadow: "0 1px 0 rgba(0,0,0,0.04)",
  };
  const productDomId = storeMenuProductDomId(p.id);

  if (!canInteract) {
    return (
      <div
        id={productDomId}
        className={`${rowWrapClass} cursor-not-allowed opacity-50`}
        style={cardStyle}
        role="group"
        aria-disabled
      >
        {textBlock}
        {thumb}
      </div>
    );
  }

  void _storeSlug;

  if (onOpenProduct) {
    return (
      <div
        id={productDomId}
        role="button"
        tabIndex={0}
        onClick={openSheet}
        onKeyDown={onCardKeyDown}
        className={`${rowWrapClass} w-full cursor-pointer text-left ${dimmed ? "opacity-80" : ""}`}
        style={cardStyle}
      >
        {textBlock}
        {thumb}
      </div>
    );
  }

  return (
    <div id={productDomId} className={rowWrapClass} style={cardStyle}>
      {textBlock}
      {thumb}
    </div>
  );
});
