"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { StoreCommerceCartLine } from "@/lib/stores/store-commerce-cart-types";
import {
  BAEMIN_CART_CARD_CLASS,
  BAEMIN_CART_DIVIDER_CLASS,
  BAEMIN_CART_TYPE,
} from "@/lib/stores/store-baemin-cart-ui";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { StoreBaeminCartLineRow } from "@/components/stores/cart/baemin/StoreBaeminCartLineRow";

type StoreHead = {
  store_name: string;
  slug: string;
  profile_image_url?: string | null;
};

export function StoreBaeminCartStoreBlock({
  store,
  lines,
  busy,
  noneLabel,
  deleteLabel,
  onRequestClear,
  onBackToStore,
  onRemoveLine,
  onChangeOptions,
  onDecreaseQty,
  onIncreaseQty,
  closingSoonHHmm = null,
}: {
  store: StoreHead;
  lines: StoreCommerceCartLine[];
  busy: boolean;
  noneLabel: string;
  deleteLabel: string;
  onRequestClear: () => void;
  onBackToStore: () => void;
  onRemoveLine: (lineId: string) => void;
  onChangeOptions: (line: StoreCommerceCartLine) => void;
  onDecreaseQty: (line: StoreCommerceCartLine) => void;
  onIncreaseQty: (line: StoreCommerceCartLine) => void;
  /** WP8 — 영업 종료 60분 이내면 종료 시각(HH:mm) → 「마감임박 {시각}에 주문이 마감돼요」 */
  closingSoonHHmm?: string | null;
}) {
  const { t } = useI18n();
  const thumb = store.profile_image_url?.trim();
  const storeHref = `/stores/${encodeURIComponent(store.slug)}`;

  return (
    <section className={`${BAEMIN_CART_CARD_CLASS} ${BAEMIN_CART_TYPE.cardGap}`}>
      <div
        className={`flex items-center gap-2 border-b border-[var(--delivery-border-section)] px-4 ${BAEMIN_CART_TYPE.storeHeaderPy}`}
      >
        <Link href={storeHref} className="flex min-w-0 flex-1 items-center gap-2">
          {/* WP8 — 로고가 있을 때만 원형 로고 */}
          {thumb ? (
            <SamarketThumbnail
              src={thumb}
              size={28}
              roundedClassName="rounded-full"
              className="bg-sam-surface-muted"
              fallbackSrc=""
            />
          ) : null}
          <span className={`min-w-0 truncate ${BAEMIN_CART_TYPE.storeName} text-sam-fg`}>
            {store.store_name}
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--delivery-text-muted)" strokeWidth="2" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
          </svg>
        </Link>
        <button
          type="button"
          disabled={busy}
          onClick={onRequestClear}
          className="shrink-0 text-[12px] font-medium text-[color:var(--delivery-text-muted)] underline-offset-2 hover:underline active:text-[color:var(--delivery-text-main)] disabled:opacity-40"
        >
          {t("store_cart_clear_confirm")}
        </button>
      </div>

      {closingSoonHHmm ? (
        <div
          className="flex items-center gap-2 border-b border-[var(--delivery-border-section)] px-4 py-2.5"
          data-store-cart-closing-soon="1"
          role="status"
        >
          <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-sam-danger px-2 text-[11px] font-bold text-white">
            {t("store_cart_closing_soon_badge")}
          </span>
          <span className="min-w-0 text-[13px] font-medium text-sam-fg">
            {t("store_cart_closing_soon_line", { time: closingSoonHHmm })}
          </span>
        </div>
      ) : null}

      {lines.map((line, index) => (
        <div key={line.lineId}>
          {index > 0 ? <div className={BAEMIN_CART_DIVIDER_CLASS} aria-hidden /> : null}
          <StoreBaeminCartLineRow
            line={line}
            busy={busy}
            noneLabel={noneLabel}
            deleteLabel={deleteLabel}
            onRemove={() => onRemoveLine(line.lineId)}
            onChangeOptions={() => onChangeOptions(line)}
            onDecrease={() => onDecreaseQty(line)}
            onIncrease={() => onIncreaseQty(line)}
          />
        </div>
      ))}

      <div className={BAEMIN_CART_DIVIDER_CLASS} />
      <button
        type="button"
        disabled={busy}
        onClick={onBackToStore}
        className="flex w-full items-center justify-center gap-1 py-3.5 text-[14px] font-semibold text-sam-fg active:bg-sam-surface-muted disabled:opacity-40"
      >
        <span className="text-[18px] leading-none">+</span>
        {t("store_cart_add_menu")}
      </button>
    </section>
  );
}
