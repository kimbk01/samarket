"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { DibayMenuBoard } from "@/lib/stores/dibay-menu-board-tokens";
import { cardIsMenuSoldOut, type StoreDetailProductCard } from "@/lib/stores/group-store-products-by-menu";
import { SoldOutOverlay } from "@/components/stores/detail/SoldOutOverlay";
import { StoreProductThumbnail } from "@/components/stores/common/StoreProductThumbnail";

export function RecommendedMenuSection({
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
  const { t } = useI18n();
  if (cards.length === 0) return null;
  const dimmed = menuSelectBlocked || !canInteract;
  const sz = DibayMenuBoard.thumbSize;

  return (
    <section
      className="bg-white px-4 pb-3 pt-3"
      style={{ marginBottom: DibayMenuBoard.sectionGapPx }}
    >
      <h2
        className="tracking-[-0.02em] text-neutral-900"
        style={{ fontSize: DibayMenuBoard.title.fontSizePx, fontWeight: DibayMenuBoard.title.fontWeight }}
      >
        {t("store_recommended_menu_title")}
      </h2>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {cards.map((p) => {
          const thumb = p.thumbnail_url?.trim() || "";
          const soldOut = cardIsMenuSoldOut(p);
          const showPopular = (p.popular_rank ?? 0) > 0;
          const showOwner = p.is_owner_recommended;
          return (
            <button
              key={p.id}
              type="button"
              disabled={dimmed}
              onClick={() => {
                if (dimmed) return;
                onOpenProduct(p.id);
              }}
              className={`flex w-[112px] shrink-0 flex-col items-stretch overflow-hidden border border-neutral-200 bg-white text-left ${
                dimmed ? "cursor-not-allowed opacity-45" : "active:scale-[0.98]"
              }`}
              style={{ borderRadius: DibayMenuBoard.cardRadiusPx }}
            >
              <div className="relative bg-neutral-100" style={{ width: "100%", aspectRatio: "1", maxHeight: sz + 16 }}>
                <StoreProductThumbnail
                  src={thumb}
                  size={112}
                  roundedClassName="rounded-none"
                  className="h-full w-full"
                />
                {soldOut ? <SoldOutOverlay /> : null}
                <div className="pointer-events-none absolute left-1 top-1 flex flex-wrap gap-1">
                  {showPopular ? (
                    <span
                      className="rounded px-1 text-[9px] font-bold"
                      style={{
                        background: DibayMenuBoard.badge.popular.bg,
                        color: DibayMenuBoard.badge.popular.fg,
                        border: DibayMenuBoard.badge.popular.text ? "1px solid #FFCACA" : undefined,
                      }}
                    >
                      {t("store_badge_menu_popular")}
                    </span>
                  ) : null}
                  {showOwner ? (
                    <span
                      className="rounded px-1 text-[9px] font-bold"
                      style={{
                        background: DibayMenuBoard.badge.ownerRecommended.bg,
                        color: DibayMenuBoard.badge.ownerRecommended.fg,
                      }}
                    >
                      {t("store_badge_owner_recommended")}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="min-h-[2.5rem] px-1.5 py-1">
                <p className="line-clamp-2 text-[11px] font-extrabold leading-snug text-neutral-900">{p.title}</p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
