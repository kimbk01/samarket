"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DeliveryMediaImage } from "@/components/dibay/DeliveryMediaImage";
import { STORE_PRODUCT_DETAIL_HERO_ASPECT_RATIO } from "@/lib/dibay/store-detail-hero-layout";
import type { StoreProductMenuSeed } from "@/lib/stores/store-menu-detail-cart-baemin-presentation";
import { formatMoneyPhp } from "@/lib/utils/format";

const BAR = "animate-pulse rounded-ui-rect bg-sam-border-soft";

/**
 * WP7 — 메뉴 상세 진입 스켈레톤 (흰 「불러오는 중…」 화면 대체).
 * 화면 구조와 같게: 사진 16:9 → 제목 2줄 → 수량 줄 → 옵션 3줄 → 하단 버튼.
 * `seed`(매장 메뉴 목록 캐시)가 있으면 사진·이름·설명·가격을 먼저 그린다.
 */
export function StoreProductDetailEntrySkeleton({ seed }: { seed: StoreProductMenuSeed | null }) {
  const { t } = useI18n();
  const unit = seed ? (seed.discountPrice ?? seed.price) : null;

  return (
    <div className="min-h-[100dvh] bg-white" data-store-product-entry-skeleton={seed ? "seeded" : "empty"} aria-busy>
      <div className="relative w-full overflow-hidden bg-sam-surface-muted">
        <div aria-hidden style={{ aspectRatio: STORE_PRODUCT_DETAIL_HERO_ASPECT_RATIO, width: "100%" }} />
        {seed?.thumbnailUrl ? (
          <div className="absolute inset-0">
            <DeliveryMediaImage src={seed.thumbnailUrl} alt="" fill className="object-cover" priority surface="detail-hero" />
          </div>
        ) : (
          <div className={`absolute inset-0 animate-pulse bg-sam-border-soft`} />
        )}
      </div>

      <div className="px-4 pb-3 pt-3">
        {seed ? (
          <>
            <h1 className="text-[20px] font-extrabold leading-snug tracking-[-0.03em] text-sam-fg">{seed.title}</h1>
            {seed.summary ? (
              <p className="mt-2 text-[13px] font-medium leading-relaxed text-sam-muted">{seed.summary}</p>
            ) : null}
          </>
        ) : (
          <>
            <div className={`h-6 w-3/5 ${BAR}`} />
            <div className={`mt-2.5 h-4 w-4/5 ${BAR}`} />
          </>
        )}
      </div>

      <div className="px-4">
        <div className="flex items-center justify-between border-t border-sam-border-soft py-3">
          <span className="text-[15px] font-bold text-sam-fg">{t("store_product_qty_label")}</span>
          <div className="h-9 w-[6.75rem] rounded-ui-rect border border-sam-border" />
        </div>
        <div className="flex items-center justify-between border-t border-sam-border-soft py-3">
          <span className="text-[15px] font-bold text-sam-fg">{t("store_product_price_label")}</span>
          {unit != null ? (
            <span className="text-[16px] font-extrabold tabular-nums text-sam-fg">{formatMoneyPhp(unit)}</span>
          ) : (
            <div className={`h-5 w-20 ${BAR}`} />
          )}
        </div>
      </div>

      <div className="border-t-[8px] border-sam-surface-muted px-4 py-3.5">
        <div className={`h-4 w-28 ${BAR}`} />
        {[1, 2, 3].map((k) => (
          <div key={k} className="flex items-center gap-3 py-3">
            <div className="h-[22px] w-[22px] shrink-0 animate-pulse rounded-full bg-sam-border-soft" />
            <div className={`h-4 flex-1 ${BAR}`} />
            <div className={`h-4 w-12 ${BAR}`} />
          </div>
        ))}
      </div>

      <div className="fixed inset-x-0 bottom-0 bg-white px-4 pb-[calc(0.75rem+var(--safe-bottom))] pt-3 shadow-[0_-1px_0_var(--sam-border-soft)]">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className={`h-3 w-24 ${BAR}`} />
            <div className={`mt-1.5 h-4 w-16 ${BAR}`} />
          </div>
          <div className="h-12 w-[52%] animate-pulse rounded-ui-rect bg-sam-border-soft" />
        </div>
      </div>
    </div>
  );
}
