"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay/DibayBottomSheet";
import { TradeSellCtaContent } from "@/components/trade/TradeSellCta";
import { TradeTopicBadge } from "@/components/trade/TradeTopicBadge";
import { TradeNoPhotoPlaceholder } from "@/components/trade/media/TradeNoPhotoPlaceholder";
import { getAppSettings } from "@/lib/app-settings";
import { formatPrice } from "@/lib/utils/format";
import { TRADE_FEED_THUMB_BOX_CLASS } from "@/lib/posts/trade-feed-layout-classes";
import { TRADE_FEED_LIST_WRAP_CLASS } from "@/lib/philife/philife-flat-ui-classes";
import { useTradeTopicBadge } from "@/lib/trade/topic-badge-store";
import {
  TRADE_SHOWCASE_PAGE_SIZE,
  type TradeShowcaseItem,
} from "@/lib/trade/showcase/trade-showcase-model";

/**
 * 거래 샘플 상품 (Owner 2026-10-28 승인 「샘플 섞기」).
 * 샘플은 `trade_showcase_items`(posts 와 분리)에서만 온다 — 찜·채팅·신고·⋮ 메뉴 없음.
 * - 카드 = 실제 글 카드와 같은 모양 + 오른쪽 위 「샘플」 표시, 누르면 안내 시트 + 「판매하기」.
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
  const { t, language } = useI18n();
  const topicBadge = useTradeTopicBadge(item.trade_category_id);
  const currency = getAppSettings().defaultCurrency ?? "PHP";
  const photo = item.image_urls[0] ?? "";
  return (
    <button
      type="button"
      data-trade-showcase-card="1"
      onClick={() => onOpen(item)}
      className="flex w-full min-w-0 flex-col text-left active:opacity-90"
      aria-label={`${t("trade_showcase_badge")} · ${item.title}`}
    >
      <div className={TRADE_FEED_THUMB_BOX_CLASS}>
        {photo ? (
          <SamarketThumbnail
            src={photo}
            fill
            loadingStyle="shimmer"
            roundedClassName="rounded-ui-rect"
            className="pointer-events-none bg-sam-surface-muted"
            fallbackSrc=""
          />
        ) : (
          <TradeNoPhotoPlaceholder />
        )}
        <span className="pointer-events-none absolute right-1.5 top-1.5 z-[1] rounded-ui-rect bg-sam-surface-dark/75 px-1.5 py-0.5 text-[11px] font-semibold text-white">
          {t("trade_showcase_card_badge")}
        </span>
        {topicBadge ? (
          <span className="pointer-events-none absolute bottom-1.5 left-1.5 z-[1] max-w-[70%]">
            <TradeTopicBadge
              label={language === "en" && topicBadge.labelEn ? topicBadge.labelEn : topicBadge.label}
              color={topicBadge.color}
            />
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 w-full truncate text-[15px] font-bold text-sam-fg">
        {item.price != null ? formatPrice(item.price, currency) : item.price_note ?? " "}
        {item.price != null && item.price_note ? (
          <span className="ml-1 text-[12px] font-medium text-sam-muted">/{item.price_note}</span>
        ) : null}
      </p>
      <p className="w-full truncate text-[14px] text-sam-fg">{item.title}</p>
      {item.region_label ? (
        <p className="flex w-full min-w-0 items-center gap-0.5 truncate text-[12px] text-sam-muted">
          <MapPin className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
          <span className="truncate">{item.region_label}</span>
        </p>
      ) : null}
    </button>
  );
}

export function TradeShowcaseSheet({ item, onClose }: { item: TradeShowcaseItem | null; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <DibayBottomSheet open={item != null} onClose={onClose} title={item?.title ?? ""}>
      {item ? (
        <div className="flex flex-col gap-3 px-4 pb-2" data-trade-showcase-sheet="1">
          {item.image_urls[0] ? (
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-ui-rect bg-sam-surface-muted">
              <SamarketThumbnail src={item.image_urls[0]} fill loadingStyle="shimmer" roundedClassName="rounded-ui-rect" fallbackSrc="" />
            </div>
          ) : null}
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

/**
 * 샘플 그리드 — 실제 글이 없을 때 목록 자리, 또는 실제 글을 끝까지 본 뒤 남은 샘플.
 * 한 번에 `TRADE_SHOWCASE_PAGE_SIZE` 개, 「더보기」로 이어서 보인다.
 */
export function TradeShowcaseGrid({ items, onOpen }: { items: TradeShowcaseItem[]; onOpen: (item: TradeShowcaseItem) => void }) {
  const { safeT } = useI18n();
  const [visible, setVisible] = useState(TRADE_SHOWCASE_PAGE_SIZE);
  if (items.length === 0) return null;
  const shown = items.slice(0, visible);
  return (
    <div data-trade-showcase-grid="1">
      <ul className={`min-w-0 w-full max-w-full ${TRADE_FEED_LIST_WRAP_CLASS}`}>
        {shown.map((item) => (
          <li key={item.id} className="min-w-0">
            <TradeShowcaseCard item={item} onOpen={onOpen} />
          </li>
        ))}
      </ul>
      {visible < items.length ? (
        <div className="flex justify-center border-t border-sam-border-soft bg-sam-app px-4 py-4">
          <button
            type="button"
            data-trade-showcase-more="1"
            onClick={() => setVisible((v) => v + TRADE_SHOWCASE_PAGE_SIZE)}
            className="min-h-11 rounded-ui-rect border border-sam-border bg-sam-surface px-6 text-[14px] font-semibold text-sam-fg"
          >
            {safeT("cm_trade_chat_list_load_more", { fallbackKo: "더보기", fallbackEn: "Load more" })}
          </button>
        </div>
      ) : null}
    </div>
  );
}
