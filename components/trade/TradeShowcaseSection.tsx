"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay/DibayBottomSheet";
import { TradeSellCtaContent } from "@/components/trade/TradeSellCta";
import { getAppSettings } from "@/lib/app-settings";
import { TRADE_FEED_LIST_WRAP_CLASS } from "@/lib/philife/philife-flat-ui-classes";
import { PostCard } from "@/components/post/PostCard";
import { buildPostListPreviewModel } from "@/lib/posts/post-list-preview-model";
import { resolveTradeCardCityAreaLine } from "@/lib/posts/post-listing-location-label";
import { useTradeListCompositionMap } from "@/lib/trade/category-form/use-trade-list-composition-map";
import { tradeShowcaseItemToPost } from "@/lib/trade/showcase/trade-showcase-post";
import {
  TRADE_SHOWCASE_PAGE_SIZE,
  type TradeShowcaseItem,
} from "@/lib/trade/showcase/trade-showcase-model";

/**
 * 거래 샘플 상품 (Owner 2026-10-28 승인 「샘플 섞기」).
 * 샘플은 `trade_showcase_items`(posts 와 분리)에서만 온다 — 찜·채팅·신고·⋮ 메뉴 없음.
 * - 카드 = 실제 글 카드(PostCard) 그대로 + 오른쪽 위 「샘플」 표시, 누르면 안내 시트 + 「판매하기」.
 * - 목록에 섞는 규칙: `planTradeShowcaseInterleave`. 검색 결과에는 넣지 않는다(호출부 조건).
 */

const itemsCache = new Map<string, TradeShowcaseItem[]>();

