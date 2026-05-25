"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";
import { StoreDetailBackLink } from "@/components/stores/StoreDetailBackRow";
import {
  STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME,
  StoreCommerceCartStrokeIcon,
} from "@/components/stores/StoreCommerceCartStrokeIcon";
import { telHrefFromLoosePhPhone } from "@/lib/utils/ph-mobile";
import { useStoreCommerceCartOptional } from "@/contexts/StoreCommerceCartContext";
import type { StoreFulfillmentPref } from "@/lib/stores/store-fulfillment-pref";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { DELIVERY_CONSUMER_HEADER_ICON_BTN_CLASS } from "@/lib/design/delivery-chrome";

const iconBtnClass =
  `${DELIVERY_CONSUMER_HEADER_ICON_BTN_CLASS} disabled:pointer-events-none disabled:opacity-40`;

export type StoreStickyOrderChrome = {
  isOpenForOrder: boolean;
  deliveryAvailable: boolean;
  pickupAvailable: boolean;
  fulfillmentMode: StoreFulfillmentPref;
  onFulfillmentChange: (mode: StoreFulfillmentPref) => void;
  onMenuSearchFocus: () => void;
};

/**
 * `/stores/[slug]/*` Tier1 — 매장명·평점·리뷰 + (메뉴 루트일 때) 주문 상태·수령·검색.
 * 전화·채팅·가게 정보는 ⋯ 메뉴로 이동.
 */
