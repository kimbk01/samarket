"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { useStoreCommerceCartOptional } from "@/contexts/StoreCommerceCartContext";
import { sanitizeProductHtml } from "@/lib/html/sanitize-product-html";
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
  description_html: string | null;
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
  const { t } = useI18n();
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
  const [orderErr, setOrderErr] = useState<string | null>(null);
  const [orderOk, setOrderOk] = useState<string | null>(null);
  const [lastPlacedOrderId, setLastPlacedOrderId] = useState<string | null>(null);
  const [galleryIdx, setGalleryIdx] = useState(0);
  const [modifierWire, setModifierWire] = useState<ModifierSelectionsWire>({ pick: {}, qty: {} });
  const [lineMemo, setLineMemo] = useState("");
  const [hoursTick, setHoursTick] = useState(0);

  useEffect(() => {
    void router.prefetch("/my/store-orders");
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.setInterval(() => setHoursTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const galleryUrls = useMemo(() => {
    if (!product) return [];
    const extra = parseMediaUrlsJson(product.images_json, 12);
    const thumb = product.thumbnail_url?.trim() || "";
    const ordered: string[] = [];
    const seen = new Set<string>();
    if (thumb) {
      ordered.push(thumb);
      seen.add(thumb);
    }
    for (const u of extra) {
      if (!seen.has(u)) {
        seen.add(u);
        ordered.push(u);
      }
    }
    return ordered;
  }, [product]);

  useEffect(() => {
    setGalleryIdx(0);
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

  const safeHtml = product?.description_html
    ? sanitizeProductHtml(product.description_html)
    : "";

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
      setOrderErr(
        `이 매장 최소 주문 금액은 ${formatMoneyPhp(minStorePhp)}입니다. 수량을 늘리거나 장바구니에서 합계를 맞춰 주세요.`
      );
      return;
    }
    setOrderErr(null);
    setOrderOk(null);
    setOrderBusy(true);
    try {
      const { status, json } = await postMeStoreOrder({
        store_id: st.id,
        items: [
          {
            product_id: pr.id,
            qty,
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
      });
      if (status === 401) {
        setOrderErr(t("common_login_required"));
        return;
      }
      const orderJ = json as { ok?: boolean; error?: string; order?: { id?: string; order_no?: string } };
      if (!orderJ?.ok) {
        const code = typeof orderJ.error === "string" ? orderJ.error : "order_failed";
        const msg =
          code === "insufficient_stock"
            ? "재고가 부족합니다. 수량을 줄이거나 새로고침 후 다시 시도해 주세요."
            : code === "store_not_selling"
              ? "이 매장은 현재 주문을 받지 않습니다."
              : code === "store_closed"
                ? "지금은 준비 중이라 주문할 수 없습니다."
                : code === "below_min_order"
                  ? "최소 주문 금액에 맞지 않습니다. 금액을 늘린 뒤 다시 시도해 주세요."
                  : code === "cannot_order_own_store"
                ? "본인 매장 상품은 주문할 수 없습니다."
                : code === "options_too_few"
                  ? "필수 옵션을 모두 선택해 주세요."
                  : code === "options_too_many"
                    ? "옵션 선택 개수가 너무 많습니다."
                    : code === "options_invalid_choice"
                      ? "선택할 수 없는 옵션이 포함되어 있습니다."
                      : code === "options_unknown_group"
                        ? "옵션 정보가 맞지 않습니다. 새로고침 후 다시 시도해 주세요."
                        : code === "options_not_configured"
                          ? "이 상품은 옵션을 지원하지 않습니다. 새로고침 후 다시 시도해 주세요."
                          : code === "options_duplicate_choice"
                            ? "같은 옵션을 중복 선택했습니다."
                            : code === "duplicate_line_in_order"
                              ? "주문에 같은 구성의 상품이 중복되었습니다."
                              : `주문에 실패했습니다. (${code})`;
        setOrderErr(msg);
        return;
      }
      const placedId = typeof orderJ.order?.id === "string" ? orderJ.order.id : null;
      if (placedId) {
        void router.prefetch("/my/store-orders");
        void router.prefetch(`/my/store-orders/${encodeURIComponent(placedId)}`);
        void router.prefetch(`/my/store-orders/${encodeURIComponent(placedId)}/chat`);
        window.dispatchEvent(new CustomEvent(KASAMA_BUYER_STORE_ORDERS_HUB_REFRESH));
        router.replace("/my/store-orders");
        return;
      }
      setOrderOk(`${t("notify_order_received_message")} ${orderJ.order?.order_no ?? ""}`.trim());
      setLastPlacedOrderId(null);
      await reloadProduct();
    } catch {
      setOrderErr(t("common_network_error_generic"));
    } finally {
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
    if (!st || !pr || !commerceCart) return;
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
    const others = commerceCart.otherBucketsExcluding(st.id);
    if (others.length > 0) {
      const o = others[0];
      window.alert(
        `다른 매장의 상품이 있습니다.\n${o.storeName} 장바구니를 주문하거나 비운 뒤 이 매장에서 담을 수 있어요.`
      );
      router.push(`/stores/${encodeURIComponent(o.storeSlug)}/cart`);
      return;
    }
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
    commerceCart.addOrMergeLine({
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
    });
    setOrderOk(t("common_add_to_cart"));
  }

  const menuGroup =
    menuSectionNameFromEmbed(product.store_menu_sections) ??
    categoryNameFromEmbed(product.store_product_categories);
  const itemTypeLabel = itemTypeShortLabel(product.item_type);
  const badges = [
    product.is_featured ? t("common_representative") : null,
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

  return (
    <div className="min-h-screen bg-sam-app pb-28">
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
          {galleryUrls[galleryIdx] ? (
             
            <img
              src={galleryUrls[galleryIdx]}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : profileUrl ? (
            <div className="relative flex h-full w-full items-center justify-center bg-gradient-to-br from-sam-border-soft via-sam-surface-muted to-sam-surface-muted">
              { }
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
          {product.is_featured ? (
            <span className="absolute bottom-3 left-3 rounded-full bg-black/70 px-2.5 py-1 sam-text-xxs font-semibold text-amber-200">
              {t("common_representative")}
            </span>
          ) : null}
        </div>
        {galleryUrls.length > 1 ? (
          <HorizontalDragScroll
            className="flex gap-2 overflow-x-auto border-b border-sam-border-soft px-3 py-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            aria-label={t("common_image")}
          >
            {galleryUrls.map((u, i) => (
              <button
                key={`${u}-${i}`}
                type="button"
                onClick={() => setGalleryIdx(i)}
                className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-ui-rect ring-2 ring-offset-1 ${
                  i === galleryIdx ? "ring-signature" : "ring-transparent opacity-80"
                }`}
              >
                { }
                <img src={u} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </HorizontalDragScroll>
        ) : null}
        <div className="border-b border-sam-border-soft px-4 py-4">
          <p className="text-lg font-semibold text-sam-fg">{product.title}</p>
          {product.summary && safeHtml ? (
            <p className="mt-1 text-sm text-sam-muted">{product.summary}</p>
          ) : null}
          <p className="mt-3 text-xl font-bold text-sam-fg">{formatMoneyPhp(unitWithOptions)}</p>
          {hasBaseDiscount ? (
            <p className="mt-1 text-sm text-sam-meta line-through">{formatMoneyPhp(product.price)}</p>
          ) : null}
          {optionValidation.ok && optionValidation.unitDelta > 0 ? (
            <p className="mt-1 text-xs text-sam-muted">
              옵션 추가 {formatMoneyPhp(optionValidation.unitDelta)}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-sam-muted">
            {trackInv ? `재고 ${product.stock_qty}개` : "재고 확인 없음 · 수량 제한 없음"}
          </p>
          {displayDiscountPct > 0 ? (
            <p className="mt-1 text-xs font-medium text-rose-600">{displayDiscountPct}% 할인 적용</p>
          ) : null}
          {badges.length > 0 ? (
            <p className="mt-2 text-xs text-sam-muted">{badges.join(" · ")}</p>
          ) : null}
          <p className="mt-3 text-center">
            <Link
              href={`/stores/${encodeURIComponent(store.slug)}/report?product=${encodeURIComponent(product.id)}`}
              className="text-xs text-sam-meta underline decoration-sam-meta underline-offset-2"
            >
              상품 신고
            </Link>
          </p>
        </div>
      </div>

      {safeHtml ? (
        <div className="mt-2 border-t border-sam-border-soft bg-sam-surface px-4 py-4">
          <h2 className="text-sm font-semibold text-sam-fg">{t("common_detail_description")}</h2>
          <div
            className="mt-2 max-w-none sam-text-body leading-relaxed text-sam-fg [&_img]:max-w-full [&_p]:my-2"
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
        </div>
      ) : product.summary?.trim() ? (
        <div className="mt-2 border-t border-sam-border-soft bg-sam-surface px-4 py-4">
          <h2 className="text-sm font-semibold text-sam-fg">{t("common_detail_description")}</h2>
          <p className="mt-2 sam-text-body leading-relaxed text-sam-fg">{product.summary.trim()}</p>
        </div>
      ) : null}

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
            재고가 최소 주문 수량({minQ}개)보다 적어 주문할 수 없습니다.
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
                    <p className="font-semibold text-sam-fg">선택한 옵션</p>
                    <p className="mt-1 leading-relaxed">{optionValidation.snapshot.summary}</p>
                  </div>
                ) : null}
                {!optionValidation.ok ? (
                  <p className="mt-2 text-xs text-amber-800">필수 옵션을 확인해 주세요.</p>
                ) : null}
              </div>
            ) : null}

            <div>
              <label htmlFor="store-product-line-memo" className="text-xs font-medium text-sam-muted">
                상품 요청 (선택 · 가격에 반영되지 않음)
              </label>
              <textarea
                id="store-product-line-memo"
                rows={2}
                value={lineMemo}
                disabled={orderBusy || orderBlocked}
                onChange={(e) => setLineMemo(e.target.value)}
                className="mt-2 w-full resize-none rounded-ui-rect border border-sam-border px-3 py-2 text-sm text-sam-fg placeholder:text-sam-meta"
                placeholder="예) 국물 많이 주세요"
                maxLength={300}
              />
            </div>

            <div>
              <p className="text-xs font-medium text-sam-muted">수량</p>
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
                최소 {minQ}개 · 최대 {maxQ}개
                {trackInv ? ` (재고 ${product.stock_qty}개)` : ""}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-sam-muted">수령 방식</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {fulfillmentOptions.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    disabled={orderBusy || orderBlocked}
                    onClick={() => setFulfillment(o.value)}
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
                연락처{" "}
                {fulfillment === "pickup" ? (
                  <span className="font-normal text-sam-meta">(선택)</span>
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
                aria-label="주문 연락처"
              />
            </div>

            <div>
              <label htmlFor="store-order-note" className="text-xs font-medium text-sam-muted">
                요청 사항 (선택)
              </label>
              <textarea
                id="store-order-note"
                rows={2}
                value={buyerNote}
                disabled={orderBusy || orderBlocked}
                onChange={(e) => setBuyerNote(e.target.value)}
                className="mt-2 w-full resize-none rounded-ui-rect border border-sam-border px-3 py-2 text-sm text-sam-fg placeholder:text-sam-meta"
                placeholder="픽업 시간 등"
                maxLength={500}
              />
            </div>

            <div className="space-y-1.5 rounded-ui-rect bg-sam-app px-3 py-2.5 text-sm text-sam-fg">
              <div className="flex justify-between">
                <span className="text-sam-muted">상품 금액</span>
                <span className="font-semibold">{formatMoneyPhp(lineSubtotalPhp)}</span>
              </div>
              {fulfillment === "local_delivery" ? (
                <div className="flex justify-between">
                  <span className="text-sam-muted">배달비</span>
                  <span className="font-semibold">{formatMoneyPhp(deliveryFeeLine)}</span>
                </div>
              ) : null}
              {fulfillment === "local_delivery" &&
              deliveryFeeLine === 0 &&
              storeExtras.deliveryFeePhp != null &&
              storeExtras.deliveryFeePhp > 0 &&
              storeExtras.freeDeliveryOverPhp != null &&
              storeExtras.freeDeliveryOverPhp > 0 &&
              lineSubtotalPhp >= storeExtras.freeDeliveryOverPhp ? (
                <p className="sam-text-xxs text-emerald-800">
                  무료배달 기준({formatMoneyPhp(storeExtras.freeDeliveryOverPhp)} 이상) 충족으로 배달비 면제
                </p>
              ) : null}
              {fulfillment === "local_delivery" && storeExtras.deliveryCourierLabel?.trim() ? (
                <p className="sam-text-xxs leading-snug text-sam-muted">
                  배달 업체(안내): {storeExtras.deliveryCourierLabel.trim()} · 청구 금액에 포함되지 않음
                </p>
              ) : null}
              <div className="flex justify-between border-t border-sam-border pt-1.5 sam-text-body font-bold text-sam-fg">
                <span>주문 예정 금액</span>
                <span>{formatMoneyPhp(orderGrandDisplayPhp)}</span>
              </div>
            </div>
            {belowStoreMinOrder && !orderBlocked ? (
              <p className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 text-center sam-text-helper font-medium leading-snug text-amber-950">
                최소 주문 {formatMoneyPhp(minOrderStorePhp)} 이상부터 주문할 수 있습니다. (부족{" "}
                {formatMoneyPhp(minOrderStorePhp - lineSubtotalPhp)}) · 장바구니에 더 담거나 수량을
                늘려 주세요.
              </p>
            ) : null}

            {orderErr ? <p className="text-sm text-red-600">{orderErr}</p> : null}
            {orderOk ? (
              <div className="space-y-2 rounded-ui-rect bg-green-50 px-3 py-2">
                <p className="text-sm text-green-800">{orderOk}</p>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium">
                    <Link href="/my/store-orders" className="font-semibold text-signature underline">
                      주문 내역 확인
                    </Link>
                    {lastPlacedOrderId ? (
                      <Link
                        href={`/my/store-orders/${encodeURIComponent(lastPlacedOrderId)}`}
                        className="text-signature underline"
                      >
                        이 주문 진행 보기
                      </Link>
                    ) : null}
                    {lastPlacedOrderId ? (
                      <Link
                        href={`/my/store-orders/${encodeURIComponent(lastPlacedOrderId)}/chat`}
                        className="text-signature underline"
                      >
                        매장 문의 남기기
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
                  장바구니 담기
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
              주문 접수와 상태 확인은 주문 상세에서 이어지고, 매장과 조율이 필요할 때만 배달채팅을 이용하면
              됩니다. 금액 정산은 매장과 직접 하시면 됩니다.
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
        minOrderPhp={storeExtras.minOrderPhp}
        closedDetail={
          commerce.inBreak && commerce.breakConfigured ? `Break time: ${commerce.breakRangeLabel}` : null
        }
      />
    </div>
  );
}
