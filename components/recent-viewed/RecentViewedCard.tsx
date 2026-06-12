"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { RecentViewedProduct } from "@/lib/types/recommendation";
import { formatPrice, formatTimeAgo } from "@/lib/utils/format";
import {
  POST_LIST_META_LINE_CLASS,
  POST_LIST_META_TEXT_CLASS,
  POST_LIST_PRICE_CLASS,
  POST_LIST_TITLE_CLASS,
  stripPostListBlockTopMargin,
} from "@/lib/posts/post-list-preview-model";
import { beginRouteEntryPerf } from "@/lib/runtime/samarket-runtime-debug";

const SOURCE_LABEL_KEY: Record<
  RecentViewedProduct["source"],
  | "ui_recent_source_home"
  | "ui_recent_source_search"
  | "ui_recent_source_chat"
  | "ui_recent_source_recommendation"
  | "ui_recent_source_shop"
> = {
  home: "ui_recent_source_home",
  search: "ui_recent_source_search",
  chat: "ui_recent_source_chat",
  recommendation: "ui_recent_source_recommendation",
  shop: "ui_recent_source_shop",
};

type PostPreview = {
  title: string;
  price: number;
  location: string;
  thumbnail: string;
};

interface RecentViewedCardProps {
  record: RecentViewedProduct;
}

export function RecentViewedCard({ record }: RecentViewedCardProps) {
  const { t } = useI18n();
  const router = useRouter();
  const sourceLabel = t(SOURCE_LABEL_KEY[record.source]);
  const [preview, setPreview] = useState<PostPreview | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/posts/${encodeURIComponent(record.productId)}/detail`, {
      credentials: "include",
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((j: { post?: { title?: string; price?: number | null; region?: string | null; city?: string | null; barangay?: string | null; thumbnail_url?: string | null; images?: string[] | null } }) => {
        if (cancelled || !j.post) return;
        const p = j.post;
        setPreview({
          title: p.title?.trim() || t("common_content_unavailable"),
          price: p.price ?? 0,
          location: [p.region, p.city, p.barangay].filter(Boolean).join(" · "),
          thumbnail: p.thumbnail_url ?? p.images?.[0] ?? "",
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [record.productId, t]);

  if (!preview) return null;
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
        {preview.thumbnail ? (
          <img
            src={preview.thumbnail}
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
            {preview.title}
          </p>
          <p className={`${stripPostListBlockTopMargin(POST_LIST_PRICE_CLASS)} shrink-0`}>
            {formatPrice(preview.price)}
          </p>
          <div className="flex shrink-0 flex-col">
            <p className={stripPostListBlockTopMargin(POST_LIST_META_TEXT_CLASS)}>
              {preview.location}
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
