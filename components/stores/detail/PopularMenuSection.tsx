"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayMenuBoard } from "@/lib/stores/dibay-menu-board-tokens";
import type { StoreDetailProductCard } from "@/lib/stores/group-store-products-by-menu";
import { ProductMenuCard } from "@/components/stores/detail/ProductMenuCard";
import { STORE_DETAIL_POPULAR_SECTION_DOM_ID } from "@/lib/stores/store-detail-baemin-presentation";

/** WP6 — 첫 화면 즉시 로드 행 수 (인기 메뉴가 메뉴판 맨 위) */
const EAGER_IMAGE_ROWS = 6;

/**
 * WP6 (배민형 2차수 2026-10-29) — 인기 메뉴: 별도 순위 숫자 + 왼쪽 사진 레이아웃 제거.
 * 일반 메뉴 행(`ProductMenuCard`) + 회색 알약 「인기 n위」 배지(`ProductBadgeRow`).
 * 칩 「인기 메뉴」 이동 앵커 = `STORE_DETAIL_POPULAR_SECTION_DOM_ID`.
 */
export function PopularMenuSection({
  cards,
  canInteract,
  menuSelectBlocked,
  addActionsBlocked,
  onOpenProduct,
  onQuickAddProduct,
  storeSlug = "",
}: {
  cards: StoreDetailProductCard[];
  canInteract: boolean;
  menuSelectBlocked?: boolean;
  addActionsBlocked?: boolean;
  onOpenProduct: (id: string) => void;
  onQuickAddProduct?: (product: StoreDetailProductCard) => boolean;
  storeSlug?: string;
}) {
  const { t } = useI18n();
  const ranked = useMemo(
    () => cards.map((p, idx) => (p.popular_rank != null && p.popular_rank > 0 ? p : { ...p, popular_rank: idx + 1 })),
    [cards]
  );
  if (ranked.length === 0) return null;

  return (
    <section
      id={STORE_DETAIL_POPULAR_SECTION_DOM_ID}
      className="border-y border-[var(--delivery-border-section)] bg-[var(--delivery-bg-card)] px-4 pt-3"
      style={{ marginBottom: DibayMenuBoard.sectionGapPx }}
      aria-label={t("store_popular_menu_aria")}
    >
      <h2 className="delivery-section-heading tracking-[-0.02em]">{t("store_popular_menu_title")}</h2>
      <ul className="flex flex-col">
        {ranked.map((p, idx) => (
          <li key={p.id}>
            <ProductMenuCard
              storeSlug={storeSlug}
              p={p}
              canInteract={canInteract}
              menuSelectBlocked={menuSelectBlocked}
              addActionsBlocked={addActionsBlocked}
              onOpenProduct={onOpenProduct}
              onQuickAddProduct={onQuickAddProduct}
              eagerImage={idx < EAGER_IMAGE_ROWS}
              omitDomId
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
