"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import type { KeyboardEvent, MouseEvent } from "react";
import { memo, useCallback } from "react";
import { DibayMenuBoard } from "@/lib/stores/dibay-menu-board-tokens";
import { cardIsMenuSoldOut, type StoreDetailProductCard } from "@/lib/stores/group-store-products-by-menu";
import { formatMoneyPhp } from "@/lib/utils/format";
import { ProductBadgeRow } from "@/components/stores/detail/ProductBadgeRow";
import { MenuQuickAddButton } from "@/components/stores/detail/MenuQuickAddButton";
import { SoldOutOverlay } from "@/components/stores/detail/SoldOutOverlay";
import { storeMenuProductDomId } from "@/lib/dibay/store-menu-product-focus";
import { StoreProductThumbnail } from "@/components/stores/common/StoreProductThumbnail";
import { DeliveryTheme } from "@/lib/design/delivery-theme";

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
  const { t } = useI18n();
  const hasDiscount =
    p.discount_price != null &&
    Number.isFinite(p.discount_price) &&
    p.discount_price < p.price &&
    p.price > 0;
  const salePrice = hasDiscount ? p.discount_price! : p.price;
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
          className="min-w-0 flex-1 tracking-[-0.015em] text-[color:var(--delivery-text-main)]"
          style={{
            fontSize: DibayMenuBoard.title.fontSizePx,
            fontWeight: DibayMenuBoard.title.fontWeight,
            lineHeight: "var(--delivery-lh-card-title)",
          }}
        >
          {p.title}
          {soldOut ? (
            <span className="ml-1.5 text-[11px] font-semibold text-neutral-400">{t("store_sold_out")}</span>
          ) : null}
        </h3>
      </div>
      <ProductBadgeRow p={p} />
      {p.summary ? (
        <p
          className="mt-1 line-clamp-2"
          style={{
            fontSize: DibayMenuBoard.desc.fontSizePx,
            color: DibayMenuBoard.desc.color,
            lineHeight: "var(--delivery-lh-sub)",
          }}
        >
          {p.summary}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-baseline gap-2">
        <ProductBadgeRow p={p} inPriceRow />
        <span
          className="tabular-nums text-[color:var(--delivery-text-main)]"
          style={{
            fontSize: DibayMenuBoard.price.fontSizePx,
            fontWeight: DibayMenuBoard.price.fontWeight,
            lineHeight: "var(--delivery-lh-price)",
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
    <div className="relative shrink-0 p-4 pl-0" style={{ width: sz + 16, height: sz + 32 }}>
      <div className={`relative ${DeliveryTheme.menuThumb}`}>
        <StoreProductThumbnail
          src={thumbSrc}
          size={sz}
          roundedClassName="rounded-[var(--delivery-radius-thumb)]"
        />
        {soldOut ? <SoldOutOverlay /> : null}
        {!menuSelectBlocked && onOpenProduct && !soldOut ? (
          <MenuQuickAddButton title={p.title} onPress={onAddPress} />
        ) : null}
      </div>
    </div>
  );

  const rowWrapClass = DeliveryTheme.menuRow;
  const cardStyle = {
    borderRadius: DibayMenuBoard.cardRadiusPx,
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
