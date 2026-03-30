"use client";

import Link from "next/link";
import type { RecentViewedProduct } from "@/lib/types/recommendation";
import { getProductById } from "@/lib/mock-products";
import { formatPrice, formatTimeAgo } from "@/lib/utils/format";
import {
  POST_LIST_META_LINE_CLASS,
  POST_LIST_META_TEXT_CLASS,
  POST_LIST_PRICE_CLASS,
  POST_LIST_TITLE_CLASS,
  stripPostListBlockTopMargin,
} from "@/lib/posts/post-list-preview-model";

const SOURCE_LABELS: Record<RecentViewedProduct["source"], string> = {
  home: "홈",
  search: "검색",
  chat: "채팅",
  recommendation: "추천",
  shop: "상점",
};

interface RecentViewedCardProps {
  record: RecentViewedProduct;
}

export function RecentViewedCard({ record }: RecentViewedCardProps) {
  const product = getProductById(record.productId);
  const sourceLabel = SOURCE_LABELS[record.source];

  if (!product) return null;

  return (
    <Link
      href={`/products/${record.productId}`}
      className="flex gap-3 rounded-lg bg-white p-3"
    >
      <div className="h-[100px] w-[100px] shrink-0 overflow-hidden rounded-md bg-gray-100">
        {product.thumbnail ? (
          <img
            src={product.thumbnail}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-gray-200" />
        )}
      </div>
      <div className="flex min-h-[100px] min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col justify-between">
          <p className={`${stripPostListBlockTopMargin(POST_LIST_TITLE_CLASS)} shrink-0`}>
            {product.title}
          </p>
          <p className={`${stripPostListBlockTopMargin(POST_LIST_PRICE_CLASS)} shrink-0`}>
            {formatPrice(product.price)}
          </p>
          <div className="flex shrink-0 flex-col">
            <p className={stripPostListBlockTopMargin(POST_LIST_META_TEXT_CLASS)}>
              {product.location}
            </p>
            <p className={POST_LIST_META_LINE_CLASS}>
              {sourceLabel}
              {record.sectionKey ? ` · ${record.sectionKey}` : ""} ·{" "}
              {formatTimeAgo(record.viewedAt)}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}
