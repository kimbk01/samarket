"use client";

import Link from "next/link";
import type { HomeFeedItem } from "@/lib/types/home-feed";
import type { Product } from "@/lib/types/product";
import { formatPrice } from "@/lib/utils/format";
import { ProductCard } from "@/components/product/ProductCard";
import {
  POST_LIST_META_LINE_CLASS,
  POST_LIST_META_TEXT_CLASS,
  POST_LIST_PRICE_CLASS,
  POST_LIST_TITLE_CLASS,
  stripPostListBlockTopMargin,
} from "@/lib/posts/post-list-preview-model";

interface HomeFeedCardProps {
  item: HomeFeedItem;
  product?: Product | null;
}

export function HomeFeedCard({ item, product }: HomeFeedCardProps) {
  if (product) {
    return (
      <div className="relative">
        {item.itemType === "sponsored" && (
          <span className="absolute left-1 top-1 z-[1] rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
            광고
          </span>
        )}
        <ProductCard product={product} />
      </div>
    );
  }

  return (
    <div>
      <Link
        href={`/products/${item.targetId}`}
        className="flex gap-3 rounded-ui-rect bg-white p-3"
      >
        <div className="h-[100px] w-[100px] shrink-0 overflow-hidden rounded-ui-rect bg-gray-100">
          {item.thumbnail ? (
            <img
              src={item.thumbnail}
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
              {item.title}
            </p>
            <p className={`${stripPostListBlockTopMargin(POST_LIST_PRICE_CLASS)} shrink-0`}>
              {formatPrice(item.price)}
            </p>
            <div className="flex shrink-0 flex-col">
              <p className={stripPostListBlockTopMargin(POST_LIST_META_TEXT_CLASS)}>
                {item.locationLabel}
              </p>
              {item.reasonLabel ? (
                <p className={POST_LIST_META_LINE_CLASS}>{item.reasonLabel}</p>
              ) : null}
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}