/** 주제별 샘플 — 같은 주제는 한 번만 받는다(목록이 다시 그려져도 다시 요청하지 않음) */
export function useTradeShowcaseItems(category: string | null, enabled: boolean): TradeShowcaseItem[] {
  const key = (category ?? "").trim();
  const [items, setItems] = useState<TradeShowcaseItem[]>(() => itemsCache.get(key) ?? []);

  useEffect(() => {
    if (!enabled) return;
    const cached = itemsCache.get(key);
    if (cached) {
      setItems(cached);
      return;
    }
    let cancelled = false;
    const qs = key ? `?category=${encodeURIComponent(key)}` : "";
    void fetch(`/api/trade/showcase${qs}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { ok?: boolean; items?: TradeShowcaseItem[] } | null) => {
        const list = Array.isArray(data?.items) ? data!.items! : [];
        itemsCache.set(key, list);
        if (!cancelled) setItems(list);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [key, enabled]);

  return enabled ? items : [];
}

export function TradeShowcaseCard({ item, onOpen }: { item: TradeShowcaseItem; onOpen: (item: TradeShowcaseItem) => void }) {
  const { propsForCategoryId } = useTradeListCompositionMap();
  const post = useMemo(() => tradeShowcaseItemToPost(item), [item]);
  const composition = propsForCategoryId(post.category_id);
  /** 실제 글 카드(PostCard) 그대로 — 가격 줄·영문 지역·주제 배지가 실제 글과 같은 규칙. 누르면 샘플 안내 */
  return (
    <div data-trade-showcase-card="1" className="min-w-0">
      <PostCard
        post={post}
        skinKey={composition?.skinKey}
        categorySlug={composition?.categorySlug}
        fieldComposition={composition?.fieldComposition}
        showcase={{ onOpen: () => onOpen(item) }}
      />
    </div>
  );
}

export function TradeShowcaseSheet({ item, onClose }: { item: TradeShowcaseItem | null; onClose: () => void }) {
  const { t, language } = useI18n();
  const { propsForCategoryId } = useTradeListCompositionMap();
  const post = useMemo(() => (item ? tradeShowcaseItemToPost(item) : null), [item]);
  const composition = post ? propsForCategoryId(post.category_id) : null;
  const preview = post
    ? buildPostListPreviewModel(post as unknown as Record<string, unknown>, {
        currency: getAppSettings().defaultCurrency || "PHP",
        locale: language,
        skinKey: composition?.skinKey,
        categorySlug: composition?.categorySlug,
        fieldComposition: composition?.fieldComposition,
      })
    : null;
  const locationLine = post
    ? resolveTradeCardCityAreaLine({ tradeLguId: post.trade_lgu_id, region: post.region, city: post.city })
    : null;
  return (
    <DibayBottomSheet open={item != null} onClose={onClose} title={item?.title ?? ""}>
      {item ? (
        <div className="flex flex-col gap-3 px-4 pb-2" data-trade-showcase-sheet="1">
          {item.image_urls[0] ? (
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-ui-rect bg-sam-surface-muted">
              <SamarketThumbnail src={item.image_urls[0]} fill loadingStyle="shimmer" roundedClassName="rounded-ui-rect" fallbackSrc="" />
            </div>
          ) : null}
          <div className="flex flex-col gap-0.5">
            {preview?.feedPrice?.trim() ? (
              <p className="text-[17px] font-bold text-sam-fg">{preview.feedPrice.trim()}</p>
            ) : null}
            {preview?.feedTitle?.trim() && preview.feedTitle.trim() !== item.title ? (
              <p className="text-[14px] text-sam-fg">{preview.feedTitle.trim()}</p>
            ) : null}
            {locationLine ? (
              <p className="flex items-center gap-1 text-[13px] text-sam-muted">
                <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                {locationLine}
              </p>
            ) : null}
          </div>
          <p className="rounded-ui-rect bg-sam-surface-muted px-3 py-2.5 text-[14px] font-medium text-sam-fg">
            {t("trade_showcase_sheet_note")}
          </p>
          {item.description ? (
            <p className="whitespace-pre-line text-[14px] leading-6 text-sam-fg">{item.description}</p>
          ) : null}
          <Link
            href="/market/sell"
            className="flex h-12 items-center justify-center gap-2 rounded-ui-rect bg-sam-primary text-[15px] font-semibold text-sam-on-primary"
          >
            <TradeSellCtaContent />
          </Link>
        </div>
      ) : null}
    </DibayBottomSheet>
  );
}

/** 남은 샘플을 12개씩 보이기 — 실제 글 목록과 같은 그리드 안에 이어 붙일 때 쓴다 */
export function useTradeShowcasePaging(items: TradeShowcaseItem[]) {
  const [visible, setVisible] = useState(TRADE_SHOWCASE_PAGE_SIZE);
  return {
    shown: items.slice(0, visible),
    hasMore: visible < items.length,
    more: () => setVisible((v) => v + TRADE_SHOWCASE_PAGE_SIZE),
  };
}

export function TradeShowcaseMoreButton({ onClick }: { onClick: () => void }) {
  const { safeT } = useI18n();
  return (
    <div className="flex justify-center border-t border-sam-border-soft bg-sam-app px-4 py-4">
      <button
        type="button"
        data-trade-showcase-more="1"
        onClick={onClick}
        className="min-h-11 rounded-ui-rect border border-sam-border bg-sam-surface px-6 text-[14px] font-semibold text-sam-fg"
      >
        {safeT("cm_trade_chat_list_load_more", { fallbackKo: "더보기", fallbackEn: "Load more" })}
      </button>
    </div>
  );
}

/**
 * 샘플 그리드 — 실제 글이 없을 때 목록 자리.
 * 한 번에 `TRADE_SHOWCASE_PAGE_SIZE` 개, 「더보기」로 이어서 보인다.
 */
export function TradeShowcaseGrid({ items, onOpen }: { items: TradeShowcaseItem[]; onOpen: (item: TradeShowcaseItem) => void }) {
  const paging = useTradeShowcasePaging(items);
  if (items.length === 0) return null;
  return (
    <div data-trade-showcase-grid="1">
      <ul className={`min-w-0 w-full max-w-full ${TRADE_FEED_LIST_WRAP_CLASS}`}>
        {paging.shown.map((item) => (
          <li key={item.id} className="min-w-0">
            <TradeShowcaseCard item={item} onOpen={onOpen} />
          </li>
        ))}
      </ul>
      {paging.hasMore ? <TradeShowcaseMoreButton onClick={paging.more} /> : null}
    </div>
  );
}
