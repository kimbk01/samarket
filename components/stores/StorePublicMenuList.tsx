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
const SECTION_HEAD = "mb-3 sam-text-body font-bold text-sam-fg";

/** 피드형 메뉴 카드 — 좌 썸네일 · 우 텍스트 · 우하단 + */
const CARD_WRAP =
  "flex w-full gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-left shadow-sm transition-shadow active:shadow-md";

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
        <p className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-4 text-center sam-text-body-secondary font-normal leading-relaxed text-sam-muted shadow-sm">
          이 매장은 상품 판매 승인 전이거나 판매가 일시 중지된 상태입니다.
        </p>
      </div>
    );
  }

  const flatCount = sections.reduce((n, s) => n + s.items.length, 0);
  if (flatCount === 0) {
    return (
      <div className={`${STORE_DETAIL_GUTTER} mt-4`}>
        <p className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-4 text-center sam-text-body-secondary font-normal leading-relaxed text-sam-muted shadow-sm">
          {sections.length === 0 ? "검색 결과가 없습니다." : "등록된 상품이 없습니다."}
        </p>
      </div>
    );
  }

  return (
    <div className={`${STORE_DETAIL_GUTTER} mt-3 space-y-6 pb-4`}>
      {menuSelectBlocked ? (
        <p className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2.5 sam-text-helper font-medium leading-snug text-amber-950 shadow-sm">
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
                <div className="relative h-[5.25rem] w-[5.25rem] shrink-0 overflow-hidden rounded-ui-rect bg-gradient-to-br from-sam-surface-muted to-sam-border-soft">
                  {hasDiscount && badgePct > 0 ? (
                    <span className="absolute left-1 top-1 z-10 rounded-ui-rect bg-red-600 px-1.5 py-0.5 sam-text-xxs font-bold leading-none text-white shadow">
                      {badgePct}%
                    </span>
                  ) : null}
                  {p.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumbnail_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-2xl text-sam-meta">
                      🍽️
                    </div>
                  )}
                  {soldOut ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/55">
                      <span className="rounded-ui-rect bg-sam-surface/95 px-2 py-1 sam-text-xxs font-bold text-sam-fg">
                        품절
                      </span>
                    </div>
                  ) : null}
                </div>
              );
              const textBlock = (
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="sam-text-body font-bold leading-snug text-sam-fg">{p.title}</span>
                    {p.is_featured ? (
                      <span className="rounded-ui-rect bg-amber-100 px-1.5 py-0.5 sam-text-xxs font-bold text-amber-900">
                        인기
                      </span>
                    ) : null}
                    {typeLabel && typeLabel !== "상품" ? (
                      <span className="rounded-ui-rect bg-signature/10 px-1.5 py-0.5 sam-text-xxs font-semibold text-signature">
                        {typeLabel}
                      </span>
                    ) : null}
                    {p.has_options ? (
                      <span className="rounded-ui-rect border border-sam-border bg-sam-app px-1.5 py-0.5 sam-text-xxs font-semibold text-sam-muted">
                        옵션
                      </span>
                    ) : null}
                  </div>
                  {p.summary ? (
                    <p className="mt-1 line-clamp-2 sam-text-helper leading-snug text-sam-muted">{p.summary}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-baseline gap-2">
                    <span className="sam-text-body-lg font-bold text-sam-fg">{formatMoneyPhp(salePrice)}</span>
                    {hasDiscount ? (
                      <span className="text-xs font-normal text-sam-meta line-through">
                        {formatMoneyPhp(p.price)}
                      </span>
                    ) : null}
                    <span className="sam-text-xxs text-sam-meta">부터</span>
                  </div>
                </div>
              );
              const addBtn = !menuSelectBlocked && onOpenProduct && !soldOut && (
                <button
                  type="button"
                  onClick={onAddPress}
                  className="flex h-10 w-10 shrink-0 items-center justify-center self-end rounded-full border-2 border-signature bg-sam-surface text-xl font-bold leading-none text-signature shadow-sm active:bg-signature/10"
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
