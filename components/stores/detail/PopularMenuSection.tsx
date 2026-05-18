"use client";

import { formatMoneyPhp } from "@/lib/utils/format";
import { DibayMenuBoard } from "@/lib/stores/dibay-menu-board-tokens";
import { cardIsMenuSoldOut, type StoreDetailProductCard } from "@/lib/stores/group-store-products-by-menu";
import { ProductBadgeRow } from "@/components/stores/detail/ProductBadgeRow";
import { SoldOutOverlay } from "@/components/stores/detail/SoldOutOverlay";
import { StoreProductThumbnail } from "@/components/stores/common/StoreProductThumbnail";

export function PopularMenuSection({
  cards,
  canInteract,
  menuSelectBlocked,
  onOpenProduct,
}: {
  cards: StoreDetailProductCard[];
  canInteract: boolean;
  menuSelectBlocked?: boolean;
  onOpenProduct: (id: string) => void;
}) {
  if (cards.length === 0) return null;
  const dimmed = menuSelectBlocked || !canInteract;

  return (
    <section
      className="border-t border-neutral-100 bg-white px-4 pb-3 pt-3"
      style={{ marginBottom: DibayMenuBoard.sectionGapPx }}
      aria-label="인기 메뉴"
    >
      <h2
        className="tracking-[-0.02em] text-neutral-900"
        style={{ fontSize: DibayMenuBoard.title.fontSizePx, fontWeight: DibayMenuBoard.title.fontWeight }}
      >
        인기 메뉴
      </h2>
      <ul className="mt-1 divide-y divide-[#F1F1F1]">
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
            <li key={p.id}>
              <button
                type="button"
                disabled={dimmed}
                onClick={() => {
                  if (dimmed) return;
                  onOpenProduct(p.id);
                }}
                className={`flex w-full items-start gap-3 py-3 text-left ${
                  dimmed ? "cursor-not-allowed opacity-45" : ""
                }`}
              >
                <span className="mt-1 w-6 shrink-0 text-center text-[14px] font-black tabular-nums text-[#1C8DB8]">
                  {rank}
                </span>
                <div className="relative shrink-0">
                  <StoreProductThumbnail
                    src={thumb}
                    size={DibayMenuBoard.thumbSize}
                    roundedClassName="rounded-[12px]"
                  />
                  {soldOut ? <SoldOutOverlay /> : null}
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
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
