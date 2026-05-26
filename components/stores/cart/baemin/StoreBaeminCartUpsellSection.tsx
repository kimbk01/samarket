"use client";

import type { StoreDetailProductCard } from "@/lib/stores/group-store-products-by-menu";
import {
  BAEMIN_CART_CARD_INSET_CLASS,
  BAEMIN_CART_DIVIDER_CLASS,
  BAEMIN_CART_TYPE,
} from "@/lib/stores/store-baemin-cart-ui";
import { discountPriceFromPercent } from "@/lib/stores/store-product-pricing";
import { formatMoneyPhp } from "@/lib/utils/format";
import { StoreProductThumbnail } from "@/components/stores/common/StoreProductThumbnail";

function upsellUnitPrice(card: StoreDetailProductCard): number {
  const price = Math.floor(Number(card.price));
  const disc =
    card.discount_price != null && Number.isFinite(card.discount_price)
      ? Math.floor(card.discount_price)
      : card.discount_percent != null
        ? discountPriceFromPercent(price, card.discount_percent)
        : null;
  return disc != null && disc >= 0 ? disc : price;
}

export function StoreBaeminCartUpsellSection({
  products,
  expanded,
  onToggleExpand,
  onPickProduct,
}: {
  products: StoreDetailProductCard[];
  expanded: boolean;
  onToggleExpand: () => void;
  onPickProduct: (productId: string) => void;
}) {
  if (products.length === 0) return null;

  const visible = expanded ? products : products.slice(0, 5);

  return (
    <section className={`${BAEMIN_CART_TYPE.cardGap} ${BAEMIN_CART_TYPE.pagePadX}`}>
      <h2 className={`mb-2 px-0.5 ${BAEMIN_CART_TYPE.sectionTitle} text-[color:var(--delivery-text-main)]`}>
        {"\ud568\uaed8 \uba39\uc73c\uba74 \uc88b\uc544\uc694"}
      </h2>
      <div className={BAEMIN_CART_CARD_INSET_CLASS}>
        <ul>
          {visible.map((p, index) => {
            const unit = upsellUnitPrice(p);
            const hasOptions = p.has_options;
            return (
              <li key={p.id}>
                {index > 0 ? <div className={BAEMIN_CART_DIVIDER_CLASS} /> : null}
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onPickProduct(p.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-80"
                  >
                    <StoreProductThumbnail
                      src={p.thumbnail_url}
                      size={56}
                      roundedClassName="rounded-[8px]"
                      className={BAEMIN_CART_TYPE.thumbUpsell}
                    />
                    <div className="min-w-0 flex-1">
                      <p className={`truncate ${BAEMIN_CART_TYPE.itemTitle} text-[color:var(--delivery-text-main)]`}>{p.title}</p>
                      <p className={`mt-0.5 ${BAEMIN_CART_TYPE.upsellPrice} text-[color:var(--delivery-text-main)]`}>
                        {formatMoneyPhp(unit)}
                        {hasOptions ? "~" : ""}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onPickProduct(p.id)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[color:var(--delivery-border)] bg-[color:var(--delivery-bg-card)] text-[20px] font-medium leading-none text-[color:var(--delivery-text-main)] active:bg-[color:var(--delivery-bg-soft)]"
                    aria-label={`${p.title} ${"\ub2f4\uae30"}`}
                  >
                    +
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        {products.length > 5 ? (
          <>
            <div className={BAEMIN_CART_DIVIDER_CLASS} />
            <button
              type="button"
              onClick={onToggleExpand}
              className="flex w-full items-center justify-center gap-1 py-3 text-[14px] font-semibold text-[#333333] active:bg-[#FAFAFA]"
            >
              {expanded ? "\uc811\uae30" : "\ub354\ubcf4\uae30"}
              <span className="text-[12px]" aria-hidden>
                {expanded ? "\u2227" : "\u2228"}
              </span>
            </button>
          </>
        ) : null}
      </div>
    </section>
  );
}
