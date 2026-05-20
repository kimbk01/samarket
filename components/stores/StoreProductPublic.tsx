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
import { openStoreCartConflict } from "@/lib/stores/store-cart-conflict-ui-store";
import { storeCartConflictExistingFromBlockedAdd } from "@/lib/stores/store-cart-conflict-meta";
import { itemTypeShortLabel } from "@/lib/stores/group-store-products-by-menu";
import { parseMediaUrlsJson } from "@/lib/stores/parse-media-urls-json";
import type { ModifierSelectionsWire } from "@/lib/stores/modifiers/types";
import {
  parseProductOptionsJson,
  validateModifierSelection,
} from "@/lib/stores/product-line-options";
import { PH_LOCAL_09_PLACEHOLDER } from "@/lib/constants/philippines-contact";
import { formatMoneyPhp } from "@/lib/utils/format";
import {
  formatPhMobileDisplay,
  isCompletePhMobile,
  parsePhMobileInput,
  telHrefFromLoosePhPhone,
} from "@/lib/utils/ph-mobile";
import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
import { StoreDetailBottomStrip } from "@/components/stores/StoreDetailBottomStrip";
import { StoreModifierPicker } from "@/components/stores/modifiers/StoreModifierPicker";
import { STORE_DETAIL_SUBHEADER_STICKY } from "@/lib/stores/store-detail-ui";
import {
  parseCommerceExtrasFromHoursJson,
  resolveChargedDeliveryFeePhp,
} from "@/lib/stores/store-commerce-extras";
import { resolveStoreFrontCommerceState } from "@/lib/stores/store-auto-hours";
import { KASAMA_BUYER_STORE_ORDERS_HUB_REFRESH } from "@/lib/chats/chat-channel-events";
import { approximateDiscountPercent } from "@/lib/stores/store-product-pricing";
import { fetchStoreProductPublicDeduped, postMeStoreOrder } from "@/lib/stores/store-delivery-api-client";
import { generateStoreOrderClientKey } from "@/lib/stores/store-order-client-key";
import {
  buildStoreOrderDetailSeedFromPostSuccess,
  setStoreOrderDetailSeed,
} from "@/lib/stores/store-order-detail-seed-cache";
import {
  dibayPerfOnCartbarUpdated,
  dibayPerfRecordAddToCartClick,
  dibayPerfRecordCartBlockedByOtherStore,
} from "@/lib/dibay/delivery-flow-perf";

type PublicStore = {
  id: string;
  slug: string;
  store_name: string;
  phone: string | null;
  region: string | null;
  city: string | null;
  district: string | null;
  profile_image_url?: string | null;
  delivery_available?: boolean | null;
  pickup_available?: boolean | null;
  is_open?: boolean | null;
  business_hours_json?: unknown;
};

type Fulfillment = "pickup" | "local_delivery" | "shipping";

type CatEmbed = { name?: string } | { name?: string }[] | null | undefined;
type MenuSecEmbed = { name?: string } | { name?: string }[] | null | undefined;

function categoryNameFromEmbed(v: CatEmbed): string | null {
  if (v == null) return null;
  if (Array.isArray(v)) return v[0]?.name?.trim() || null;
  return v.name?.trim() || null;
}

function menuSectionNameFromEmbed(v: MenuSecEmbed): string | null {
  if (v == null) return null;
  if (Array.isArray(v)) return v[0]?.name?.trim() || null;
  return v.name?.trim() || null;
}

