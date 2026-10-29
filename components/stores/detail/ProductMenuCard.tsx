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
import { resolveMenuPriceDisplay } from "@/lib/stores/browse-card-menu-strip";

type Props = {
  storeSlug: string;
  p: StoreDetailProductCard;
  canInteract: boolean;
  menuSelectBlocked?: boolean;
  /** CUT 8 — hide/disable add while still allowing menu browse / product open */
  addActionsBlocked?: boolean;
  onOpenProduct?: (productId: string) => void;
  onQuickAddProduct?: (product: StoreDetailProductCard) => boolean;
  /** WP6 — 첫 화면(약 6행) 사진은 즉시 로드 */
  eagerImage?: boolean;
  /** 인기 메뉴 영역은 같은 상품이 카테고리에도 있으므로 DOM id 를 붙이지 않는다 (포커스 착지 대상 중복 방지) */
  omitDomId?: boolean;
};

/**
 * WP6 (배민형 2차수 2026-10-29) — 메뉴 행: 흰 카드 → 평면 목록 + 1px 구분선.
 * 배지(회색 알약) → 이름(굵게) → 설명 회색 2줄 → 가격(할인 시 할인가 굵게 + 원가 취소선).
 * 사진: 정사각형 min(28vw, 108px), 4px. + 버튼: 흰 원 32px + 그림자 (영업 외·주문 불가면 숨김).
 * 옵션별 가격 줄(「• 보통 : 가격」)은 목록 payload 에 옵션이 없어(`store-menus-catalog-assemble` 가 options_json 제외)
 * 이번 차수에서는 단일 가격을 유지한다 — 규칙은 `buildMenuRowOptionPriceLines` 에 준비됨.
 */
export const ProductMenuCard = memo(function ProductMenuCard({
  storeSlug: _storeSlug,
  p,
  canInteract,
  menuSelectBlocked,
  addActionsBlocked,
  onOpenProduct,
  onQuickAddProduct,
  eagerImage = false,
  omitDomId = false,
}: Props) {
  const { t } = useI18n();
  const price = resolveMenuPriceDisplay(p.price, p.discount_price);
  const soldOut = cardIsMenuSoldOut(p);
  const thumbSrc = p.thumbnail_url?.trim() || "";
  const dimmed = soldOut || menuSelectBlocked;
  const hideQuickAdd = Boolean(menuSelectBlocked || addActionsBlocked);

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
      if (soldOut || addActionsBlocked) return;
      if (onQuickAddProduct?.(p)) return;
      openSheet();
    },
    [addActionsBlocked, onQuickAddProduct, openSheet, p, soldOut]
  );

  const textBlock = (
    <div className="min-w-0 flex-1">
      <ProductBadgeRow p={p} leading />
      <h3
        className="tracking-[-0.015em] text-[color:var(--delivery-text-main)]"
        style={{
          fontSize: DibayMenuBoard.title.fontSizePx,
          fontWeight: DibayMenuBoard.title.fontWeight,
          lineHeight: "var(--delivery-lh-card-title)",
        }}
      >
        {p.title}
        {soldOut ? (
          <span className="ml-1.5 text-[11px] font-semibold text-sam-meta">{t("store_sold_out")}</span>
        ) : null}
      </h3>
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
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5">
        <span
          className="tabular-nums text-[color:var(--delivery-text-main)]"
          style={{
            fontSize: DibayMenuBoard.price.fontSizePx,
            fontWeight: DibayMenuBoard.price.fontWeight,
            lineHeight: "var(--delivery-lh-price)",
          }}
        >
          {formatMoneyPhp(price.currentPhp)}
        </span>
        {price.originalPhp != null ? (
          <span className="text-xs font-normal text-sam-meta line-through">
            {formatMoneyPhp(price.originalPhp)}
          </span>
        ) : null}
      </div>
    </div>
  );

  const thumb = (
    <div
      className="delivery-menu-row-flat__thumb relative shrink-0 overflow-hidden"
      style={{ borderRadius: DibayMenuBoard.cardRadiusPx }}
    >
      <StoreProductThumbnail
        src={thumbSrc}
        fill
        className="h-full w-full"
        roundedClassName="rounded-ui-rect"
        loading={eagerImage ? "eager" : "lazy"}
      />
      {soldOut ? <SoldOutOverlay /> : null}
      {!hideQuickAdd && onOpenProduct && !soldOut ? (
        <MenuQuickAddButton title={p.title} onPress={onAddPress} />
      ) : null}
    </div>
  );

  const rowClass = "delivery-menu-row-flat";
  const productDomId = omitDomId ? undefined : storeMenuProductDomId(p.id);

  if (!canInteract) {
    return (
      <div id={productDomId} className={`${rowClass} delivery-unavailable`} role="group" aria-disabled>
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
        className={`${rowClass} w-full cursor-pointer text-left active:bg-sam-surface-muted ${dimmed ? "opacity-80" : ""}`}
      >
        {textBlock}
        {thumb}
      </div>
    );
  }

  return (
    <div id={productDomId} className={rowClass}>
      {textBlock}
      {thumb}
    </div>
  );
});
