"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

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
import { StoreProductThumbnail } from "@/components/stores/common/StoreProductThumbnail";
import { DeliveryTheme } from "@/lib/design/delivery-theme";

const PLUS_BTN =
  DeliveryTheme.menuPlus;

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
  const { t, language } = useI18n();
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
  const typeLabel = itemTypeShortLabel(p.item_type, language);
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
        <span className="delivery-badge delivery-badge--owner">
          ?�장??추천
        </span>
      ) : null}
      {p.is_representative ? (
        <span className="inline-flex h-[18px] items-center rounded-[3px] bg-[#FFF4E5] px-1.5 text-[10px] font-bold text-[#B45309] ring-1 ring-amber-200/80">
          ?�?�메??        </span>
      ) : null}
      {typeLabel && typeLabel !== "?�품" ? (
        <span className="delivery-badge delivery-badge--primary">
          {typeLabel}
        </span>
      ) : null}
      {p.has_options ? (
        <span className="inline-flex h-[18px] items-center rounded-[3px] border border-neutral-200 bg-white px-1.5 text-[10px] font-bold text-neutral-600">
          ?�션
        </span>
      ) : null}
      {soldOut ? (
        <span className="inline-flex h-[18px] items-center rounded-[3px] bg-red-50 px-1.5 text-[10px] font-bold text-red-700">
          ?�절
        </span>
      ) : null}
    </div>
  );

  const thumb = (
    <div className="relative h-[88px] w-[88px] shrink-0">
      <div className="relative h-full w-full overflow-hidden rounded-[10px]">
        {hasDiscount && badgePct > 0 ? (
          <span className="absolute left-1 top-1 z-10 rounded-[3px] bg-red-600 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white shadow">
            {badgePct}%
          </span>
        ) : null}
        <StoreProductThumbnail src={thumbSrc} size={88} roundedClassName="rounded-[10px]" />
        {soldOut ? <div className="absolute inset-0 bg-white/45" aria-hidden /> : null}
        {!menuSelectBlocked && onOpenProduct && !soldOut ? (
          <button
            type="button"
            onClick={onAddPress}
            className={PLUS_BTN}
            aria-label={t("store_add_to_cart_aria", { title: p.title })}
          >
            +
          </button>
        ) : null}
      </div>
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
  const { t } = useI18n();
  if (!canSell) {
    return (
      <div className="mt-4 px-4">
        <p className="rounded-[14px] border border-neutral-200 bg-white px-4 py-8 text-center text-[14px] leading-relaxed text-neutral-500 shadow-sm">
          {t("store_menu_sales_paused")}
        </p>
      </div>
    );
  }

  const flatCount = sections.reduce((n, sec) => n + sec.items.length, 0);
  if (flatCount === 0) {
    return (
      <div className="mt-4 px-4">
        <p className="rounded-[14px] border border-neutral-200 bg-white px-4 py-8 text-center text-[14px] leading-relaxed text-neutral-500 shadow-sm">
          {sections.length === 0
            ? t("store_menu_search_no_results")
            : t("store_menu_no_items_registered")}
        </p>
      </div>
    );
  }

  const canInteract = !menuSelectBlocked;

  return (
    <div className="space-y-0 bg-white px-4 pb-4">
      {menuSelectBlocked ? (
        <p className="rounded-[14px] border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] font-medium leading-snug text-amber-950">
          {menuSelectHint?.trim() || t("store_menu_select_blocked_default")}
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
          </div>
          <ul className="mt-0.5 divide-y-0">
            {section.items.map((item) => (
              <li key={item.id}>
                <StorePublicMenuRow
                  storeSlug={storeSlug}
                  p={item}
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
