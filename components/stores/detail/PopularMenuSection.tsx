"use client";

import type { MouseEvent } from "react";
import { useCallback } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatMoneyPhp } from "@/lib/utils/format";
import { DibayMenuBoard } from "@/lib/stores/dibay-menu-board-tokens";
import { cardIsMenuSoldOut, type StoreDetailProductCard } from "@/lib/stores/group-store-products-by-menu";
import { ProductBadgeRow } from "@/components/stores/detail/ProductBadgeRow";
import { MenuQuickAddButton } from "@/components/stores/detail/MenuQuickAddButton";
import { SoldOutOverlay } from "@/components/stores/detail/SoldOutOverlay";
import { StoreProductThumbnail } from "@/components/stores/common/StoreProductThumbnail";
import { DeliveryTheme } from "@/lib/design/delivery-theme";

export function PopularMenuSection({
  cards,
  canInteract,
  menuSelectBlocked,
  addActionsBlocked,
  onOpenProduct,
  onQuickAddProduct,
}: {
  cards: StoreDetailProductCard[];
  canInteract: boolean;
  menuSelectBlocked?: boolean;
  addActionsBlocked?: boolean;
  onOpenProduct: (id: string) => void;
  onQuickAddProduct?: (product: StoreDetailProductCard) => boolean;
}) {
  const { t } = useI18n();
  if (cards.length === 0) return null;
  const browseBlocked = menuSelectBlocked || !canInteract;
  const addBlocked = browseBlocked || Boolean(addActionsBlocked);

  return (
    <section
      className="border-y border-[var(--delivery-border-section)] bg-[var(--delivery-bg-card)] px-4 pb-3 pt-3"
      style={{ marginBottom: DibayMenuBoard.sectionGapPx }}
      aria-label={t("store_popular_menu_aria")}
    >
      <h2 className="delivery-section-heading tracking-[-0.02em]">{t("store_popular_menu_title")}</h2>
      <ul className="mt-1 divide-y divide-[var(--delivery-border-section)]">
        {cards.map((p, idx) => {
          const rank = p.popular_rank ?? idx + 1;
          const thumb = p.thumbnail_url?.trim() || "";
          const hasDiscount =
            p.discount_price != null &&
            Number.isFinite(p.discount_price) &&
            p.discount_price < p.price &&
            p.price > 0;
          const salePrice = hasDiscount ? p.discount_price! : p.price;
          const soldOut = cardIsMenuSoldOut(p);
          return (
            <PopularMenuRow
              key={p.id}
              p={p}
              rank={rank}
              thumb={thumb}
              salePrice={salePrice}
              hasDiscount={hasDiscount}
              soldOut={soldOut}
              browseBlocked={browseBlocked}
              addBlocked={addBlocked}
              onOpenProduct={onOpenProduct}
              onQuickAddProduct={onQuickAddProduct}
            />
          );
        })}
      </ul>
    </section>
  );
}

function PopularMenuRow({
  p,
  rank,
  thumb,
  salePrice,
  hasDiscount,
  soldOut,
  browseBlocked,
  addBlocked,
  onOpenProduct,
  onQuickAddProduct,
}: {
  p: StoreDetailProductCard;
  rank: number;
  thumb: string;
  salePrice: number;
  hasDiscount: boolean;
  soldOut: boolean;
  browseBlocked: boolean;
  addBlocked: boolean;
  onOpenProduct: (id: string) => void;
  onQuickAddProduct?: (product: StoreDetailProductCard) => boolean;
}) {
  const openSheet = useCallback(() => {
    if (browseBlocked) return;
    onOpenProduct(p.id);
  }, [browseBlocked, onOpenProduct, p.id]);

  const onAddPress = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (soldOut || addBlocked) return;
      if (onQuickAddProduct?.(p)) return;
      onOpenProduct(p.id);
    },
    [addBlocked, onOpenProduct, onQuickAddProduct, p, soldOut]
  );

  return (
    <li>
      <div
        role="button"
        tabIndex={browseBlocked ? -1 : 0}
        onClick={openSheet}
        onKeyDown={(e) => {
          if (browseBlocked) return;
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          openSheet();
        }}
        className={`flex w-full items-start gap-3 py-3 text-left ${
          browseBlocked ? "cursor-not-allowed opacity-45" : "cursor-pointer"
        }`}
      >
        <span className="mt-1 w-6 shrink-0 text-center text-[14px] font-black tabular-nums text-[color:var(--delivery-primary)]">
          {rank}
        </span>
        <div className={`relative shrink-0 ${DeliveryTheme.menuThumb}`}>
          <StoreProductThumbnail
            src={thumb}
            size={DibayMenuBoard.thumbSize}
            roundedClassName="rounded-[12px]"
          />
          {soldOut ? <SoldOutOverlay /> : null}
          {!addBlocked ? (
            <MenuQuickAddButton title={p.title} disabled={soldOut} onPress={onAddPress} />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[14px] font-extrabold leading-snug text-neutral-900">{p.title}</p>
          <ProductBadgeRow p={p} />
          <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
            <ProductBadgeRow p={p} inPriceRow />
            <span className="text-[14px] font-extrabold tabular-nums text-neutral-900">
              {formatMoneyPhp(salePrice)}
            </span>
            {hasDiscount ? (
              <span className="text-xs font-normal text-neutral-400 line-through">
                {formatMoneyPhp(p.price)}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}
