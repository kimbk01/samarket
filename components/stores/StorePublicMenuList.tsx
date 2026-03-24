"use client";

import Link from "next/link";
import { formatMoneyPhp } from "@/lib/utils/format";
import {
  itemTypeShortLabel,
  type MenuSection,
} from "@/lib/stores/group-store-products-by-menu";
import { approximateDiscountPercent } from "@/lib/stores/store-product-pricing";
import { STORE_DETAIL_GUTTER } from "@/lib/stores/store-detail-ui";

/** 주문용 메뉴 행 — 패널 배경(gray-100대) 위에서도 구분되게 stone-300 */
const MENU_ROW_CARD =
  "flex w-full gap-3 rounded-xl border border-stone-300 bg-white p-3 text-left shadow-sm active:bg-gray-50";
const SECTION_BOX = "rounded-xl border border-stone-300 bg-white p-3 shadow-sm";
const MENU_THUMB_BOX =
  "relative h-16 w-16 shrink-0 overflow-visible";
const MENU_THUMB_INNER =
  "flex h-full w-full items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 text-2xl text-gray-400";

export function StorePublicMenuList({
  storeSlug,
  sections,
  canSell,
  orderHint,
  menuSelectBlocked,
  menuSelectHint,
  /** 섹션 앵커 id (칩 스크롤 연동). 예: (i) => \`store-sec-\${i}\` */
  sectionDomId,
  /** sticky 탭·칩 높이 보정(Tailwind). `sectionScrollMarginTopPx`가 있으면 우선합니다. */
  sectionScrollMarginClass = "scroll-mt-[132px]",
  /** 동적 sticky 높이(px) — 칩·피크 행 포함 시 부모에서 전달 */
  sectionScrollMarginTopPx,
  /** 전달 시 메뉴 행이 상세 페이지 대신 바텀시트(빠른 담기)를 엽니다. */
  onOpenProduct,
}: {
  storeSlug: string;
  sections: MenuSection[];
  canSell: boolean;
  orderHint?: React.ReactNode;
  /** true면 메뉴 행을 눌러도 상품으로 이동하지 않음 (휴게 시간 등) */
  menuSelectBlocked?: boolean;
  menuSelectHint?: string;
  sectionDomId?: (sectionIndex: number) => string;
  sectionScrollMarginClass?: string;
  sectionScrollMarginTopPx?: number;
  onOpenProduct?: (productId: string) => void;
}) {
  if (!canSell) {
    return (
      <div className={`${STORE_DETAIL_GUTTER} mt-4`}>
        <p className="rounded-xl border border-stone-300 bg-white px-3 py-4 text-center text-[13px] font-normal leading-relaxed text-gray-500 shadow-sm">
          이 매장은 상품 판매 승인 전이거나 판매가 일시 중지된 상태입니다.
        </p>
      </div>
    );
  }

  const flatCount = sections.reduce((n, s) => n + s.items.length, 0);
  if (flatCount === 0) {
    return (
      <div className={`${STORE_DETAIL_GUTTER} mt-4`}>
        <p className="rounded-xl border border-stone-300 bg-white px-3 py-4 text-center text-[13px] font-normal leading-relaxed text-gray-500 shadow-sm">
          등록된 상품이 없습니다.
        </p>
      </div>
    );
  }

  return (
    <div className={`${STORE_DETAIL_GUTTER} mt-4 space-y-6 pb-4`}>
      {orderHint ? (
        <div className="text-[12px] font-normal leading-snug text-gray-500">{orderHint}</div>
      ) : null}
      {menuSelectBlocked ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] font-medium leading-snug text-amber-950 shadow-sm">
          {menuSelectHint?.trim() ||
            "지금은 메뉴를 선택할 수 없습니다. 목록은 볼 수 있습니다."}
        </p>
      ) : null}
      {sections.map((section, sectionIndex) => (
        <section
          key={section.heading}
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
          <div className={SECTION_BOX}>
            <h3 className="mb-3 text-sm font-bold text-gray-900">{section.heading}</h3>
            <ul className="space-y-2">
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
              const rowInner = (
                <>
                  <div className={MENU_THUMB_BOX}>
                    {hasDiscount && badgePct > 0 ? (
                      <span className="absolute -right-1 -top-1 z-10 flex h-6 min-w-[1.5rem] shrink-0 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-none text-white shadow-sm">
                        {badgePct}%
                      </span>
                    ) : null}
                    <div className={MENU_THUMB_INNER}>
                      {p.thumbnail_url ? (
                         
                        <img src={p.thumbnail_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span>🍽️</span>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="font-semibold text-gray-900">{p.title}</span>
                      {p.is_featured ? (
                        <span className="rounded bg-signature/10 px-1.5 py-0.5 text-[10px] font-semibold text-signature">
                          대표
                        </span>
                      ) : null}
                      {typeLabel && typeLabel !== "상품" ? (
                        <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
                          {typeLabel}
                        </span>
                      ) : null}
                      {soldOut ? (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                          품절
                        </span>
                      ) : null}
                    </div>
                    {p.summary ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{p.summary}</p>
                    ) : null}
                    <div className="mt-1 flex flex-wrap items-baseline gap-2">
                      <span className="text-sm font-bold text-gray-900">{formatMoneyPhp(salePrice)}</span>
                      {hasDiscount ? (
                        <span className="text-xs font-normal text-gray-400 line-through">
                          {formatMoneyPhp(p.price)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </>
              );
              return (
                <li key={p.id}>
                  {menuSelectBlocked ? (
                    <div
                      className={`${MENU_ROW_CARD} cursor-not-allowed opacity-60`}
                      role="group"
                      aria-disabled
                    >
                      {rowInner}
                    </div>
                  ) : onOpenProduct ? (
                    <button
                      type="button"
                      onClick={() => onOpenProduct(p.id)}
                      className={MENU_ROW_CARD}
                    >
                      {rowInner}
                    </button>
                  ) : (
                    <Link
                      href={`/stores/${encodeURIComponent(storeSlug)}/p/${encodeURIComponent(p.id)}`}
                      className={MENU_ROW_CARD}
                    >
                      {rowInner}
                    </Link>
                  )}
                </li>
              );
            })}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}
