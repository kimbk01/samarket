"use client";

import { getAppSettings } from "@/lib/admin-settings/app-settings-client";
import { buildPostListPreviewModel } from "@/lib/posts/post-list-preview-model";
import type { Product } from "@/lib/types/product";
import { formatPrice } from "@/lib/utils/format";

/**
 * 가로형 카드(검색·내 상품) 가격 줄 — 그리드 피드 `PostCard` 와 같은 모델·같은 앱 통화 (TM-09).
 * 나눔은 「무료나눔」, 부동산·렌터카·구인 등은 카테고리별 가격 표기.
 */
export function tradeCardPriceLabel(product: Pick<Product, "price" | "listPreviewSource">): string {
  const settings = getAppSettings();
  const currency = settings.defaultCurrency || "KRW";
  if (product.listPreviewSource) {
    const model = buildPostListPreviewModel(product.listPreviewSource as Record<string, unknown>, {
      currency,
      locale: settings.defaultLocale || "ko-KR",
    });
    if (model?.feedPrice) return model.feedPrice;
  }
  return formatPrice(product.price, currency);
}
