"use client";

import { formatMoneyPhp } from "@/lib/utils/format";
import type { StoreDetailProductCard } from "@/lib/stores/group-store-products-by-menu";
import { StoreProductThumbnail } from "@/components/stores/common/StoreProductThumbnail";

/**
 * 배민식 메뉴판 상단: 사장님 추천(가로) + 인기 메뉴(랭킹) — 카테고리 탭 위.
 */
export function StoreMenuBoardPreamble({
  recommendedCards,
  popularCards,
  canInteract,
  menuSelectBlocked,
  onOpenProduct,
}: {
  recommendedCards: StoreDetailProductCard[];
  popularCards: StoreDetailProductCard[];
  canInteract: boolean;
  menuSelectBlocked?: boolean;
  onOpenProduct: (productId: string) => void;
}) {
  const dimmed = menuSelectBlocked;

  if (recommendedCards.length === 0 && popularCards.length === 0) return null;

  return (
    <div className="border-b border-neutral-100 bg-white">
      {recommendedCards.length > 0 ? (
        <section className="px-4 pb-3 pt-3" aria-label="사장님 추천">
          <h2 className="text-[15px] font-extrabold tracking-[-0.02em] text-neutral-900">사장님 추천</h2>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {recommendedCards.map((p) => {
              const thumb = p.thumbnail_url?.trim() || "";
              const open = () => {
                if (dimmed) return;
                onOpenProduct(p.id);
              };
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={!canInteract || dimmed}
                  onClick={open}
                  className={`flex w-[104px] shrink-0 flex-col items-stretch overflow-hidden rounded-[12px] border border-neutral-200 bg-white text-left shadow-sm ${
                    dimmed ? "opacity-45" : "active:scale-[0.98]"
                  }`}
                >
                  <div className="relative aspect-square w-full bg-neutral-100">
                    <StoreProductThumbnail
                      src={thumb}
                      size={104}
                      roundedClassName="rounded-none"
                    />
                  </div>
                  <div className="min-h-[2.5rem] px-1.5 py-1">
                    <p className="line-clamp-2 text-[11px] font-extrabold leading-snug text-neutral-900">{p.title}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {popularCards.length > 0 ? (
        <section className="border-t border-neutral-100 px-4 pb-3 pt-3" aria-label="인기 메뉴">
          <h2 className="text-[15px] font-extrabold tracking-[-0.02em] text-neutral-900">인기 메뉴</h2>
          <ul className="mt-1 divide-y divide-[#F1F1F1]">
            {popularCards.map((p, idx) => {
              const rank = idx + 1;
              const thumb = p.thumbnail_url?.trim() || "";
              const hasDiscount =
                p.discount_price != null &&
                Number.isFinite(p.discount_price) &&
                p.discount_price < p.price &&
                p.price > 0;
              const salePrice = hasDiscount ? p.discount_price! : p.price;
              const soldOut = p.product_status === "sold_out" || (p.track_inventory && p.stock_qty <= 0);
              const open = () => {
                if (dimmed || soldOut) return;
                onOpenProduct(p.id);
              };
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={!canInteract || dimmed || soldOut}
                    onClick={open}
                    className={`flex w-full items-start gap-3 py-3 text-left ${
                      dimmed || soldOut ? "cursor-not-allowed opacity-45" : ""
                    }`}
                  >
                    <span className="mt-1 w-6 shrink-0 text-center text-[14px] font-black tabular-nums text-[#1C8DB8]">
                      {rank}
                    </span>
                    <div className="relative h-[72px] w-[72px] shrink-0">
                      <StoreProductThumbnail src={thumb} size={72} roundedClassName="rounded-[10px]" />
                      {soldOut ? <div className="absolute inset-0 bg-white/45" aria-hidden /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-[14px] font-extrabold leading-snug text-neutral-900">{p.title}</p>
                      <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
                        <span className="text-[14px] font-extrabold tabular-nums text-neutral-900">
                          {formatMoneyPhp(salePrice)}
                        </span>
                        {hasDiscount ? (
                          <span className="text-xs font-normal text-neutral-400 line-through">
                            {formatMoneyPhp(p.price)}
                          </span>
                        ) : null}
                      </div>
                      {soldOut ? (
                        <span className="mt-1 inline-flex rounded-[3px] bg-red-50 px-1.5 text-[10px] font-bold text-red-700">
                          품절
                        </span>
                      ) : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
