"use client";
import { tradeCardPriceLabel } from "@/lib/posts/trade-card-price-label";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { isPostEligibleForPromotionBoost } from "@/lib/promotion/trade-promotion-overlay";
import type { Product } from "@/lib/types/product";
import { FavoriteToggleButton } from "@/components/favorites/FavoriteToggleButton";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import {
  POST_LIST_META_TEXT_CLASS,
  POST_LIST_PRICE_CLASS,
  POST_LIST_TITLE_CLASS,
  stripPostListBlockTopMargin,
} from "@/lib/posts/post-list-preview-model";
import { beginRouteEntryPerf } from "@/lib/runtime/samarket-runtime-debug";
import { loadTradeFeedThumbnailFetchUrl } from "@/lib/image";
import { prefetchTradePostDetailHeroImage } from "@/lib/image/prefetch-trade-detail-hero";
import { SearchHighlightText } from "@/components/search/global/SearchHighlightText";

/** 시안 v3 광고하기 창 — 누를 때만 불러온다 */
const TradeAdQuickSheet = dynamic(
  () => import("@/components/trade/seller-ad/TradeAdQuickSheet").then((m) => m.TradeAdQuickSheet),
  { ssr: false }
);

interface ProductCardProps {
  product: Product;
  highlightQuery?: string;
}

export function ProductCard({ product, highlightQuery }: ProductCardProps) {
  const { t, safeT } = useI18n();
  const router = useRouter();
  const isSold = product.status === "sold";
  const detailHref = `/post/${product.id}`;
  const heroRaw = product.thumbnail || product.images?.[0] || null;
  const thumbnailFetchUrl = heroRaw ? loadTradeFeedThumbnailFetchUrl(heroRaw) ?? heroRaw : null;
  /** 시안 v3: 내 판매중 글이면 「광고하기」 — 기기 로그인 정보라 마운트 뒤에만(hydration 차이 없음) */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [adSheetOpen, setAdSheetOpen] = useState(false);
  const viewerId = mounted ? getCurrentUser()?.id ?? null : null;
  const showOwnerAdEntry =
    Boolean(viewerId) &&
    (product.sellerId ?? "") === viewerId &&
    !isSold &&
    isPostEligibleForPromotionBoost(product.status, product.sellerListingState);

  return (
    <div className="relative">
    <Link
      href={detailHref}
      onPointerDown={() => {
        prefetchTradePostDetailHeroImage(heroRaw);
        void router.prefetch(detailHref);
      }}
      onPointerEnter={() => {
        prefetchTradePostDetailHeroImage(heroRaw);
        void router.prefetch(detailHref);
      }}
      onFocus={() => void router.prefetch(detailHref)}
      onClick={() => beginRouteEntryPerf("product_detail", detailHref)}
      className={`relative flex gap-3 rounded-ui-rect bg-sam-surface p-3 ${isSold ? "opacity-60" : ""}`}
    >
      <div
        className="absolute right-2 top-2 z-[1]"
        onClick={(e) => e.preventDefault()}
        role="presentation"
      >
        <FavoriteToggleButton productId={product.id} iconClassName="h-5 w-5" />
      </div>
      {thumbnailFetchUrl ? (
        <div
          data-ui4-slot="photos"
          className="relative h-[100px] w-[100px] shrink-0 overflow-hidden rounded-ui-rect bg-sam-surface-muted"
        >
          <SamarketThumbnail
            src={thumbnailFetchUrl}
            fill
            roundedClassName="rounded-ui-rect"
            className="bg-sam-surface-muted"
          />
          {product.isBoosted && (
            <span className="absolute left-1 top-1 rounded bg-signature px-1.5 py-0.5 sam-text-xxs font-medium text-white">
              {t("mypage_comp_product_bump")}
            </span>
          )}
        </div>
      ) : null}
      <div className={`flex min-w-0 flex-1 flex-col ${thumbnailFetchUrl ? "min-h-[100px]" : ""}`}>
        <div className="flex min-h-0 flex-1 flex-col justify-between">
          <p data-ui4-slot="price" className={`${stripPostListBlockTopMargin(POST_LIST_PRICE_CLASS)} shrink-0`}>
            {tradeCardPriceLabel(product)}
          </p>
          <p data-ui4-slot="title" className={`${stripPostListBlockTopMargin(POST_LIST_TITLE_CLASS)} shrink-0`}>
            {highlightQuery ? <SearchHighlightText text={product.title} query={highlightQuery} /> : product.title}
          </p>
          {product.hasPromotionOverlay ? (
            <span
              data-ui4-slot="promo"
              className="inline-block w-fit shrink-0 rounded bg-sam-app px-1 py-0.5 text-[10px] font-medium text-sam-muted"
            >
              {safeT("trade_promo_badge")}
            </span>
          ) : null}
          {product.location ? (
            <p data-ui4-slot="location" className={stripPostListBlockTopMargin(POST_LIST_META_TEXT_CLASS)}>
              {product.location}
            </p>
          ) : null}
        </div>
      </div>
    </Link>
      {showOwnerAdEntry ? (
        <button
          type="button"
          data-trade-card-ad-entry="1"
          className="absolute bottom-3 right-3 inline-flex h-[26px] items-center rounded-ui-rect bg-sam-primary px-2 text-[12px] font-bold leading-none text-sam-on-primary"
          onClick={() => setAdSheetOpen(true)}
        >
          {t("trade_ad_cta")}
        </button>
      ) : null}
      {adSheetOpen ? (
        <TradeAdQuickSheet
          open
          onClose={() => setAdSheetOpen(false)}
          postId={product.id}
          postTitle={product.title}
          thumbnailUrl={thumbnailFetchUrl}
        />
      ) : null}
    </div>
  );
}
