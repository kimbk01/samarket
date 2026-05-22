"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import {
  type AddStoreCartLineInput,
  useStoreCommerceCartActionsOptional,
  useStoreCommerceCartOptional,
} from "@/contexts/StoreCommerceCartContext";
import { useStoreCommerceCartBucketStats } from "@/lib/stores/use-store-commerce-cart-selector";
import { useStoreCommerceCartLinesForStorePage } from "@/lib/stores/use-store-commerce-cart-lines-for-store-page";
import {
  clampCartSeedQty,
  findCommerceCartLineByProductId,
  modifierWireFromCartLine,
} from "@/lib/stores/store-commerce-cart-line-seed";
import { openStoreCartConflict } from "@/lib/stores/store-cart-conflict-ui-store";
import { storeCartConflictExistingFromBlockedAdd } from "@/lib/stores/store-cart-conflict-meta";
import {
  buildStoreProductGalleryUrls,
  resolveStoreProductPrimaryImageUrl,
} from "@/lib/stores/store-product-display-media";
import type { ModifierSelectionsWire } from "@/lib/stores/modifiers/types";
import {
  parseProductOptionsJson,
  validateModifierSelection,
} from "@/lib/stores/product-line-options";
import { parseCommerceExtrasFromHoursJson } from "@/lib/stores/store-commerce-extras";
import { resolveStoreFrontCommerceState } from "@/lib/stores/store-auto-hours";
import { approximateDiscountPercent } from "@/lib/stores/store-product-pricing";
import { fetchStoreProductPublicDeduped } from "@/lib/stores/store-delivery-api-client";
import { OWN_STORE_ORDER_BLOCK_MESSAGE } from "@/lib/stores/store-orderability-policy";
import { markStoreDetailMenuTabsLanding } from "@/lib/dibay/store-detail-nav-intent";
import { showStoreDetailToast } from "@/lib/stores/store-detail-toast-ui-store";
import {
  dibayPerfOnCartbarUpdated,
  dibayPerfRecordAddToCartClick,
  dibayPerfRecordCartBlockedByOtherStore,
} from "@/lib/dibay/delivery-flow-perf";
import { StoreProductDetailPageChrome } from "@/components/stores/product-detail/baemin/StoreProductDetailPageChrome";
import { StoreBaeminProductDetailView } from "@/components/stores/product-detail/baemin/StoreBaeminProductDetailView";

type PublicStore = {
  id: string;
  slug: string;
  store_name: string;
  profile_image_url?: string | null;
  delivery_available?: boolean | null;
  is_open?: boolean | null;
  business_hours_json?: unknown;
  can_order_store?: boolean;
  owner_block_message?: string | null;
  rating_avg?: number | null;
  review_count?: number | null;
};

function normalizeStoreSlugSegment(raw: string): string {
  let s = raw.trim();
  try {
    s = decodeURIComponent(s);
  } catch {
    /* noop */
  }
  return s.normalize("NFC").trim();
}

function storeSlugsMatch(urlSlug: string, apiSlug: string): boolean {
  const a = normalizeStoreSlugSegment(urlSlug);
  const b = normalizeStoreSlugSegment(apiSlug);
  if (a === b) return true;
  return a.toLowerCase() === b.toLowerCase();
}

type PublicProduct = {
  id: string;
  title: string;
  summary: string | null;
  price: number;
  discount_price: number | null;
  stock_qty: number;
  track_inventory?: boolean | null;
  min_order_qty: number | null;
  max_order_qty: number | null;
  thumbnail_url: string | null;
  pickup_available: boolean | null;
  local_delivery_available: boolean | null;
  shipping_available: boolean | null;
  is_featured?: boolean;
  is_owner_recommended?: boolean;
  is_representative?: boolean;
  has_options?: boolean;
  images_json?: unknown;
  options_json?: unknown;
};

