"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { DibayMenuBoard } from "@/lib/stores/dibay-menu-board-tokens";
import type { StoreDetailProductCard } from "@/lib/stores/group-store-products-by-menu";

type BadgeKind = "popular" | "owner" | "rep" | "discount";

function BadgeChip({ kind, label }: { kind: BadgeKind; label: string }) {
  const t =
    kind === "owner"
      ? DibayMenuBoard.badge.ownerRecommended
      : kind === "rep"
        ? DibayMenuBoard.badge.representative
        : kind === "discount"
          ? DibayMenuBoard.badge.discount
          : DibayMenuBoard.badge.popular;
  const border =
    kind === "owner"
      ? DibayMenuBoard.badge.ownerRecommended.border
      : kind === "popular"
        ? "1px solid #FFCACA"
        : kind === "rep"
          ? DibayMenuBoard.badge.representative.border
          : undefined;
  return (
    <span
      className="inline-flex shrink-0 items-center leading-none"
      style={{
        backgroundColor: t.bg,
        color: t.fg,
        borderRadius: t.radiusPx,
        fontSize: t.fontSizePx,
        fontWeight: t.fontWeight,
        padding: t.padding,
        lineHeight:
          kind === "owner" ? `${DibayMenuBoard.badge.ownerRecommended.lineHeightPx}px` : "1.2",
        border: border || undefined,
      }}
    >
      {label}
    </span>
  );
}

/**
 * 상품명 아래 뱃지 행 — 품절은 이미지 오버레이와 별개(행에서 숨기지 않음).
 * 최대 3개: 인기 > 사장님 추천 > 대표 (할인은 가격 줄 전용)
 */
export function ProductBadgeRow({
  p,
  inPriceRow,
}: {
  p: StoreDetailProductCard;
  /** true면 할인 뱃지만(가격 줄 왼쪽) */
  inPriceRow?: boolean;
}) {
  const { t } = useI18n();
  const hasDiscount =
    p.discount_price != null &&
    Number.isFinite(p.discount_price) &&
    p.discount_price < p.price &&
    p.price > 0;

  if (inPriceRow) {
    if (!hasDiscount) return null;
    return <BadgeChip kind="discount" label={t("store_badge_menu_discount")} />;
  }

  const pool: { kind: BadgeKind; show: boolean }[] = [
    { kind: "popular", show: (p.popular_rank ?? 0) > 0 },
    { kind: "owner", show: p.is_owner_recommended },
    { kind: "rep", show: p.is_representative },
  ];
  const ordered = pool.filter((x) => x.show).slice(0, 3);

  if (ordered.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center"
      style={{ gap: DibayMenuBoard.badgeGapPx, marginTop: DibayMenuBoard.badgeRowMarginTopPx }}
    >
      {ordered.map((o) =>
        o.kind === "popular" ? (
          <BadgeChip key="popular" kind="popular" label={t("store_badge_menu_popular")} />
        ) : o.kind === "owner" ? (
          <BadgeChip key="owner" kind="owner" label={t("store_badge_owner_recommended")} />
        ) : o.kind === "rep" ? (
          <BadgeChip key="rep" kind="rep" label={t("store_badge_menu_representative")} />
        ) : (
          <BadgeChip key="discount" kind="discount" label={t("store_badge_menu_discount")} />
        )
      )}
    </div>
  );
}
