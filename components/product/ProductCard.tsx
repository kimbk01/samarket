"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Product } from "@/lib/types/product";
import { formatPrice } from "@/lib/utils/format";
import { FavoriteToggleButton } from "@/components/favorites/FavoriteToggleButton";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import {
  POST_LIST_META_TEXT_CLASS,
  POST_LIST_PRICE_CLASS,
  POST_LIST_TITLE_CLASS,
  stripPostListBlockTopMargin,
} from "@/lib/posts/post-list-preview-model";
import { beginRouteEntryPerf } from "@/lib/runtime/samarket-runtime-debug";

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const { t, safeT } = useI18n();
  const router = useRouter();
  const isSold = product.status === "sold";
  const detailHref = `/post/${product.id}`;

  return (
    <Link
      href={detailHref}
      onPointerEnter={() => void router.prefetch(detailHref)}
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
      <div
        data-ui4-slot="photos"
        className="relative h-[100px] w-[100px] shrink-0 overflow-hidden rounded-ui-rect bg-sam-surface-muted"
      >
        <SamarketThumbnail
          src={product.thumbnail}
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
      <div className="flex min-h-[100px] min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col justify-between">
          <p data-ui4-slot="price" className={`${stripPostListBlockTopMargin(POST_LIST_PRICE_CLASS)} shrink-0`}>
            {formatPrice(product.price)}
          </p>
          <p data-ui4-slot="title" className={`${stripPostListBlockTopMargin(POST_LIST_TITLE_CLASS)} shrink-0`}>
            {product.title}
          </p>
          {product.hasPromotionOverlay ? (
            <span
              data-ui4-slot="promo"
              className="inline-block w-fit shrink-0 rounded bg-sam-app px-1 py-0.5 text-[10px] font-medium text-sam-muted"
            >
              {safeT("trade_promo_badge", {
                fallbackKo: "홍보",
                fallbackEn: "Promoted",
              })}
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
  );
}
