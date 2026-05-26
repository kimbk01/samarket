"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PostWithMeta } from "@/lib/posts/schema";
import { getAppSettings } from "@/lib/app-settings";
import { buildPostListPreviewModel } from "@/lib/posts/post-list-preview-model";
import { PostListPreviewColumn } from "@/components/post/PostListPreviewColumn";
import { formatPrice } from "@/lib/utils/format";
import { beginRouteEntryPerf } from "@/lib/runtime/samarket-runtime-debug";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";

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
  const { t } = useI18n();
  const router = useRouter();
  const thumb = itemThumb(item);
  const app = getAppSettings();
  const preview = buildPostListPreviewModel(item as unknown as Record<string, unknown>, {
    currency: app.defaultCurrency || "KRW",
    locale: app.defaultLocale || "ko-KR",
  });

  const detailHref = `/post/${encodeURIComponent(item.id)}`;
  return (
    <Link
      href={detailHref}
      onPointerEnter={() => void router.prefetch(detailHref)}
      onFocus={() => void router.prefetch(detailHref)}
      onClick={() => beginRouteEntryPerf("product_detail", detailHref)}
      className="block overflow-hidden rounded-md border border-[#ccd0d5] bg-white"
    >
      <div className="relative aspect-square bg-sam-app">
        <SamarketThumbnail
          src={thumb}
          fill
          roundedClassName="rounded-none"
          className="bg-sam-app"
          fallbackSrc=""
          fallbackNode={
            <div className="flex h-full w-full items-center justify-center sam-text-helper text-sam-muted">
              {t("ui_product_gallery_fallback")}
            </div>
          }
        />
      </div>
      <div className="space-y-1 px-2.5 py-2.5">
        {preview ? (
          <PostListPreviewColumn listingPost={item} preview={preview} />
        ) : (
          <p className="line-clamp-2 min-h-[34px] sam-text-body-secondary font-medium text-sam-fg">{item.title}</p>
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
  const { t } = useI18n();
  const router = useRouter();
  const thumb = itemThumb(item);
  const currency = getAppSettings().defaultCurrency || "KRW";
  const priceText =
    item.is_free_share === true
      ? "무료나눔"
      : item.price != null
        ? formatPrice(item.price, currency)
        : "가격 문의";

  const detailHref = `/post/${encodeURIComponent(item.id)}`;
  return (
    <Link
      href={detailHref}
      onPointerEnter={() => void router.prefetch(detailHref)}
      onFocus={() => void router.prefetch(detailHref)}
      onClick={() => beginRouteEntryPerf("product_detail", detailHref)}
      className="block min-w-0 rounded-ui-rect"
    >
      <div className="overflow-hidden rounded-md border border-[#ccd0d5] bg-white">
        <div className="relative aspect-square bg-sam-app">
          <SamarketThumbnail
            src={thumb}
            fill
            roundedClassName="rounded-none"
            className="bg-sam-app"
            fallbackSrc=""
            fallbackNode={
              <div className="flex h-full w-full items-center justify-center sam-text-xxs text-sam-muted">
                {t("ui_product_gallery_fallback")}
              </div>
            }
          />
        </div>
      </div>
      <p className="mt-1.5 line-clamp-2 sam-text-helper font-medium leading-tight text-sam-fg">{item.title}</p>
      <p className="mt-0.5 sam-text-xxs text-sam-muted">{t("ui_post_related_partner_ad")}</p>
      <p className="sam-text-body-lg font-bold leading-tight text-sam-fg">{priceText}</p>
    </Link>
  );
}

function RelatedAdsCarouselSection({ items }: { items: PostWithMeta[] }) {
  const { t } = useI18n();
  const pages = useMemo(() => chunkPosts(items, 6), [items]);
  const [page, setPage] = useState(0);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const personalTitle = useMemo(() => {
    const nick = (items[0]?.author_nickname ?? "").trim();
    return nick ? `${nick}님을 위한 새 상품 · 광고` : "당신을 위한 새 상품 · 광고";
  }, [items]);

  if (items.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-[13px] font-bold leading-tight text-[#050505]">{personalTitle}</h3>
          <span
            className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-sam-border sam-text-xxs text-sam-muted"
            aria-label={t("ui_post_ad_info_aria")}
            title={t("ui_post_ad_product_area_title")}
          >
            i
          </span>
        </div>
        {pages.length > 1 ? (
          <button
            type="button"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-sam-border text-sam-muted"
            aria-label={t("ui_post_ad_next_page_aria")}
            onClick={() => {
              const next = (page + 1) % pages.length;
              const el = scrollerRef.current;
              if (!el) return;
              el.scrollTo({ left: el.clientWidth * next, behavior: "smooth" });
              setPage((prev) => (prev === next ? prev : next));
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
          const next = Math.max(0, Math.min(pages.length - 1, idx));
          setPage((prev) => (prev === next ? prev : next));
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
                setPage((prev) => (prev === idx ? prev : idx));
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
    <section>
      <h3 className="mb-3 text-[13px] font-bold leading-tight text-[#050505]">{title}</h3>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {items.map((item) => (
          <PostMiniCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

/** 거래 상세 하단 연관 영역 — FB형 연속 블록과 맞춤 */
const RELATED_STACK_CARD_CLASS = "border-t border-[#e4e6eb] bg-white";

export function PostDetailRelatedSections({ sellerItems, similarItems, ads }: RelatedProps) {
  const { t } = useI18n();
  if (sellerItems.length === 0 && similarItems.length === 0 && ads.length === 0) {
    return null;
  }

  return (
    <div className={RELATED_STACK_CARD_CLASS}>
      <div className="space-y-6 px-3 py-4 sm:px-4">
        <RelatedGridSection title={t("ui_post_related_seller_items")} items={sellerItems} />
        <RelatedAdsCarouselSection items={ads} />
        <RelatedGridSection title={t("ui_post_related_similar_items")} items={similarItems} />
      </div>
    </div>
  );
}
