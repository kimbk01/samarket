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
          <SamarketThumbnail
            src={thumb}
            size={28}
            roundedClassName="rounded-full"
            className="bg-[#F3F3F3]"
            fallbackSrc=""
            fallbackNode={<span className="text-sm" aria-hidden>{"\ud83c\udf7d\ufe0f"}</span>}
          />
          <span className={`min-w-0 truncate ${BAEMIN_CART_TYPE.storeName} text-[#111111]`}>
            {store.store_name}
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
          </svg>
        </Link>
        <button
          type="button"
          disabled={busy}
          onClick={onRequestClear}
          className="shrink-0 text-[12px] font-medium text-[#999] underline-offset-2 hover:underline disabled:opacity-40"
        >
          {t("store_cart_clear_confirm")}
        </button>
      </div>

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
        className="flex w-full items-center justify-center gap-1 py-3.5 text-[14px] font-semibold text-[#333] active:bg-[#FAFAFA] disabled:opacity-40"
      >
        <span className="text-[18px] leading-none">+</span>
        {t("store_cart_add_menu")}
      </button>
    </section>
  );
}
