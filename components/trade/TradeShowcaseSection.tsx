"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay/DibayBottomSheet";
import { TradeSellCtaContent } from "@/components/trade/TradeSellCta";
import { getAppSettings } from "@/lib/app-settings";
import { formatPrice } from "@/lib/utils/format";
import { TRADE_FEED_PRODUCT_GRID_CLASS } from "@/lib/posts/trade-feed-layout-classes";
import type { TradeShowcaseItem } from "@/lib/trade/showcase/trade-showcase-model";

/**
 * P-7 (2026-10-27) 「예시로 둘러보기」 — 실제 거래 글이 적을 때 목록 아래에 샘플 상품을 보인다.
 * 샘플은 `trade_showcase_items`(posts 와 분리)에서만 온다: 찜·채팅·신고·⋮ 메뉴 없음,
 * 카드마다 「샘플 · 거래 불가」 배지, 누르면 안내 시트 + 「판매하기」. 검색 결과에는 넣지 않는다(호출부 조건).
 */
export function TradeShowcaseSection({ categorySlug }: { categorySlug: string | null }) {
  const { t } = useI18n();
  const [items, setItems] = useState<TradeShowcaseItem[] | null>(null);
  const [open, setOpen] = useState<TradeShowcaseItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    const qs = categorySlug ? `?category=${encodeURIComponent(categorySlug)}` : "";
    void fetch(`/api/trade/showcase${qs}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { ok?: boolean; items?: TradeShowcaseItem[] } | null) => {
        if (!cancelled) setItems(Array.isArray(data?.items) ? data!.items! : []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [categorySlug]);

  if (!items || items.length === 0) return null;
  const currency = getAppSettings().defaultCurrency ?? "PHP";

  return (
    <section data-trade-showcase="true" className="mt-6 border-t border-sam-border-soft px-3 pb-6 pt-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-[16px] font-bold text-sam-fg">{t("trade_showcase_section_title")}</h2>
        <span className="text-[12px] text-sam-muted">{t("trade_showcase_section_hint")}</span>
      </div>
      <ul className={`m-0 list-none p-0 ${TRADE_FEED_PRODUCT_GRID_CLASS}`}>
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => setOpen(item)}
              className="flex w-full min-w-0 flex-col gap-1 text-left active:opacity-90"
              aria-label={`${t("trade_showcase_badge")} · ${item.title}`}
            >
              <div className="relative aspect-square w-full overflow-hidden rounded-ui-rect bg-sam-surface-muted">
                {item.image_urls[0] ? (
                  <SamarketThumbnail src={item.image_urls[0]} fill roundedClassName="rounded-ui-rect" fallbackSrc="" />
                ) : (
                  <div className="flex h-full items-center justify-center text-[12px] text-sam-muted">
                    {t("trade_showcase_no_photo")}
                  </div>
                )}
                <span className="absolute left-1.5 top-1.5 rounded-ui-rect bg-sam-surface-dark/80 px-1.5 py-0.5 text-[11px] font-bold text-white">
                  {t("trade_showcase_badge")}
                </span>
              </div>
              {item.price != null ? (
                <span className="text-[15px] font-bold text-sam-fg">
                  {formatPrice(item.price, currency)}
                  {item.price_note ? <span className="ml-1 text-[12px] font-medium text-sam-muted">{item.price_note}</span> : null}
                </span>
              ) : null}
              <span className="truncate text-[14px] text-sam-fg">{item.title}</span>
              {item.region_label ? <span className="truncate text-[12px] text-sam-muted">{item.region_label}</span> : null}
            </button>
          </li>
        ))}
      </ul>

      <DibayBottomSheet open={open != null} onClose={() => setOpen(null)} title={open?.title ?? ""}>
        {open ? (
          <div className="flex flex-col gap-3 px-4 pb-2">
            {open.image_urls[0] ? (
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-ui-rect bg-sam-surface-muted">
                <SamarketThumbnail src={open.image_urls[0]} fill roundedClassName="rounded-ui-rect" fallbackSrc="" />
              </div>
            ) : null}
            <p className="rounded-ui-rect bg-sam-surface-muted px-3 py-2.5 text-[14px] font-medium text-sam-fg">
              {t("trade_showcase_sheet_note")}
            </p>
            {open.description ? (
              <p className="whitespace-pre-line text-[14px] leading-6 text-sam-fg">{open.description}</p>
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
    </section>
  );
}
