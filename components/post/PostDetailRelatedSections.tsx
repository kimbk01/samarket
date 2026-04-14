"use client";

import Link from "next/link";
import type { PostWithMeta } from "@/lib/posts/schema";
import { formatPrice } from "@/lib/utils/format";
import { getAppSettings } from "@/lib/app-settings";

type RelatedProps = {
  sellerItems: PostWithMeta[];
  similarItems: PostWithMeta[];
  ads: PostWithMeta[];
};

function itemThumb(item: PostWithMeta): string | null {
  if (typeof item.thumbnail_url === "string" && item.thumbnail_url.trim()) {
    return item.thumbnail_url.trim();
  }
  const firstImage = Array.isArray(item.images)
    ? item.images.find((u): u is string => typeof u === "string" && u.trim().length > 0)
    : null;
  return firstImage ?? null;
}

function PostMiniCard({ item, adBadge }: { item: PostWithMeta; adBadge?: boolean }) {
  const thumb = itemThumb(item);
  const currency = getAppSettings().defaultCurrency || "KRW";
  const priceText =
    item.is_free_share === true
      ? "무료나눔"
      : item.price != null
        ? formatPrice(item.price, currency)
        : "";

  return (
    <Link
      href={`/post/${encodeURIComponent(item.id)}`}
      className="block overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface"
    >
      <div className="relative aspect-square bg-sam-app">
        {thumb ? (
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[12px] text-sam-muted">이미지</div>
        )}
        {adBadge ? (
          <span className="absolute left-2 top-2 rounded bg-black/65 px-1.5 py-0.5 text-[11px] font-medium text-white">
            광고
          </span>
        ) : null}
      </div>
      <div className="space-y-1 px-2.5 py-2.5">
        <p className="line-clamp-2 min-h-[34px] text-[13px] font-medium text-sam-fg">{item.title}</p>
        <p className="text-[14px] font-semibold text-sam-fg">{priceText}</p>
      </div>
    </Link>
  );
}

function RelatedGridSection({
  title,
  items,
  adBadge,
}: {
  title: string;
  items: PostWithMeta[];
  adBadge?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section className="px-4">
      <h3 className="mb-3 text-[22px] font-extrabold tracking-[-0.02em] text-sam-fg">{title}</h3>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {items.map((item) => (
          <PostMiniCard key={item.id} item={item} adBadge={adBadge} />
        ))}
      </div>
    </section>
  );
}

export function PostDetailRelatedSections({ sellerItems, similarItems, ads }: RelatedProps) {
  return (
    <div className="space-y-7 py-5">
      <RelatedGridSection title="판매자의 다른 물품" items={sellerItems} />
      <RelatedGridSection title="새 상품 · 광고" items={ads} adBadge />
      <RelatedGridSection title="보고 있는 물품과 비슷한 물품" items={similarItems} />
    </div>
  );
}
