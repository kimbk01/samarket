"use client";

import type { MouseEvent } from "react";
import { useCallback } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayMenuBoard } from "@/lib/stores/dibay-menu-board-tokens";
import { cardIsMenuSoldOut, type StoreDetailProductCard } from "@/lib/stores/group-store-products-by-menu";
import { ProductBadgeRow } from "@/components/stores/detail/ProductBadgeRow";
import { MenuQuickAddButton } from "@/components/stores/detail/MenuQuickAddButton";
import { SoldOutOverlay } from "@/components/stores/detail/SoldOutOverlay";
import { StoreProductThumbnail } from "@/components/stores/common/StoreProductThumbnail";
import { DeliveryTheme } from "@/lib/design/delivery-theme";

export function RecommendedMenuSection({
  cards,
  canInteract,
  menuSelectBlocked,
  onOpenProduct,
  onQuickAddProduct,
}: {
  cards: StoreDetailProductCard[];
  canInteract: boolean;
  menuSelectBlocked?: boolean;
  onOpenProduct: (id: string) => void;
  onQuickAddProduct?: (product: StoreDetailProductCard) => boolean;
}) {
  const { t } = useI18n();
  if (cards.length === 0) return null;
  const dimmed = menuSelectBlocked || !canInteract;
  const sz = DibayMenuBoard.thumbSize;

  return (
    <section
      className="border-b border-[var(--delivery-border-section)] bg-[var(--delivery-bg-card)] px-4 pb-3 pt-3"
      style={{ marginBottom: DibayMenuBoard.sectionGapPx }}
    >
      <h2 className="delivery-section-heading tracking-[-0.02em]">{t("store_recommended_menu_title")}</h2>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {cards.map((p) => (
          <RecommendedMenuCard
            key={p.id}
            p={p}
            sz={sz}
            dimmed={dimmed}
            onOpenProduct={onOpenProduct}
            onQuickAddProduct={onQuickAddProduct}
          />
        ))}
      </div>
    </section>
  );
}

function RecommendedMenuCard({
  p,
  sz,
  dimmed,
  onOpenProduct,
  onQuickAddProduct,
}: {
  p: StoreDetailProductCard;
  sz: number;
  dimmed: boolean;
  onOpenProduct: (id: string) => void;
  onQuickAddProduct?: (product: StoreDetailProductCard) => boolean;
}) {
  const thumb = p.thumbnail_url?.trim() || "";
  const soldOut = cardIsMenuSoldOut(p);

  const openSheet = useCallback(() => {
    if (dimmed) return;
    onOpenProduct(p.id);
  }, [dimmed, onOpenProduct, p.id]);

  const onAddPress = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (soldOut || dimmed) return;
      if (onQuickAddProduct?.(p)) return;
      onOpenProduct(p.id);
    },
    [dimmed, onOpenProduct, onQuickAddProduct, p, soldOut]
  );

  return (
    <div
      role="button"
      tabIndex={dimmed ? -1 : 0}
      onClick={openSheet}
      onKeyDown={(e) => {
        if (dimmed) return;
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        openSheet();
      }}
      className={`flex w-[112px] shrink-0 flex-col items-stretch overflow-hidden border border-[var(--delivery-border-section)] bg-[var(--delivery-bg-card)] text-left ${
        dimmed ? "cursor-not-allowed opacity-45" : "cursor-pointer active:scale-[0.98]"
      }`}
      style={{ borderRadius: DibayMenuBoard.cardRadiusPx }}
    >
      <div
        className={`relative overflow-hidden bg-[var(--delivery-bg-thumb)] ${DeliveryTheme.menuThumb}`}
        style={{ width: "100%", aspectRatio: "1", maxHeight: sz + 16 }}
      >
        <StoreProductThumbnail
          src={thumb}
          size={112}
          roundedClassName="rounded-none"
          className="h-full w-full"
          fill
        />
        {soldOut ? <SoldOutOverlay /> : null}
        <MenuQuickAddButton
          title={p.title}
          disabled={soldOut || dimmed}
          onPress={onAddPress}
          size="compact"
        />
      </div>
      <div className="min-h-[2.75rem] px-1.5 py-1">
        <p className="line-clamp-2 text-[11px] font-extrabold leading-snug text-neutral-900">{p.title}</p>
        <ProductBadgeRow p={p} />
      </div>
    </div>
  );
}
