"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { PostWithMeta } from "@/lib/posts/schema";
import { getAppSettings } from "@/lib/app-settings";
import { buildPostListPreviewModel } from "@/lib/posts/post-list-preview-model";
import { PostListPreviewColumn } from "@/components/post/PostListPreviewColumn";
import { formatPrice } from "@/lib/utils/format";

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

function PostMiniCard({ item }: { item: PostWithMeta }) {
  const thumb = itemThumb(item);
  const app = getAppSettings();
  const preview = buildPostListPreviewModel(item as unknown as Record<string, unknown>, {
    currency: app.defaultCurrency || "KRW",
    locale: app.defaultLocale || "ko-KR",
  });

  return (
    <Link
      href={`/post/${encodeURIComponent(item.id)}`}
      className="block overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface"
    >
      <div className="relative aspect-square bg-sam-app">
        {thumb ? (
          <img
            src={thumb}
            alt=""
            width={320}
            height={320}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            fetchPriority="low"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[12px] text-sam-muted">이미지</div>
        )}
      </div>
      <div className="space-y-1 px-2.5 py-2.5">
        {preview ? (
          <PostListPreviewColumn listingPost={item} preview={preview} />
        ) : (
          <p className="line-clamp-2 min-h-[34px] text-[13px] font-medium text-sam-fg">{item.title}</p>
        )}
      </div>
    </Link>
  );
}

function chunkPosts(rows: PostWithMeta[], size: number): PostWithMeta[][] {
  const out: PostWithMeta[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    out.push(rows.slice(i, i + size));
  }
  return out;
}

function PostAdCompactCard({ item }: { item: PostWithMeta }) {
  const thumb = itemThumb(item);
  const currency = getAppSettings().defaultCurrency || "KRW";
  const priceText =
    item.is_free_share === true
      ? "무료나눔"
      : item.price != null
        ? formatPrice(item.price, currency)
        : "가격 문의";

  return (
    <Link href={`/post/${encodeURIComponent(item.id)}`} className="block min-w-0 rounded-ui-rect">
      <div className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface">
        <div className="aspect-square bg-sam-app">
          {thumb ? (
            <img
              src={thumb}
              alt=""
              width={320}
              height={320}
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
              fetchPriority="low"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[11px] text-sam-muted">이미지</div>
          )}
        </div>
      </div>
      <p className="mt-1.5 line-clamp-2 text-[12px] font-medium leading-tight text-sam-fg">{item.title}</p>
      <p className="mt-0.5 text-[11px] text-sam-muted">파트너 · 광고</p>
      <p className="text-[16px] font-bold leading-tight text-sam-fg">{priceText}</p>
    </Link>
  );
}

function RelatedAdsCarouselSection({ items }: { items: PostWithMeta[] }) {
  const pages = useMemo(() => chunkPosts(items, 6), [items]);
  const [page, setPage] = useState(0);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const personalTitle = useMemo(() => {
    const nick = (items[0]?.author_nickname ?? "").trim();
    return nick ? `${nick}님을 위한 새 상품 · 광고` : "당신을 위한 새 상품 · 광고";
  }, [items]);

  if (items.length === 0) return null;

  return (
    <section className="px-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-[26px] font-extrabold tracking-[-0.02em] text-sam-fg">{personalTitle}</h3>
          <span
            className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-sam-border text-[10px] text-sam-muted"
            aria-label="광고 안내"
            title="광고 상품 영역"
          >
            i
          </span>
        </div>
        {pages.length > 1 ? (
          <button
            type="button"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-sam-border text-sam-muted"
            aria-label="다음 광고 페이지"
            onClick={() => {
              const next = (page + 1) % pages.length;
              const el = scrollerRef.current;
              if (!el) return;
              el.scrollTo({ left: el.clientWidth * next, behavior: "smooth" });
              setPage(next);
            }}
          >
            ›
          </button>
        ) : null}
      </div>
      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1"
        onScroll={(e) => {
          const el = e.currentTarget;
          const idx = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
          setPage(Math.max(0, Math.min(pages.length - 1, idx)));
        }}
      >
        {pages.map((rows, idx) => (
          <div key={`page-${idx}`} className="w-full shrink-0 snap-start">
            <div className="grid grid-cols-3 gap-x-2.5 gap-y-3">
              {rows.map((item) => (
                <PostAdCompactCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        ))}
      </div>
      {pages.length > 1 ? (
        <div className="mt-2 flex items-center justify-center gap-1.5">
          {pages.map((_, idx) => (
            <button
              key={`dot-${idx}`}
              type="button"
              className={`h-2 w-2 rounded-full ${idx === page ? "bg-signature" : "bg-sam-border"}`}
              aria-label={`광고 페이지 ${idx + 1}`}
              onClick={() => {
                const el = scrollerRef.current;
                if (!el) return;
                el.scrollTo({
                  left: el.clientWidth * idx,
                  behavior: "smooth",
                });
                setPage(idx);
              }}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function RelatedGridSection({
  title,
  items,
}: {
  title: string;
  items: PostWithMeta[];
}) {
  if (items.length === 0) return null;
  return (
    <section className="px-4">
      <h3 className="mb-3 text-[22px] font-extrabold tracking-[-0.02em] text-sam-fg">{title}</h3>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {items.map((item) => (
          <PostMiniCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

export function PostDetailRelatedSections({ sellerItems, similarItems, ads }: RelatedProps) {
  return (
    <div className="space-y-7 py-5">
      <RelatedGridSection title="판매자의 다른 물품" items={sellerItems} />
      <RelatedAdsCarouselSection items={ads} />
      <RelatedGridSection title="보고 있는 물품과 비슷한 물품" items={similarItems} />
    </div>
  );
}