export function StoreDetailStickyTopRow({
  fallbackHref,
  commerceCartStoreId,
  storeSlug,
  storeName,
  phone,
  profileImageUrl,
  ratingAvg,
  reviewCount,
  viewerFavorited,
  favoriteBusy,
  onFavoriteClick,
  orderChrome,
}: {
  fallbackHref: string;
  commerceCartStoreId?: string | null;
  storeSlug: string;
  storeName: string;
  /** 주문 헤더에서는 표시하지 않음(가게 정보에서 확인) */
  areaLine?: string | null;
  phone: string | null;
  profileImageUrl: string | null;
  ratingAvg: number | null;
  reviewCount: number;
  /** 표시 생략 — 하트 상태만 유지 */
  favoriteCount?: number;
  recentOrderCount?: number;
  viewerFavorited: boolean;
  favoriteBusy: boolean;
  onFavoriteClick: () => void | Promise<void>;
  orderChrome?: StoreStickyOrderChrome | null;
}) {
  const { t } = useI18n();
  const commerceCart = useStoreCommerceCartOptional();
  const moreRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = () => {
      if (moreRef.current) moreRef.current.open = false;
    };
    const onDoc = (e: MouseEvent) => {
      const el = moreRef.current;
      if (!el?.open) return;
      if (e.target instanceof Node && !el.contains(e.target)) close();
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const cartLineKindCount =
    commerceCart?.hydrated && commerceCartStoreId
      ? Math.max(0, Math.floor(commerceCart.getItemCountForStoreId(commerceCartStoreId)))
      : commerceCart?.hydrated
        ? Math.max(0, Math.floor(commerceCart.totalItemCountAllStores))
        : 0;
  const telHref =
    phone != null
      ? telHrefFromLoosePhPhone(phone) ?? `tel:${String(phone).replace(/\s/g, "")}`
      : "";

  const ratingLabel =
    ratingAvg != null && Number.isFinite(Number(ratingAvg)) ? Number(ratingAvg).toFixed(1) : "—";
  const reviewCountLabel = reviewCount.toLocaleString("en-PH");
  const initialGlyph = storeName.trim().slice(0, 1) || "?";
  const infoHref = `/stores/${encodeURIComponent(storeSlug)}/info`;

  const onShare = useCallback(async () => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: storeName, text: storeName, url });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        window.alert(t("store_link_copied"));
      }
    } catch {
      /* 사용자 취소 등 */
    }
  }, [storeName, t]);

  const segBase =
    "min-w-0 flex-1 rounded-sam-sm border border-transparent px-2 py-2 sam-text-xxs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const segOn = "border-sam-primary-border bg-sam-primary-soft text-sam-fg";
  const segOff = "text-sam-muted active:bg-sam-border-soft/60";

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-1 py-0.5">
    <div className="flex w-full min-w-0 max-w-full min-h-[length:var(--delivery-header-action)] items-center gap-1.5">
      <StoreDetailBackLink fallbackHref={fallbackHref} />
      <SamarketThumbnail
        src={profileImageUrl}
        size={40}
        fetchDisplayPx={40}
        roundedClassName="rounded-sam-md"
        className="border border-sam-border bg-sam-surface-muted"
        fallbackSrc=""
        fallbackNode={<span className="sam-text-helper font-semibold text-sam-meta" aria-hidden>{initialGlyph}</span>}
      />
      <div className="min-w-0 flex-1 py-0.5">
        <h1 className="truncate sam-text-body font-bold leading-tight text-sam-fg">{storeName}</h1>
        <p className="mt-0.5 truncate sam-text-xxs font-medium leading-tight text-sam-muted">
          <span className="text-sam-fg">★ {ratingLabel}</span>
          <span className="mx-1 text-sam-meta" aria-hidden>
            ·
          </span>
          {t("store_reviews_with_count", { count: reviewCountLabel })}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-[length:var(--delivery-header-action-gap)]">
        <Link
          href={`/stores/${encodeURIComponent(storeSlug)}/cart`}
          className={`${iconBtnClass} relative`}
          aria-label={
            cartLineKindCount > 0
              ? t("store_cart_aria_with_kinds", { count: cartLineKindCount.toLocaleString("en-PH") })
              : t("store_cart_aria")
          }
        >
          <StoreCommerceCartStrokeIcon className="h-[length:var(--delivery-header-icon-glyph)] w-[length:var(--delivery-header-icon-glyph)]" />
          {cartLineKindCount > 0 ? (
            <span
              className={`absolute -right-0.5 -top-0.5 z-[1] ${STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME}`}
            >
              {cartLineKindCount > 99 ? "99+" : cartLineKindCount}
            </span>
          ) : null}
        </Link>
        <button
          type="button"
          className={iconBtnClass}
          aria-label={viewerFavorited ? t("store_favorite_remove_aria") : t("store_favorite_add_aria")}
          disabled={favoriteBusy}
          onClick={() => void onFavoriteClick()}
        >
          <svg
            viewBox="0 0 24 24"
            fill={viewerFavorited ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
            className={`h-[length:var(--delivery-header-icon-glyph)] w-[length:var(--delivery-header-icon-glyph)]${viewerFavorited ? " text-sam-danger" : ""}`}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
            />
          </svg>
        </button>
        {orderChrome ? (
          <button
            type="button"
            className={iconBtnClass}
            aria-label={t("store_menu_search_aria")}
            onClick={() => orderChrome.onMenuSearchFocus()}
          >
            <svg className="h-[length:var(--delivery-header-icon-glyph)] w-[length:var(--delivery-header-icon-glyph)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path strokeLinecap="round" d="M20 20l-3.5-3.5" />
            </svg>
          </button>
        ) : null}
        <button type="button" className={iconBtnClass} aria-label={t("common_share")} onClick={() => void onShare()}>
          <svg className="h-[length:var(--delivery-header-icon-glyph)] w-[length:var(--delivery-header-icon-glyph)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <path strokeLinecap="round" d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
          </svg>
        </button>
        <details ref={moreRef} className="relative">
          <summary
            className={`${iconBtnClass} list-none [&::-webkit-details-marker]:hidden`}
            aria-label={t("store_more_aria")}
          >
            <span className="text-lg font-bold leading-none text-sam-muted">⋯</span>
          </summary>
          <div
            className="absolute right-0 z-[50] mt-1 w-44 rounded-sam-md border border-sam-border bg-sam-surface py-1 shadow-sam-elevated"
            role="menu"
          >
            {telHref ? (
              <a
                href={telHref}
                className="block px-3 py-2.5 sam-text-body-secondary font-medium text-sam-fg hover:bg-sam-app"
                role="menuitem"
              >
                {t("store_phone_menu_call")}
              </a>
            ) : (
              <span className="block px-3 py-2.5 sam-text-body-secondary text-sam-meta" role="menuitem">
                {t("store_phone_menu_none")}
              </span>
            )}
            <Link
              href="/chat"
              className="block px-3 py-2.5 sam-text-body-secondary font-medium text-sam-fg hover:bg-sam-app"
              role="menuitem"
            >
              {t("store_chat_inquiry_menu")}
            </Link>
            <Link
              href={infoHref}
              className="block px-3 py-2.5 sam-text-body-secondary font-medium text-sam-fg hover:bg-sam-app"
              role="menuitem"
            >
              {t("store_store_info_menu")}
            </Link>
          </div>
        </details>
      </div>
    </div>

      {orderChrome ? (
        <div className="flex w-full min-w-0 items-center gap-2 border-t border-sam-border/80 pt-1">
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 sam-text-xxs font-bold ${
              orderChrome.isOpenForOrder ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"
            }`}
          >
            {orderChrome.isOpenForOrder ? t("store_order_accepting") : t("store_preparing_short")}
          </span>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 sam-text-xxs font-bold ${
              orderChrome.deliveryAvailable ? "bg-sky-50 text-sky-900" : "bg-sam-surface-muted text-sam-muted"
            }`}
          >
            {orderChrome.deliveryAvailable ? t("store_delivery_yes_short") : t("store_delivery_no_short")}
          </span>
          <div
            className="ml-auto flex min-w-0 max-w-[11rem] flex-1 rounded-full border border-sam-border bg-sam-surface-muted p-0.5"
            role="group"
            aria-label={t("store_fulfillment_mode_aria")}
          >
            <button
              type="button"
              disabled={!orderChrome.pickupAvailable}
              onClick={() => orderChrome.onFulfillmentChange("pickup")}
              className={`${segBase} ${orderChrome.fulfillmentMode === "pickup" ? segOn : segOff}`}
            >
              {t("store_fulfillment_pickup_short")}
            </button>
            <button
              type="button"
              disabled={!orderChrome.deliveryAvailable}
              onClick={() => orderChrome.onFulfillmentChange("local_delivery")}
              className={`${segBase} ${orderChrome.fulfillmentMode === "local_delivery" ? segOn : segOff}`}
            >
              {t("store_fulfillment_delivery_short")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