/** 경로 슬러그와 DB slug 일치 판단 — 퍼센트 인코딩·NFC 정규화·대소문자 차이 흡수 */
function normalizeStoreSlugSegment(raw: string): string {
  let s = raw.trim();
  try {
    s = decodeURIComponent(s);
  } catch {
    /* 이미 디코딩된 문자열 */
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
  discount_percent?: number | null;
  stock_qty: number;
  /** false·미정: 재고 무시(주문 시 차감 없음) */
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
  item_type?: string | null;
  store_menu_sections?: MenuSecEmbed;
  store_product_categories?: CatEmbed;
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
  const { t, language } = useI18n();
  const router = useRouter();
  const commerceCart = useStoreCommerceCartOptional();
  const [product, setProduct] = useState<PublicProduct | null>(null);
  const [store, setStore] = useState<PublicStore | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [qty, setQty] = useState(1);
  const [fulfillment, setFulfillment] = useState<Fulfillment>("pickup");
  const [buyerNote, setBuyerNote] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [orderBusy, setOrderBusy] = useState(false);
  const clientOrderKeyRef = useRef<string | null>(null);
  const orderSubmitFlightRef = useRef(false);
  const [orderErr, setOrderErr] = useState<string | null>(null);
  const [orderOk, setOrderOk] = useState<string | null>(null);
  const [lastPlacedOrderId, setLastPlacedOrderId] = useState<string | null>(null);
  const [detailGalleryIdx, setDetailGalleryIdx] = useState(0);
  const [modifierWire, setModifierWire] = useState<ModifierSelectionsWire>({ pick: {}, qty: {} });
  const [lineMemo, setLineMemo] = useState("");
  const [hoursTick, setHoursTick] = useState(0);
  const commerceCartActions = useStoreCommerceCartActionsOptional();

  useEffect(() => {
    void router.prefetch("/my/store-orders");
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.setInterval(() => setHoursTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const detailGalleryUrls = useMemo(() => {
    if (!product) return [];
    const thumb = product.thumbnail_url?.trim() || "";
    const extra = parseMediaUrlsJson(product.images_json, 12);
    const seen = new Set<string>();
    if (thumb) seen.add(thumb);
    const out: string[] = [];
    for (const u of extra) {
      const t = u.trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
    return out;
  }, [product]);

  const heroImageUrl = useMemo(() => {
    if (!product) return "";
    const thumb = product.thumbnail_url?.trim() || "";
    if (thumb) return thumb;
    return detailGalleryUrls[0] ?? "";
  }, [product, detailGalleryUrls]);

  useEffect(() => {
    setDetailGalleryIdx((prev) => (prev === 0 ? prev : 0));
  }, [product?.id]);

  useEffect(() => {
    setModifierWire({ pick: {}, qty: {} });
    setLineMemo("");
  }, [product?.id]);

  const optionGroups = useMemo(
    () => (product ? parseProductOptionsJson(product.options_json) : []),
    [product]
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

  const directOrderFingerprint = useMemo(() => {
    if (!product?.id || !store?.id) return "";
    return JSON.stringify({
      store_id: store.id,
      product_id: product.id,
      qty,
      fulfillment_type: fulfillment,
      buyer_note: buyerNote.trim(),
      buyer_phone: parsePhMobileInput(buyerPhone),
      modifier_selections: modifierWire,
      line_note: lineMemo.trim(),
    });
  }, [store?.id, product?.id, qty, fulfillment, buyerNote, buyerPhone, modifierWire, lineMemo]);

  useEffect(() => {
    clientOrderKeyRef.current = null;
  }, [directOrderFingerprint]);

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
        const p = j.product;
        const minQ = Math.max(1, Number(p.min_order_qty) || 1);
        const maxQ = Math.max(minQ, Number(p.max_order_qty) || 99);
        const tr = p.track_inventory === true;
        const cap = tr ? Math.min(maxQ, p.stock_qty) : maxQ;
        if (silent) {
          setQty((q) => Math.max(minQ, Math.min(cap, q)));
        } else {
          setQty(minQ);
          setOrderErr(null);
          setOrderOk(null);
          setLastPlacedOrderId(null);
        }
        const stRow = j.store as { delivery_available?: boolean | null };
        const opts: Fulfillment[] = [];
        if (p.pickup_available) opts.push("pickup");
        if (p.local_delivery_available || stRow.delivery_available === true) {
          opts.push("local_delivery");
        } else if (p.shipping_available) {
          opts.push("shipping");
        }
        if (silent) {
          setFulfillment((f) => (opts.includes(f) ? f : opts[0] ?? "pickup"));
        } else {
          setFulfillment(opts[0] ?? "pickup");
        }
      } catch {
        if (!silent) setNotFound(true);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [productId, storeSlug, router]
  );

  const reloadProduct = useCallback(() => void loadProductPage({ silent: true }), [loadProductPage]);

  useLayoutEffect(() => {
    void loadProductPage();
  }, [loadProductPage]);

  useRefetchOnPageShowRestore(() => void loadProductPage({ silent: true }));

  if (loading) {
    return (
      <div className="min-h-screen bg-sam-app px-4 py-8">
        <p className="text-sm text-sam-muted">{t("common_loading")}</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-sam-app px-4 py-8">
        <p className="text-sm text-sam-muted">{t("common_product_not_found")}</p>
        <Link href={`/stores/${encodeURIComponent(storeSlug)}`} className="mt-4 inline-block text-sm text-signature">
          {t("common_back_to_store")}
        </Link>
      </div>
    );
  }

  if (!product || !store) return null;

  const trackInv = product.track_inventory === true;

  const commerce = resolveStoreFrontCommerceState(
    store.business_hours_json,
    store.is_open,
    new Date()
  );
  void hoursTick;
  const orderBlocked = commerce.inBreak || !commerce.isOpenForCommerce;

  const rawPhone = store.phone?.trim() ?? "";
  const phDigits = rawPhone ? parsePhMobileInput(rawPhone) : "";
  const stripPhone = rawPhone
    ? {
        label: phDigits.length === 11 ? formatPhMobileDisplay(phDigits) : rawPhone,
        href: telHrefFromLoosePhPhone(rawPhone) ?? `tel:${rawPhone.replace(/\s/g, "")}`,
      }
    : null;

  const minQ = Math.max(1, Number(product.min_order_qty) || 1);
  const maxQ = Math.max(minQ, Number(product.max_order_qty) || 99);
  const capQty = trackInv ? Math.min(maxQ, product.stock_qty) : maxQ;
  const fulfillmentOptions: { value: Fulfillment; label: string }[] = [];
  if (product.pickup_available) {
    fulfillmentOptions.push({ value: "pickup", label: t("common_pickup_label") });
  }
  const productDeliveryMode: Fulfillment | null =
    product.local_delivery_available || store?.delivery_available === true
      ? "local_delivery"
      : product.shipping_available
        ? "shipping"
        : null;
  if (productDeliveryMode != null) {
    fulfillmentOptions.push({ value: productDeliveryMode, label: t("common_delivery_label") });
  }

  async function submitOrder() {
    const st = store;
    const pr = product;
    if (!st || !pr) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setOrderErr(t("store_network_order_retry"));
      return;
    }
    if (orderBusy || orderSubmitFlightRef.current) return;
    if (commerce.inBreak) {
      setOrderErr(
        t("common_break_time_order_blocked", { time: commerce.breakRangeLabel })
      );
      return;
    }
    if (!commerce.isOpenForCommerce) {
      setOrderErr(t("common_preparing_order_blocked"));
      return;
    }
    if (!optionValidation.ok) {
      setOrderErr(t("common_check_option_selection"));
      return;
    }
    if (
      (fulfillment === "local_delivery" || fulfillment === "shipping") &&
      !isCompletePhMobile(buyerPhone)
    ) {
      setOrderErr(t("common_enter_contact", { placeholder: PH_LOCAL_09_PLACEHOLDER }));
      return;
    }
    if (
      fulfillment === "pickup" &&
      parsePhMobileInput(buyerPhone) &&
      !isCompletePhMobile(buyerPhone)
    ) {
      setOrderErr(t("common_check_contact_format"));
      return;
    }
    const uwo = baseUnitPhp + (optionValidation.ok ? optionValidation.unitDelta : 0);
    const minStorePhp =
      parseCommerceExtrasFromHoursJson(st.business_hours_json).minOrderPhp ?? 0;
    if (minStorePhp > 0 && uwo * qty < minStorePhp) {
      setOrderErr(t("store_min_order_amount", { amount: formatMoneyPhp(minStorePhp) }));
      return;
    }
    setOrderErr(null);
    setOrderOk(null);
    orderSubmitFlightRef.current = true;
    setOrderBusy(true);
    try {
      if (!clientOrderKeyRef.current) {
        clientOrderKeyRef.current = generateStoreOrderClientKey();
      }
      const client_order_key = clientOrderKeyRef.current;
      const { status, json } = await postMeStoreOrder({
        store_id: st.id,
        items: [
          {
            product_id: pr.id,
            qty,
            client_unit_php: unitWithOptions,
            modifier_selections:
              Object.keys(modifierWire.pick).length > 0 || Object.keys(modifierWire.qty).length > 0
                ? modifierWire
                : undefined,
            line_note: lineMemo.trim() || undefined,
          },
        ],
        fulfillment_type: fulfillment,
        buyer_note: buyerNote.trim() || undefined,
        buyer_phone: parsePhMobileInput(buyerPhone) || undefined,
        client_order_key,
      });
      if (status === 401) {
        clientOrderKeyRef.current = null;
        setOrderErr(t("common_login_required"));
        return;
      }
      const orderJ = json as {
        ok?: boolean;
        error?: string;
        idempotent?: boolean;
        order?: { id?: string; order_no?: string; payment_amount?: number };
      };
      if (!orderJ?.ok) {
        clientOrderKeyRef.current = null;
        const code = typeof orderJ.error === "string" ? orderJ.error : "order_failed";
        const msg =
          code === "insufficient_stock"
            ? t("store_err_out_of_stock")
            : code === "store_not_selling"
              ? t("store_err_not_accepting")
              : code === "store_closed"
                ? t("store_err_preparing")
                : code === "below_min_order"
                  ? t("store_err_below_minimum")
                  : code === "cannot_order_own_store"
                ? t("store_err_own_store")
                : code === "options_too_few"
                  ? t("store_err_required_options")
                  : code === "options_too_many"
                    ? t("store_err_too_many_options")
                    : code === "options_invalid_choice"
                      ? t("store_err_invalid_option")
                      : code === "options_unknown_group"
                        ? t("store_err_option_mismatch")
                        : code === "options_not_configured"
                          ? t("store_err_no_options")
                          : code === "options_duplicate_choice"
                            ? t("store_err_duplicate_option")
                            : code === "duplicate_line_in_order"
                              ? t("store_err_duplicate_line")
                              : t("store_err_order_failed", { code });
        setOrderErr(msg);
        return;
      }
      const placedId = typeof orderJ.order?.id === "string" ? orderJ.order.id : null;
      const placedOrder = orderJ.order;
      clientOrderKeyRef.current = null;
      if (placedId) {
        try {
          sessionStorage.setItem(`dibay:buyer_order_placed_wall:${placedId}`, String(Date.now()));
        } catch {
          /* ignore */
        }
        if (
          placedOrder &&
          typeof placedOrder.order_no === "string" &&
          typeof placedOrder.payment_amount === "number"
        ) {
          setStoreOrderDetailSeed(
            placedId,
            buildStoreOrderDetailSeedFromPostSuccess({
              orderId: placedId,
              order_no: placedOrder.order_no,
              payment_amount: placedOrder.payment_amount,
              store_id: st.id,
              store_name: st.store_name,
              idempotent: orderJ.idempotent === true,
            })
          );
        }
        void router.prefetch("/orders");
        void router.prefetch(`/orders/store/${encodeURIComponent(placedId)}`);
        void router.prefetch(`/orders/store/${encodeURIComponent(placedId)}/chat`);
        window.dispatchEvent(new CustomEvent(KASAMA_BUYER_STORE_ORDERS_HUB_REFRESH));
        router.replace(`/orders/store/${encodeURIComponent(placedId)}`);
        return;
      }
      setOrderOk(`${t("notify_order_received_message")} ${orderJ.order?.order_no ?? ""}`.trim());
      setLastPlacedOrderId(null);
      await reloadProduct();
    } catch {
      setOrderErr(t("common_network_error_generic"));
    } finally {
      orderSubmitFlightRef.current = false;
      setOrderBusy(false);
    }
  }

  const unitWithOptions = baseUnitPhp + (optionValidation.ok ? optionValidation.unitDelta : 0);

  const minOrderStorePhp = storeExtras.minOrderPhp ?? 0;
  const lineSubtotalPhp = unitWithOptions * qty;
  const deliveryFeeLine = resolveChargedDeliveryFeePhp(storeExtras, lineSubtotalPhp, fulfillment);
  const orderGrandDisplayPhp =
    lineSubtotalPhp + (fulfillment === "local_delivery" ? deliveryFeeLine : 0);
  const belowStoreMinOrder =
    minOrderStorePhp > 0 && lineSubtotalPhp < minOrderStorePhp;

  function addToCart() {
    const st = store;
    const pr = product;
    if (!st || !pr || !commerceCartActions) return;
    if (commerce.inBreak) {
      setOrderErr(
        t("common_break_time_cart_blocked", { time: commerce.breakRangeLabel })
      );
      return;
    }
    if (!commerce.isOpenForCommerce) {
      setOrderErr(t("common_preparing_cart_blocked"));
      return;
    }
    if (!optionValidation.ok) {
      setOrderErr(t("common_check_option_selection"));
      return;
    }
    setOrderErr(null);
    setLastPlacedOrderId(null);
    const tr = pr.track_inventory === true;
    const maxForCart = tr ? Math.min(maxQ, pr.stock_qty) : maxQ;
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
        lineDiscountPct = approximateDiscountPercent(
          listBaseUnit,
          Math.floor(pr.discount_price)
        );
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
      thumbnailUrl: pr.thumbnail_url?.trim() || null,
      qty,
      unitPricePhp: unitWithOptions,
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

    const cartActions = commerceCartActions;
    if (!cartActions) {
      setOrderErr(t("store_err_cart_add_failed"));
      return;
    }
    const addResult = cartActions.addOrMergeLine(lineInput);
    if (!addResult.ok && addResult.reason === "blocked_by_other_store") {
      dibayPerfRecordCartBlockedByOtherStore({
        existingStoreId: addResult.existingStoreId,
        nextStoreId: addResult.nextStoreId,
      });
      openStoreCartConflict(
        lineInput,
        storeCartConflictExistingFromBlockedAdd(addResult),
        () => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => dibayPerfOnCartbarUpdated(st.id));
          });
          setOrderOk(t("common_add_to_cart"));
        }
      );
      return;
    }
    if (!addResult.ok) {
      setOrderErr(t("store_err_cart_add_failed"));
      return;
    }

    dibayPerfRecordAddToCartClick(st.id);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => dibayPerfOnCartbarUpdated(st.id));
    });
    setOrderOk(t("common_add_to_cart"));
  }

  const menuGroup =
    menuSectionNameFromEmbed(product.store_menu_sections) ??
    categoryNameFromEmbed(product.store_product_categories);
  const itemTypeLabel = itemTypeShortLabel(product.item_type, language);
  const showRepresentativeBadge = !!(product.is_representative || product.is_featured);
  const badges = [
    showRepresentativeBadge ? t("common_representative") : null,
    itemTypeLabel,
    product.pickup_available ? t("common_pickup_label") : null,
    product.local_delivery_available ||
    product.shipping_available ||
    store?.delivery_available === true
      ? t("common_delivery_label")
      : null,
  ].filter(Boolean) as string[];

  const hasBaseDiscount =
    product.discount_price != null &&
    Number.isFinite(product.discount_price) &&
    product.discount_price >= 0 &&
    product.discount_price < product.price &&
    product.price > 0;

  const displayDiscountPct = (() => {
    const dp = product.discount_percent;
    if (dp != null && Number.isFinite(Number(dp)) && Number(dp) > 0) {
      return Math.floor(Number(dp));
    }
    if (hasBaseDiscount && product.discount_price != null) {
      return approximateDiscountPercent(Math.floor(product.price), Math.floor(product.discount_price));
    }
    return 0;
  })();

  const profileUrl = store.profile_image_url?.trim() || "";
  const cartQtyThisStore = commerceCart?.hydrated ? commerceCart.getTotalQtyForStoreId(store.id) : 0;

  return (
    <div className={`min-h-screen bg-sam-app ${cartQtyThisStore > 0 ? "pb-28" : "pb-10"}`}>
      <header className={`${STORE_DETAIL_SUBHEADER_STICKY} flex items-center justify-center px-4 py-2.5`}>
        <h1 className="truncate text-center sam-text-body font-semibold text-sam-fg">{product.title}</h1>
      </header>

      <nav className="border-b border-sam-border-soft bg-sam-surface px-4 py-2 sam-text-helper text-sam-muted" aria-label={t("common_location")}>
        <Link href={`/stores/${encodeURIComponent(store.slug)}`} className="text-signature">
          {store.store_name}
        </Link>
        {menuGroup ? (
          <>
            <span className="mx-1 text-sam-meta">/</span>
            <span className="text-sam-muted">{menuGroup}</span>
          </>
        ) : null}
      </nav>

      <div className="bg-sam-surface">
        <div className="relative aspect-square w-full bg-sam-surface-muted">
          {heroImageUrl ? (
            <img src={heroImageUrl} alt="" className="h-full w-full object-cover" />
          ) : profileUrl ? (
            <div className="relative flex h-full w-full items-center justify-center bg-gradient-to-br from-sam-border-soft via-sam-surface-muted to-sam-surface-muted">
              <img
                src={profileUrl}
                alt=""
                className="max-h-[58%] max-w-[58%] rounded-ui-rect object-contain shadow-sam-elevated ring-4 ring-sam-surface/80"
              />
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-sam-surface-muted to-sam-muted text-7xl text-white/95">
              🍽️
            </div>
          )}
          {showRepresentativeBadge ? (
            <span className="absolute bottom-3 left-3 rounded-full bg-black/70 px-2.5 py-1 sam-text-xxs font-semibold text-amber-200">
              {t("common_representative")}
            </span>
          ) : null}
        </div>
        {detailGalleryUrls.length > 0 ? (
          <>
            <div className="relative aspect-[4/3] w-full border-b border-sam-border-soft bg-sam-surface-muted">
              <img
                src={detailGalleryUrls[detailGalleryIdx] ?? ""}
                alt=""
                loading={detailGalleryIdx === 0 ? "eager" : "lazy"}
                className="h-full w-full object-cover"
              />
            </div>
            <HorizontalDragScroll
              className="flex snap-x snap-mandatory gap-2 overflow-x-auto border-b border-sam-border-soft px-3 py-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              aria-label={t("common_image")}
            >
              {detailGalleryUrls.map((u, i) => (
                <button
                  key={`${u}-${i}`}
                  type="button"
                  onClick={() => setDetailGalleryIdx(i)}
                  className={`relative h-14 w-14 shrink-0 snap-start overflow-hidden rounded-ui-rect ring-2 ring-offset-1 ${
                    i === detailGalleryIdx ? "ring-signature" : "ring-transparent opacity-80"
                  }`}
                >
                  <img src={u} alt="" loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
            </HorizontalDragScroll>
          </>
        ) : null}
        <div className="border-b border-sam-border-soft px-4 py-4">
          <p className="text-lg font-semibold text-sam-fg">{product.title}</p>
          {product.summary?.trim() ? (
            <p className="mt-1 text-sm text-sam-muted">{product.summary.trim()}</p>
          ) : null}
          <p className="mt-3 text-xl font-bold text-sam-fg">{formatMoneyPhp(unitWithOptions)}</p>
          {hasBaseDiscount ? (
            <p className="mt-1 text-sm text-sam-meta line-through">{formatMoneyPhp(product.price)}</p>
          ) : null}
          {optionValidation.ok && optionValidation.unitDelta > 0 ? (
            <p className="mt-1 text-xs text-sam-muted">
              {t("store_options_add_amount", { amount: formatMoneyPhp(optionValidation.unitDelta) })}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-sam-muted">
            {trackInv ? t("store_stock_qty", { count: product.stock_qty }) : t("store_stock_untracked")}
          </p>
          {displayDiscountPct > 0 ? (
            <p className="mt-1 text-xs font-medium text-rose-600">{t("store_discount_applied", { pct: displayDiscountPct })}</p>
          ) : null}
          {badges.length > 0 ? (
            <p className="mt-2 text-xs text-sam-muted">{badges.join(" · ")}</p>
          ) : null}
          <p className="mt-3 text-center">
            <Link
              href={`/stores/${encodeURIComponent(store.slug)}/report?product=${encodeURIComponent(product.id)}`}
              className="text-xs text-sam-meta underline decoration-sam-meta underline-offset-2"
            >
              {t("store_report_product")}
            </Link>
          </p>
        </div>
      </div>

      <div className="mx-4 mt-4 space-y-4 rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
        {commerce.breakConfigured ? (
          <p className="sam-text-helper font-medium text-sam-fg">
            Break time: {commerce.breakRangeLabel}
          </p>
        ) : null}
        {commerce.inBreak ? (
          <p className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 sam-text-helper font-medium leading-snug text-amber-950">
            {t("common_break_time_menu_blocked", { time: commerce.breakRangeLabel })}
          </p>
        ) : !commerce.isOpenForCommerce ? (
          <p className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 sam-text-helper font-medium leading-snug text-amber-950">
            {t("common_preparing_order_cart_blocked")}
          </p>
        ) : null}
        <div>
          <p className="text-sm font-medium text-sam-fg">{store.store_name}</p>
          <Link
            href={`/stores/${encodeURIComponent(store.slug)}`}
            className="mt-2 inline-block text-sm text-signature"
          >
            {t("common_view_store")}
          </Link>
          {store.phone ? (
            <p className="mt-2 text-sm text-sam-muted">
              {(() => {
                const href = telHrefFromLoosePhPhone(store.phone) ?? `tel:${String(store.phone).replace(/\s/g, "")}`;
                const label =
                  parsePhMobileInput(store.phone).length === 11
                    ? formatPhMobileDisplay(parsePhMobileInput(store.phone))
                    : store.phone;
                return (
                  <a href={href} className="text-signature">
                    {label}
                  </a>
                );
              })()}
            </p>
          ) : null}
        </div>

        {fulfillmentOptions.length === 0 ? (
          <p className="text-sm text-sam-muted">{t("common_preparing_order_blocked")}</p>
        ) : trackInv && product.stock_qty <= 0 ? (
          <p className="text-sm text-sam-muted">{t("common_sold_out_product")}</p>
        ) : trackInv && product.stock_qty < minQ ? (
          <p className="text-sm text-amber-800">
            {t("store_stock_below_min", { min: minQ })}
          </p>
        ) : (
          <>
            {optionGroups.length > 0 ? (
              <div>
                <StoreModifierPicker
                  groups={optionGroups}
                  value={modifierWire}
                  onChange={setModifierWire}
                  disabled={orderBusy || orderBlocked}
                />
                {optionValidation.ok && optionValidation.snapshot.summary ? (
                  <div className="mt-3 rounded-ui-rect bg-sam-app px-3 py-2 sam-text-helper text-sam-fg">
                    <p className="font-semibold text-sam-fg">{t("store_selected_options")}</p>
                    <p className="mt-1 leading-relaxed">{optionValidation.snapshot.summary}</p>
                  </div>
                ) : null}
                {!optionValidation.ok ? (
                  <p className="mt-2 text-xs text-amber-800">{t("store_required_options_hint")}</p>
                ) : null}
              </div>
            ) : null}

            <div>
              <label htmlFor="store-product-line-memo" className="text-xs font-medium text-sam-muted">
                {t("store_product_request_optional")}
              </label>
              <textarea
                id="store-product-line-memo"
                rows={2}
                value={lineMemo}
                disabled={orderBusy || orderBlocked}
                onChange={(e) => setLineMemo(e.target.value)}
                className="mt-2 w-full resize-none rounded-ui-rect border border-sam-border px-3 py-2 text-sm text-sam-fg placeholder:text-sam-meta"
                placeholder={t("store_request_placeholder_alt")}
                maxLength={300}
              />
            </div>

            <div>
              <p className="text-xs font-medium text-sam-muted">{t("store_quantity")}</p>
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  disabled={qty <= minQ || orderBusy || orderBlocked}
                  onClick={() => setQty((q) => Math.max(minQ, q - 1))}
                  className="h-9 w-9 rounded-ui-rect border border-sam-border text-lg leading-none text-sam-fg disabled:opacity-40"
                >
                  −
                </button>
                <span className="min-w-[2rem] text-center sam-text-body font-medium">{qty}</span>
                <button
                  type="button"
                  disabled={qty >= capQty || orderBusy || orderBlocked}
                  onClick={() => setQty((q) => Math.min(capQty, q + 1))}
                  className="h-9 w-9 rounded-ui-rect border border-sam-border text-lg leading-none text-sam-fg disabled:opacity-40"
                >
                  +
                </button>
              </div>
              <p className="mt-1 sam-text-xxs text-sam-meta">
                {trackInv
                  ? t("store_qty_min_max_stock", { min: minQ, max: maxQ, stock: product.stock_qty })
                  : t("store_qty_min_max", { min: minQ, max: maxQ })}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-sam-muted">{t("store_fulfillment_mode_label")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {fulfillmentOptions.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    disabled={orderBusy || orderBlocked}
                    onClick={() => setFulfillment((prev) => (prev === o.value ? prev : o.value))}
                    className={`rounded-full px-3 py-1.5 sam-text-body-secondary ${
                      fulfillment === o.value
                        ? "bg-signature text-white"
                        : "border border-sam-border bg-sam-surface text-sam-fg"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-sam-muted">
                {t("store_contact_optional")}{" "}
                {fulfillment === "pickup" ? (
                  <span className="font-normal text-sam-meta">{t("store_optional_paren")}</span>
                ) : (
                  <span className="text-red-600">*</span>
                )}
              </p>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={formatPhMobileDisplay(buyerPhone)}
                disabled={orderBusy || orderBlocked}
                onChange={(e) => setBuyerPhone(parsePhMobileInput(e.target.value))}
                placeholder={PH_LOCAL_09_PLACEHOLDER}
                className="mt-2 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-sm text-sam-fg placeholder:text-sam-meta"
                aria-label={t("store_order_contact_aria")}
              />
            </div>

            <div>
              <label htmlFor="store-order-note" className="text-xs font-medium text-sam-muted">
                {t("store_request_optional_label")}
              </label>
              <textarea
                id="store-order-note"
                rows={2}
                value={buyerNote}
                disabled={orderBusy || orderBlocked}
                onChange={(e) => setBuyerNote(e.target.value)}
                className="mt-2 w-full resize-none rounded-ui-rect border border-sam-border px-3 py-2 text-sm text-sam-fg placeholder:text-sam-meta"
                placeholder={t("store_pickup_time_placeholder")}
                maxLength={500}
              />
            </div>

            <div className="space-y-1.5 rounded-ui-rect bg-sam-app px-3 py-2.5 text-sm text-sam-fg">
              <div className="flex justify-between">
                <span className="text-sam-muted">{t("store_product_amount")}</span>
                <span className="font-semibold">{formatMoneyPhp(lineSubtotalPhp)}</span>
              </div>
              {fulfillment === "local_delivery" ? (
                <div className="flex justify-between">
                  <span className="text-sam-muted">{t("store_delivery_fee")}</span>
                  <span className="text-right font-semibold">
                    {storeExtras.deliveryFeeMode === "courier" ?
                      storeExtras.deliveryCourierLabel?.trim() ?
                        `${t("store_cod_label")} · ${storeExtras.deliveryCourierLabel.trim()}`
                      : t("store_cod_label")
                    : storeExtras.deliveryFeeMode === "self_free_promo" ?
                      <span className="inline-flex flex-col items-end gap-0.5">
                        <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                          <span className="text-[13px] font-semibold text-[#2563EB]">{t("store_free_delivery_applied")}</span>
                          {storeExtras.deliveryFeeStrikeReferencePhp != null &&
                          storeExtras.deliveryFeeStrikeReferencePhp > 0 ? (
                            <span className="text-[13px] font-medium text-sam-meta line-through">
                              {formatMoneyPhp(storeExtras.deliveryFeeStrikeReferencePhp)}
                            </span>
                          ) : null}
                        </span>
                        <span className="tabular-nums">{formatMoneyPhp(deliveryFeeLine)}</span>
                      </span>
                    : formatMoneyPhp(deliveryFeeLine)}
                  </span>
                </div>
              ) : null}
              {fulfillment === "local_delivery" &&
              storeExtras.deliveryFeeMode === "self" &&
              deliveryFeeLine === 0 &&
              storeExtras.deliveryFeePhp != null &&
              storeExtras.deliveryFeePhp > 0 &&
              storeExtras.freeDeliveryOverPhp != null &&
              storeExtras.freeDeliveryOverPhp > 0 &&
              lineSubtotalPhp >= storeExtras.freeDeliveryOverPhp ? (
                <p className="sam-text-xxs text-emerald-800">
                  {t("store_free_delivery_threshold_met", {
                    amount: formatMoneyPhp(storeExtras.freeDeliveryOverPhp),
                  })}
                </p>
              ) : null}
              <div className="flex justify-between border-t border-sam-border pt-1.5 sam-text-body font-bold text-sam-fg">
                <span>{t("store_planned_order_total")}</span>
                <span>{formatMoneyPhp(orderGrandDisplayPhp)}</span>
              </div>
            </div>
            {belowStoreMinOrder && !orderBlocked ? (
              <p className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 text-center sam-text-helper font-medium leading-snug text-amber-950">
                {t("store_min_order_shortfall", {
                  min: formatMoneyPhp(minOrderStorePhp),
                  short: formatMoneyPhp(minOrderStorePhp - lineSubtotalPhp),
                })}
              </p>
            ) : null}

            {orderErr ? <p className="text-sm text-red-600">{orderErr}</p> : null}
            {orderOk ? (
              <div className="space-y-2 rounded-ui-rect bg-green-50 px-3 py-2">
                <p className="text-sm text-green-800">{orderOk}</p>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium">
                    <Link href="/my/store-orders" className="font-semibold text-signature underline">
                      {t("store_view_order_history")}
                    </Link>
                    {lastPlacedOrderId ? (
                      <Link
                        href={`/my/store-orders/${encodeURIComponent(lastPlacedOrderId)}`}
                        className="text-signature underline"
                      >
                        {t("store_view_order_progress")}
                      </Link>
                    ) : null}
                    {lastPlacedOrderId ? (
                      <Link
                        href={`/my/store-orders/${encodeURIComponent(lastPlacedOrderId)}/chat`}
                        className="text-signature underline"
                      >
                        {t("store_leave_store_inquiry")}
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex gap-2">
              {commerceCart ? (
                <button
                  type="button"
                  disabled={orderBusy || !optionValidation.ok || orderBlocked}
                  onClick={() => addToCart()}
                  className="flex-1 rounded-ui-rect border border-sam-border bg-sam-surface py-3 sam-text-body font-semibold text-sam-fg disabled:opacity-50"
                >
                  {t("store_add_to_cart")}
                </button>
              ) : null}
              <button
                type="button"
                disabled={
                  orderBusy || !optionValidation.ok || orderBlocked || belowStoreMinOrder
                }
                onClick={() => void submitOrder()}
                className={`rounded-ui-rect bg-signature py-3 sam-text-body font-semibold text-white disabled:opacity-50 ${
                  commerceCart ? "flex-1" : "w-full"
                }`}
              >
                {orderBusy ? t("common_processing") : t("common_order_now")}
              </button>
            </div>
            <p className="text-center sam-text-xxs text-sam-meta">
              {t("store_order_flow_hint")}
            </p>
          </>
        )}
      </div>

      <StoreDetailBottomStrip
        slug={store.slug}
        isOpen={commerce.isOpenForCommerce}
        deliveryAvailable={store.delivery_available === true}
        fulfillmentMode={fulfillment === "pickup" ? "pickup" : "local_delivery"}
        cartTotalPhp={commerceCart?.hydrated ? commerceCart.getSubtotalForStoreId(store.id) : 0}
        cartQtyTotal={commerceCart?.hydrated ? commerceCart.getTotalQtyForStoreId(store.id) : 0}
        cartLineKindCount={
          commerceCart?.hydrated ? commerceCart.getItemCountForStoreId(store.id) : 0
        }
        minOrderPhp={storeExtras.minOrderPhp}
        closedDetail={
          commerce.inBreak && commerce.breakConfigured ? commerce.breakRangeLabel : null
        }
        onCartPreviewOpen={() =>
          router.push(`/stores/${encodeURIComponent(store.slug)}/cart`)
        }
      />
    </div>
  );
}
