"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { beginRouteEntryPerf } from "@/lib/runtime/samarket-runtime-debug";

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
  const router = useRouter();
  const product = getProductById(record.productId);
  const sourceLabel = SOURCE_LABELS[record.source];

  if (!product) return null;
  const detailHref = `/post/${record.productId}`;

  return (
    <Link
      href={detailHref}
      onPointerEnter={() => void router.prefetch(detailHref)}
      onFocus={() => void router.prefetch(detailHref)}
      onClick={() => beginRouteEntryPerf("product_detail", detailHref)}
      className="flex gap-3 rounded-ui-rect bg-sam-surface p-3"
    >
      <div className="h-[100px] w-[100px] shrink-0 overflow-hidden rounded-ui-rect bg-sam-surface-muted">
        {product.thumbnail ? (
          <img
            src={product.thumbnail}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-sam-border-soft" />
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