export function StoreProductPublic({
  storeSlug,
  productId,
}: {
  storeSlug: string;
  productId: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const commerceCart = useStoreCommerceCartOptional();
  const commerceCartActions = useStoreCommerceCartActionsOptional();
  const [product, setProduct] = useState<PublicProduct | null>(null);
  const [store, setStore] = useState<PublicStore | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  /** 사용자가 스테퍼로 바꾼 수량 — null 이면 카트 줄 수량을 그대로 표시 */
  const [qtyUserOverride, setQtyUserOverride] = useState<number | null>(null);
  const [detailGalleryIdx, setDetailGalleryIdx] = useState(0);
  const [modifierWire, setModifierWire] = useState<ModifierSelectionsWire>({ pick: {}, qty: {} });
  const [modifierSeededFromCartLineId, setModifierSeededFromCartLineId] = useState<string | null>(
    null
  );
  const [lineMemo, setLineMemo] = useState("");
  const [lineMemoSeededFromCartLineId, setLineMemoSeededFromCartLineId] = useState<string | null>(
    null
  );
  const [cartErr, setCartErr] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  const addInFlightRef = useRef(false);
  const [hoursTick, setHoursTick] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.setInterval(() => setHoursTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const detailGalleryUrls = useMemo(() => {
    if (!product) return [];
    return buildStoreProductGalleryUrls(product.thumbnail_url, product.images_json, 12);
  }, [product]);

  const heroImageUrl = useMemo(() => {
    if (!product) return "";
    return resolveStoreProductPrimaryImageUrl(product.thumbnail_url, product.images_json);
  }, [product]);

  useEffect(() => {
    setDetailGalleryIdx(0);
  }, [product?.id]);

  const { lines: cartLines, hydrated: cartHydrated } = useStoreCommerceCartLinesForStorePage(
    storeSlug,
    store?.id
  );

  const cartLineForProduct = useMemo(() => {
    const pid = String(productId ?? product?.id ?? "").trim();
    if (!pid) return null;
    return findCommerceCartLineByProductId(cartLines, pid);
  }, [cartLines, productId, product?.id]);

  useEffect(() => {
    setQtyUserOverride(null);
    setModifierSeededFromCartLineId(null);
    setLineMemoSeededFromCartLineId(null);
  }, [productId]);

  useLayoutEffect(() => {
    if (!cartLineForProduct) return;
    const lid = cartLineForProduct.lineId;
    if (modifierSeededFromCartLineId !== lid) {
      setModifierWire(modifierWireFromCartLine(cartLineForProduct));
      setModifierSeededFromCartLineId(lid);
    }
    if (lineMemoSeededFromCartLineId !== lid) {
      setLineMemo(cartLineForProduct.lineNote?.trim() ?? "");
      setLineMemoSeededFromCartLineId(lid);
    }
  }, [
    cartLineForProduct,
    modifierSeededFromCartLineId,
    lineMemoSeededFromCartLineId,
  ]);

  const optionGroups = useMemo(
    () => (product ? parseProductOptionsJson(product.options_json) : []),
    [product?.options_json]
  );

  useEffect(() => {
    if (!product?.id || optionGroups.length === 0) return;
    setModifierWire((prev) => {
      if (Object.keys(prev.pick).length > 0 || Object.keys(prev.qty).length > 0) return prev;
      const nextPick: Record<string, string[]> = {};
      for (const gr of optionGroups) {
        if (gr.inputType === "quantity") continue;
        const def = gr.options.find((o) => o.defaultSelected && !o.soldOut);
        if (def && gr.maxSelect <= 1) nextPick[gr.key] = [def.name];
      }
      if (Object.keys(nextPick).length === 0) return prev;
      return { pick: nextPick, qty: {} };
    });
  }, [product?.id, optionGroups]);

  const baseUnitPhp = useMemo(() => {
    if (!product) return 0;
    const disc = product.discount_price;
    const price = product.price;
    return disc != null && Number.isFinite(disc) && disc >= 0 && disc < price ? disc : price;
  }, [product]);

  const optionValidation = useMemo(
    () => validateModifierSelection(optionGroups, modifierWire, baseUnitPhp),
    [optionGroups, modifierWire, baseUnitPhp]
  );

  const storeExtras = useMemo(
    () => parseCommerceExtrasFromHoursJson(store?.business_hours_json),
    [store?.business_hours_json]
  );

  const loadProductPage = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = !!opts?.silent;
      if (!silent) {
        setLoading(true);
        setNotFound(false);
      }
      try {
        const { json } = await fetchStoreProductPublicDeduped(productId);
        const j = json as { ok?: boolean; product?: PublicProduct; store?: PublicStore };
        if (!j?.ok || !j.product || !j.store) {
          if (!silent) setNotFound(true);
          return;
        }
        const apiSlug = String(j.store.slug ?? "");
        if (!storeSlugsMatch(storeSlug, apiSlug)) {
          router.replace(
            `/stores/${encodeURIComponent(apiSlug)}/p/${encodeURIComponent(productId)}`,
            { scroll: false }
          );
        }
        setProduct(j.product);
        setStore(j.store);
        if (!silent) setCartErr(null);
      } catch {
        if (!silent) setNotFound(true);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [productId, storeSlug, router]
  );

  useLayoutEffect(() => {
    void loadProductPage();
  }, [loadProductPage]);

  useRefetchOnPageShowRestore(() => void loadProductPage({ silent: true }));

  const onShare = useCallback(() => {
    if (typeof window === "undefined" || !product) return;
    const url = window.location.href;
    const title = product.title;
    void (async () => {
      try {
        if (navigator.share) {
          await navigator.share({ title, text: title, url });
        } else if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
          window.alert(t("store_link_copied"));
        }
      } catch {
        /* noop */
      }
    })();
  }, [product]);

  const cartBucketStats = useStoreCommerceCartBucketStats(store?.id ?? "");
  const cartTotalPhp = cartBucketStats.hydrated ? cartBucketStats.subtotalPhp : 0;

  const minQForSeed = product
    ? Math.max(1, Number(product.min_order_qty) || 1)
    : 1;
  const maxQForSeed = product
    ? Math.max(minQForSeed, Number(product.max_order_qty) || 99)
    : 99;
  const capForSeed =
    product && product.track_inventory === true
      ? Math.min(maxQForSeed, product.stock_qty)
      : maxQForSeed;
  const qtyFromCart =
    cartLineForProduct && product && cartHydrated
      ? clampCartSeedQty(cartLineForProduct, minQForSeed, capForSeed)
      : null;
  const displayQty = qtyUserOverride ?? qtyFromCart ?? minQForSeed;

  const goToStoreMenu = useCallback(
    (slug: string) => {
      markStoreDetailMenuTabsLanding();
      router.push(`/stores/${encodeURIComponent(slug)}`, { scroll: false });
    },
    [router]
  );

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-white px-4">
        <p className="text-sm text-[#888888]">{t("common_loading")}</p>
      </div>
    );
  }

  if (notFound || !product || !store) {
    return (
      <div className="min-h-[100dvh] bg-white px-4 py-10">
        <p className="text-sm text-[#888888]">{t("common_product_not_found")}</p>
        <Link
          href={`/stores/${encodeURIComponent(storeSlug)}`}
          className="mt-4 inline-block text-sm font-semibold text-[#2386B1]"
        >
          {t("common_back_to_store")}
        </Link>
      </div>
    );
  }

  const trackInv = product.track_inventory === true;
  const commerce = resolveStoreFrontCommerceState(
    store.business_hours_json,
    store.is_open,
    new Date()
  );
  void hoursTick;

  const orderBlocked = commerce.inBreak || !commerce.isOpenForCommerce;
  const ownerOrderBlocked = store.can_order_store === false;
  const ownerOrderBlockedMessage = store.owner_block_message ?? OWN_STORE_ORDER_BLOCK_MESSAGE;

  const minQ = Math.max(1, Number(product.min_order_qty) || 1);
  const maxQ = Math.max(minQ, Number(product.max_order_qty) || 99);
  const capQty = trackInv ? Math.min(maxQ, product.stock_qty) : maxQ;
  const soldOut =
    trackInv && product.stock_qty <= 0;

  const unitWithOptions = baseUnitPhp + (optionValidation.ok ? optionValidation.unitDelta : 0);
  const cartLineQty = Math.max(minQ, Math.min(capQty, Math.floor(displayQty) || minQ));
  const cartUnitPhp = Math.max(0, Math.floor(unitWithOptions) || 0);
  const lineTotalPhp = cartUnitPhp * cartLineQty;
  const minOrderStorePhp = storeExtras.minOrderPhp ?? 0;
  const deliveryAvailable = store.delivery_available === true;

  const showListStrike = Math.floor(product.price) !== Math.floor(baseUnitPhp);

  const commerceBlockedMessage = ownerOrderBlocked
    ? ownerOrderBlockedMessage
    : orderBlocked
      ? commerce.inBreak
        ? t("common_break_time_menu_blocked", { time: commerce.breakRangeLabel })
        : t("common_preparing_order_cart_blocked")
      : soldOut
        ? t("common_sold_out_product")
        : trackInv && product.stock_qty < minQ
          ? t("store_stock_below_min", { min: minQ })
          : null;

  const badges: string[] = [];
  if (product.is_owner_recommended) badges.push(t("store_badge_owner_recommended"));
  if (product.is_featured || product.is_representative) badges.push(t("store_badge_menu_popular"));

  const reviewCount = Math.max(0, Math.floor(Number(store.review_count) || 0));
  const profileUrl = store.profile_image_url?.trim() || "";
  const qtyStepperDisabled = soldOut || orderBlocked || ownerOrderBlocked;
  const ctaDisabled =
    soldOut ||
    orderBlocked ||
    ownerOrderBlocked ||
    !optionValidation.ok ||
    !commerceCartActions ||
    capQty < minQ ||
    qtyStepperDisabled ||
    addBusy;

  function releaseAddInFlight() {
    addInFlightRef.current = false;
    setAddBusy(false);
  }

  function addToCart() {
    if (addInFlightRef.current) return;

    const st = store;
    const pr = product;
    if (!st || !pr || !commerceCartActions) return;
    if (ownerOrderBlocked) {
      setCartErr(ownerOrderBlockedMessage);
      return;
    }
    if (commerce.inBreak) {
      setCartErr(t("common_break_time_cart_blocked", { time: commerce.breakRangeLabel }));
      return;
    }
    if (!commerce.isOpenForCommerce) {
      setCartErr(t("common_preparing_cart_blocked"));
      return;
    }
    if (!optionValidation.ok) {
      setCartErr(t("common_check_option_selection"));
      return;
    }
    setCartErr(null);
    addInFlightRef.current = true;
    setAddBusy(true);

    const maxForCart = trackInv ? Math.min(maxQ, pr.stock_qty) : maxQ;
    const listBaseUnit = Math.floor(pr.price);
    const listWithOptions = listBaseUnit + (optionValidation.ok ? optionValidation.unitDelta : 0);
    const hasLineDiscount =
      listWithOptions >= unitWithOptions + 1 && unitWithOptions >= 0 && listWithOptions > 0;
    const productHasBaseDiscount =
      pr.discount_price != null &&
      Number.isFinite(pr.discount_price) &&
      pr.discount_price >= 0 &&
      pr.discount_price < pr.price &&
      pr.price > 0;
    let lineDiscountPct = 0;
    if (hasLineDiscount) {
      if (productHasBaseDiscount && pr.discount_price != null) {
        lineDiscountPct = approximateDiscountPercent(listBaseUnit, Math.floor(pr.discount_price));
      } else {
        lineDiscountPct = Math.max(
          0,
          Math.min(99, Math.round((1 - unitWithOptions / listWithOptions) * 100))
        );
      }
    }

    const lineInput: AddStoreCartLineInput = {
      storeId: st.id,
      storeSlug: st.slug,
      storeName: st.store_name,
      productId: pr.id,
      title: pr.title,
      thumbnailUrl:
        resolveStoreProductPrimaryImageUrl(pr.thumbnail_url, pr.images_json) || null,
      qty: cartLineQty,
      unitPricePhp: cartUnitPhp,
      mergeQtyMode: "set",
      listUnitPricePhp: hasLineDiscount ? listWithOptions : null,
      discountPercent: hasLineDiscount && lineDiscountPct > 0 ? lineDiscountPct : null,
      optionSelections: { ...modifierWire.pick },
      modifierWire: { ...modifierWire },
      optionsSummary: optionValidation.ok ? optionValidation.snapshot.summary : "",
      lineNote: lineMemo.trim() || null,
      pickupAvailable: !!pr.pickup_available,
      localDeliveryAvailable:
        !!pr.local_delivery_available || st.delivery_available === true,
      shippingAvailable: !!pr.shipping_available,
      minOrderQty: minQ,
      maxOrderQty: maxForCart,
    };

    const addResult = commerceCartActions.addOrMergeLine(lineInput);
    if (!addResult.ok && addResult.reason === "blocked_by_other_store") {
      releaseAddInFlight();
      dibayPerfRecordCartBlockedByOtherStore({
        existingStoreId: addResult.existingStoreId,
        nextStoreId: addResult.nextStoreId,
      });
      openStoreCartConflict(
        lineInput,
        storeCartConflictExistingFromBlockedAdd(addResult),
        () => {
          addInFlightRef.current = true;
          setAddBusy(true);
          requestAnimationFrame(() => {
            requestAnimationFrame(() => dibayPerfOnCartbarUpdated(st.id));
          });
          showStoreDetailToast(
            st.id,
            t("store_added_to_cart_toast", { title: pr.title })
          );
          goToStoreMenu(st.slug);
        }
      );
      return;
    }
    if (!addResult.ok) {
      releaseAddInFlight();
      setCartErr(t("store_err_cart_add_failed"));
      return;
    }

    dibayPerfRecordAddToCartClick(st.id);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => dibayPerfOnCartbarUpdated(st.id));
    });
    showStoreDetailToast(st.id, t("store_added_to_cart_toast", { title: pr.title }));
    goToStoreMenu(st.slug);
  }

  return (
    <StoreProductDetailPageChrome
      storeSlug={store.slug}
      storeId={store.id}
      headerTitle={product.title}
      heroImageUrl={heroImageUrl}
      profileFallbackUrl={profileUrl}
      galleryUrls={detailGalleryUrls}
      galleryIndex={detailGalleryIdx}
      onGalleryIndexChange={setDetailGalleryIdx}
      onShare={onShare}
    >
      <StoreBaeminProductDetailView
      storeSlug={store.slug}
      productId={product.id}
      title={product.title}
      summary={product.summary}
      reviewCount={reviewCount}
      badges={badges}
      baseUnitPhp={baseUnitPhp}
      listPricePhp={Math.floor(product.price)}
      showListStrike={showListStrike}
      lineTotalPhp={lineTotalPhp}
      qty={displayQty}
      qtyMinusDisabled={qtyStepperDisabled || displayQty <= minQ}
      qtyPlusDisabled={qtyStepperDisabled || displayQty >= capQty}
      onQtyDecrease={() => setQtyUserOverride(Math.max(minQ, displayQty - 1))}
      onQtyIncrease={() => setQtyUserOverride(Math.min(capQty, displayQty + 1))}
      optionGroups={optionGroups}
      modifierWire={modifierWire}
      onModifierChange={setModifierWire}
      optionsDisabled={qtyStepperDisabled}
      awaitingOptionHydration={false}
      optionHydrationFailed={false}
      commerceBlockedMessage={commerceBlockedMessage}
      soldOut={soldOut}
      minOrderPhp={minOrderStorePhp > 0 ? minOrderStorePhp : null}
      cartTotalPhp={cartTotalPhp}
      deliveryAvailable={deliveryAvailable}
      ctaDisabled={ctaDisabled}
      cartBusy={addBusy}
      errorMessage={cartErr}
      onAddToCart={addToCart}
    />
    </StoreProductDetailPageChrome>
  );
}
