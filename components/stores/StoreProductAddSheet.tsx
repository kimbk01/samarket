"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  type AddStoreCartLineInput,
  useStoreCommerceCartActionsOptional,
} from "@/contexts/StoreCommerceCartContext";
import { openStoreCartConflict } from "@/lib/stores/store-cart-conflict-ui-store";
import { storeCartConflictExistingFromBlockedAdd } from "@/lib/stores/store-cart-conflict-meta";
import type { ModifierSelectionsWire } from "@/lib/stores/modifiers/types";
import { StoreModifierPicker } from "@/components/stores/modifiers/StoreModifierPicker";
import { parseProductOptionsJson } from "@/lib/stores/product-line-options";
import { approximateDiscountPercent } from "@/lib/stores/store-product-pricing";
import { formatMoneyPhp } from "@/lib/utils/format";
import { resolveStoreFrontCommerceState } from "@/lib/stores/store-auto-hours";
import {
  fetchStoreReviewsPublicDeduped,
} from "@/lib/stores/store-delivery-api-client";
import type { StoreDetailLike } from "@/lib/stores/store-public-page-hydrate";
import { mapListRowToSheetProduct } from "@/lib/stores/map-list-row-to-sheet-product";
import type { SheetPublicStore } from "@/lib/stores/map-list-row-to-sheet-product";
import { calculateStoreProductBaseUnit } from "@/lib/stores/product-sheet/calculate-store-product-line-price";
import { validateStoreProductRequiredOptions } from "@/lib/stores/product-sheet/validate-store-product-required-options";
import { useStoreProductSheetDetail } from "@/lib/stores/product-sheet/use-store-product-sheet-detail";
import { StoreProductSheetShell } from "@/components/stores/product-sheet/StoreProductSheetShell";
import { StoreProductSheetHeader } from "@/components/stores/product-sheet/StoreProductSheetHeader";
import {
  StoreProductSheetBodySkeleton,
  StoreProductSheetOptionsSkeleton,
} from "@/components/stores/product-sheet/StoreProductSheetSkeleton";
import {
  STORE_ORDER_BRAND,
  STORE_ORDER_CTA_PRIMARY,
  STORE_ORDER_CTA_STEPPER,
  STORE_ORDER_TOUCH_BTN,
} from "@/components/stores/store-order-detail/store-order-brand";
import {
  dibayPerfOnCartbarUpdated,
  dibayPerfOnOptionPriceUpdated,
  dibayPerfOnOptionSheetVisible,
  dibayPerfRecordAddToCartClick,
  dibayPerfRecordCartBlockedByOtherStore,
  dibayPerfRecordModifierIntent,
} from "@/lib/dibay/delivery-flow-perf";
import {
  DELIVERY_PERF_TAG_CART_PATCH,
  DELIVERY_PERF_TAG_OPTION_SHEET,
  deliveryPerfTraceLog,
} from "@/lib/dibay/delivery-perf-trace";
import { deliveryRenderTraceBump } from "@/lib/dibay/delivery-render-trace";
import {
  countRequiredOptionGroups,
  countSelectedOptions,
  deliveryOptionTraceNow,
  type DeliveryOptionHydrateState,
  traceDeliveryOptionAddSubmitMs,
  traceDeliveryOptionPricePatchMs,
  traceDeliveryOptionSelectMs,
  traceDeliveryOptionSheetOpenMs,
  traceDeliveryOptionValidationMs,
} from "@/lib/dibay/delivery-option-sheet-trace";
import { getStoreProductSheetOpenMark } from "@/lib/stores/store-product-sheet-ui-store";

type PublicStore = SheetPublicStore;

type ReviewSnippet = { content: string; created_at: string; rating: number | null };

export function StoreProductAddSheet({
  productId,
  pageStoreSlug,
  prefetchedListRow,
  sheetStoreContext,
  onClose,
  commerceBlocked,
  commerceBlockedHint,
  onAddedToCart,
}: {
  productId: string | null;
  pageStoreSlug: string;
  prefetchedListRow?: Record<string, unknown> | null;
  sheetStoreContext?: {
    store: StoreDetailLike;
    favoriteCount: number;
    recentOrderCount: number;
  } | null;
  onClose: () => void;
  commerceBlocked: boolean;
  commerceBlockedHint?: string;
  onAddedToCart?: () => void;
}) {
  const { t } = useI18n();
  const commerceCart = useStoreCommerceCartActionsOptional();

  const seedPair = useMemo(() => {
    const row = prefetchedListRow ?? null;
    const ctx = sheetStoreContext ?? null;
    if (!row || !ctx?.store) return null;
    return mapListRowToSheetProduct(row, ctx.store, {
      favoriteCount: ctx.favoriteCount,
      recentOrderCount: ctx.recentOrderCount,
    });
  }, [prefetchedListRow, sheetStoreContext]);

  const hasSeed = seedPair != null;
  const [retryTick, setRetryTick] = useState(0);
  const bumpRetry = useCallback(() => setRetryTick((n) => n + 1), []);

  const detail = useStoreProductSheetDetail({
    productId,
    pageStoreSlug,
    hasSeed,
    retryTick,
    perfStoreId: sheetStoreContext?.store?.id,
    onRetryIncrement: bumpRetry,
  });

  const slugBlocked = detail.slugBlocked;
  const product = slugBlocked
    ? null
    : (detail.apiProduct ?? seedPair?.product ?? null);
  const store = slugBlocked ? null : (detail.apiStore ?? seedPair?.store ?? null);

  const [qty, setQty] = useState(1);
  const [modifierWire, setModifierWire] = useState<ModifierSelectionsWire>({ pick: {}, qty: {} });
  const [sheetErr, setSheetErr] = useState<string | null>(null);
  const [hoursTick, setHoursTick] = useState(0);
  const [reviewSnippets, setReviewSnippets] = useState<ReviewSnippet[]>([]);
  const [lineNote, setLineNote] = useState("");
  const priceInteractionRef = useRef<string | null>(null);
  const sheetPerfOnceRef = useRef<string | null>(null);
  const renderCountRef = useRef(0);
  const validationCostMsRef = useRef(0);
  const priceCostMsRef = useRef(0);
  const optionInteractionRef = useRef<{
    t: number;
    productId: string | null;
    kind: "option" | "quantity";
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.setInterval(() => setHoursTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!productId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [productId, onClose]);

  useEffect(() => {
    if (!product?.id) return;
    const minQ = Math.max(1, Number(product.min_order_qty) || 1);
    setQty(minQ);
    setModifierWire({ pick: {}, qty: {} });
    setLineNote("");
    setSheetErr(null);
  }, [product?.id]);

  const optionGroups = useMemo(
    () => (product ? parseProductOptionsJson(product.options_json) : []),
    [product?.options_json]
  );
  const requiredGroupCount = useMemo(() => countRequiredOptionGroups(optionGroups), [optionGroups]);

  const mergedHasOptionsFlag = !!(product?.has_options);

  useLayoutEffect(() => {
    if (!productId) {
      sheetPerfOnceRef.current = null;
      return;
    }
    if (sheetPerfOnceRef.current === productId) return;
    sheetPerfOnceRef.current = productId;
    dibayPerfOnOptionSheetVisible({
      storeId: sheetStoreContext?.store?.id,
      productId,
    });
    const openMs = Math.max(
      0,
      Math.round(
        (typeof performance !== "undefined" ? performance.now() : Date.now()) -
          getStoreProductSheetOpenMark()
      )
    );
    deliveryPerfTraceLog(DELIVERY_PERF_TAG_OPTION_SHEET, {
      event: "pass0_sheet_frame_visible",
      event_key: `pass0:${productId}`,
      product_id: productId,
      store_id: sheetStoreContext?.store?.id,
      has_seed: hasSeed,
      pass: 0,
      value_ms: openMs,
    });
    traceDeliveryOptionSheetOpenMs(openMs, {
      product_id: productId,
      store_id: sheetStoreContext?.store?.id ?? null,
      has_options: mergedHasOptionsFlag,
      required_group_count: 0,
      selected_option_count: 0,
      total_price: 0,
      hydrate_state: hasSeed ? "seed" : "loading",
      used_seed: hasSeed,
      full_hydrated: false,
      render_count: renderCountRef.current,
    });
  }, [productId, sheetStoreContext?.store?.id, hasSeed, mergedHasOptionsFlag]);

  const fetchResolvedOk = detail.phase === "ok";
  const optionHydrationFailed =
    mergedHasOptionsFlag &&
    detail.phase === "error" &&
    optionGroups.length === 0 &&
    hasSeed;
  const awaitingOptionHydration =
    mergedHasOptionsFlag &&
    optionGroups.length === 0 &&
    !fetchResolvedOk &&
    !optionHydrationFailed;

  const optionsPriceReady = !awaitingOptionHydration && !optionHydrationFailed;
  const hydrateState: DeliveryOptionHydrateState = optionHydrationFailed
    ? "error"
    : fetchResolvedOk
      ? "full"
      : hasSeed
        ? "seed"
        : detail.phase === "loading"
          ? "loading"
          : "empty";

  const sheetPrimaryImage = product?.thumbnail_url?.trim() || "";

  useEffect(() => {
    if (!store?.slug || !product?.id) {
      setReviewSnippets([]);
      return;
    }
    let cancelled = false;
    const slug = store.slug;
    const pid = product.id;
    const run = () => {
      void (async () => {
        try {
          const { json } = await fetchStoreReviewsPublicDeduped(slug);
          const rj = json as { ok?: boolean; reviews?: unknown[] };
          if (!rj?.ok || !Array.isArray(rj.reviews)) return;
          const rows = rj.reviews as {
            content?: unknown;
            created_at?: unknown;
            rating?: unknown;
            product_id?: unknown;
          }[];
          const forProduct = rows.filter((r) => r.product_id === pid);
          const pool = forProduct.length >= 2 ? forProduct : rows;
          const top: ReviewSnippet[] = [];
          for (const r of pool) {
            const content = String(r.content ?? "").trim();
            if (!content) continue;
            const created = String(r.created_at ?? "");
            const dateStr = created.slice(0, 10) || "—";
            top.push({
              content: content.length > 72 ? `${content.slice(0, 72)}…` : content,
              created_at: dateStr,
              rating: typeof r.rating === "number" && Number.isFinite(r.rating) ? r.rating : null,
            });
            if (top.length >= 2) break;
          }
          if (!cancelled) setReviewSnippets(top);
        } catch {
          if (!cancelled) setReviewSnippets([]);
        }
      })();
    };
    if (typeof queueMicrotask === "function") queueMicrotask(run);
    else setTimeout(run, 0);
    return () => {
      cancelled = true;
    };
  }, [store?.slug, product?.id]);

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

  const baseUnit = product ? calculateStoreProductBaseUnit(product) : 0;

  const optionValidation = useMemo(() => {
    const t = deliveryOptionTraceNow();
    const result = validateStoreProductRequiredOptions(optionGroups, modifierWire, baseUnit);
    validationCostMsRef.current = deliveryOptionTraceNow() - t;
    return result;
  }, [optionGroups, modifierWire, baseUnit]);

  const sheetCommerce = useMemo(() => {
    if (!store) return null;
    return resolveStoreFrontCommerceState(store.business_hours_json, store.is_open ?? null);
  }, [store, hoursTick]);

  void hoursTick;
  const orderBlocked =
    commerceBlocked || (sheetCommerce != null && !sheetCommerce.isOpenForCommerce);

  const trackInv = product?.track_inventory === true;
  const statusSoldOut = product?.product_status === "sold_out";
  const soldOut = !!(product && (statusSoldOut || (trackInv && product.stock_qty <= 0)));

  const minQ = product ? Math.max(1, Number(product.min_order_qty) || 1) : 1;
  const maxQ = product ? Math.max(minQ, Number(product.max_order_qty) || 99) : 99;
  const capQty = product ? (trackInv ? Math.min(maxQ, product.stock_qty) : maxQ) : maxQ;

  useEffect(() => {
    if (!product) return;
    setQty((q) => Math.max(minQ, Math.min(capQty, q)));
  }, [product, minQ, capQty]);

  const optionUnitDelta = optionValidation.ok ? optionValidation.unitDelta : 0;
  const priceSnapshot = useMemo(() => {
    const t = deliveryOptionTraceNow();
    const unit =
      product && optionsPriceReady && optionValidation.ok
        ? baseUnit + optionUnitDelta
        : baseUnit;
    const total = unit * qty;
    priceCostMsRef.current = deliveryOptionTraceNow() - t;
    return { unitWithOptions: unit, lineTotal: total };
  }, [product, optionsPriceReady, optionValidation.ok, optionUnitDelta, baseUnit, qty]);
  const unitWithOptions = priceSnapshot.unitWithOptions;
  const lineTotal = priceSnapshot.lineTotal;
  const selectedOptionCount = useMemo(() => countSelectedOptions(modifierWire), [modifierWire]);
  const optionTraceBase = useMemo(
    () => ({
      product_id: product?.id ?? productId,
      store_id: store?.id ?? sheetStoreContext?.store?.id ?? null,
      has_options: mergedHasOptionsFlag || optionGroups.length > 0,
      required_group_count: requiredGroupCount,
      selected_option_count: selectedOptionCount,
      total_price: lineTotal,
      hydrate_state: hydrateState,
      used_seed: hasSeed,
      full_hydrated: fetchResolvedOk,
      render_count: renderCountRef.current,
    }),
    [
      product?.id,
      productId,
      store?.id,
      sheetStoreContext?.store?.id,
      mergedHasOptionsFlag,
      optionGroups.length,
      requiredGroupCount,
      selectedOptionCount,
      lineTotal,
      hydrateState,
      hasSeed,
      fetchResolvedOk,
    ]
  );

  useLayoutEffect(() => {
    renderCountRef.current += 1;
    deliveryRenderTraceBump("sheet-add", {
      product_id: optionTraceBase.product_id ?? undefined,
      store_id: optionTraceBase.store_id ?? undefined,
      has_options: optionTraceBase.has_options,
      required_group_count: optionTraceBase.required_group_count,
      selected_option_count: optionTraceBase.selected_option_count,
      total_price: optionTraceBase.total_price,
      hydrate_state: optionTraceBase.hydrate_state,
      used_seed: optionTraceBase.used_seed,
      full_hydrated: optionTraceBase.full_hydrated,
      render_count: renderCountRef.current,
    });
  });

  const setModifierWireTracked = useCallback(
    (next: ModifierSelectionsWire | ((prev: ModifierSelectionsWire) => ModifierSelectionsWire)) => {
      optionInteractionRef.current = {
        t: deliveryOptionTraceNow(),
        productId: product?.id ?? productId,
        kind: "option",
      };
      dibayPerfRecordModifierIntent(product?.id);
      setModifierWire(next);
    },
    [product?.id, productId]
  );

  const setQtyTracked = useCallback(
    (updater: (prev: number) => number) => {
      optionInteractionRef.current = {
        t: deliveryOptionTraceNow(),
        productId: product?.id ?? productId,
        kind: "quantity",
      };
      setQty(updater);
    },
    [product?.id, productId]
  );

  useLayoutEffect(() => {
    const intent = optionInteractionRef.current;
    if (!intent || intent.productId !== (product?.id ?? productId)) return;
    optionInteractionRef.current = null;
    const elapsed = deliveryOptionTraceNow() - intent.t;
    const extra = {
      interaction_kind: intent.kind,
      price_calc_ms: Math.max(0, Math.round(priceCostMsRef.current)),
      validation_calc_ms: Math.max(0, Math.round(validationCostMsRef.current)),
      validation_ok: optionValidation.ok,
    };
    traceDeliveryOptionSelectMs(elapsed, optionTraceBase, extra);
    traceDeliveryOptionPricePatchMs(elapsed, optionTraceBase, extra);
    traceDeliveryOptionValidationMs(validationCostMsRef.current, optionTraceBase, extra);
  }, [modifierWire, qty, optionValidation.ok, optionTraceBase, product?.id, productId]);

  useEffect(() => {
    if (!productId) {
      priceInteractionRef.current = null;
      return;
    }
    const snap = JSON.stringify({ modifierWire, qty });
    if (priceInteractionRef.current === null) {
      priceInteractionRef.current = snap;
      return;
    }
    if (priceInteractionRef.current === snap) return;
    priceInteractionRef.current = snap;
    dibayPerfOnOptionPriceUpdated({ storeId: store?.id, productId: product?.id });
  }, [modifierWire, qty, productId, store?.id, product?.id]);

  const canSubmitOptions =
    !awaitingOptionHydration && !optionHydrationFailed && optionValidation.ok;

  const cartBarBump = useCallback((storeId: string) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        dibayPerfOnCartbarUpdated(storeId);
      });
    });
  }, []);

  function addToCart() {
    const submitStart = deliveryOptionTraceNow();
    const st = store;
    const pr = product;
    if (!st || !pr || !commerceCart) return;
    if (orderBlocked) {
      setSheetErr(
        commerceBlocked && commerceBlockedHint?.trim()
          ? commerceBlockedHint.trim()
          : sheetCommerce?.inBreak
            ? `준비중 · Break time: ${sheetCommerce.breakRangeLabel}. 쉬는 시간에는 담을 수 없습니다.`
            : "지금은 준비 중이라 담을 수 없습니다."
      );
      traceDeliveryOptionAddSubmitMs(deliveryOptionTraceNow() - submitStart, optionTraceBase, {
        status: "blocked_by_commerce",
      });
      return;
    }
    if (soldOut) {
      setSheetErr("품절인 상품은 담을 수 없습니다.");
      traceDeliveryOptionAddSubmitMs(deliveryOptionTraceNow() - submitStart, optionTraceBase, {
        status: "blocked_by_sold_out",
      });
      return;
    }
    if (!optionValidation.ok) {
      setSheetErr("옵션 선택을 확인해 주세요.");
      traceDeliveryOptionAddSubmitMs(deliveryOptionTraceNow() - submitStart, optionTraceBase, {
        status: "blocked_by_validation",
        validation_calc_ms: Math.max(0, Math.round(validationCostMsRef.current)),
      });
      return;
    }
    setSheetErr(null);
    const maxForCart = trackInv ? Math.min(maxQ, pr.stock_qty) : maxQ;
    const listBaseUnit = Math.floor(pr.price);
    const listWithOptions =
      listBaseUnit + (optionValidation.ok ? optionValidation.unitDelta : 0);
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
      thumbnailUrl: pr.thumbnail_url?.trim() || null,
      qty,
      unitPricePhp: unitWithOptions,
      listUnitPricePhp: hasLineDiscount ? listWithOptions : null,
      discountPercent: hasLineDiscount && lineDiscountPct > 0 ? lineDiscountPct : null,
      optionSelections: { ...modifierWire.pick },
      modifierWire: { ...modifierWire },
      optionsSummary: optionValidation.ok ? optionValidation.snapshot.summary : "",
      lineNote: lineNote.trim() || null,
      pickupAvailable: !!pr.pickup_available,
      localDeliveryAvailable:
        !!pr.local_delivery_available || st.delivery_available === true,
      shippingAvailable: !!pr.shipping_available,
      minOrderQty: minQ,
      maxOrderQty: maxForCart,
    };

    const addResult = commerceCart.addOrMergeLine(lineInput);
    if (!addResult.ok && addResult.reason === "blocked_by_other_store") {
      dibayPerfRecordCartBlockedByOtherStore({
        existingStoreId: addResult.existingStoreId,
        nextStoreId: addResult.nextStoreId,
      });
      traceDeliveryOptionAddSubmitMs(deliveryOptionTraceNow() - submitStart, optionTraceBase, {
        status: "blocked_by_other_store",
      });
      openStoreCartConflict(
        lineInput,
        storeCartConflictExistingFromBlockedAdd(addResult),
        () => {
          cartBarBump(st.id);
          onAddedToCart?.();
          onClose();
        }
      );
      return;
    }
    if (!addResult.ok) {
      setSheetErr("장바구니에 담을 수 없습니다.");
      traceDeliveryOptionAddSubmitMs(deliveryOptionTraceNow() - submitStart, optionTraceBase, {
        status: "failed",
      });
      return;
    }

    dibayPerfRecordAddToCartClick(st.id);
    traceDeliveryOptionAddSubmitMs(deliveryOptionTraceNow() - submitStart, optionTraceBase, {
      status: "ok",
    });
    cartBarBump(st.id);
    onAddedToCart?.();
    onClose();
  }

  if (!productId) return null;

  const showFullLoadingBody = !product && detail.phase === "loading" && !hasSeed;
  const showNotFound =
    slugBlocked ||
    (!product && !hasSeed && detail.phase !== "loading" && (detail.notFound || detail.phase === "error"));

  const ratingAvg = store ? Number(store.rating_avg) : NaN;
  const ratingLabel =
    store && Number.isFinite(ratingAvg) && ratingAvg > 0 ? ratingAvg.toFixed(1) : null;
  const reviewCountDisp = store ? Math.max(0, Math.floor(Number(store.review_count) || 0)) : 0;
  const favCount = store ? Math.max(0, Math.floor(Number(store.favorite_count) || 0)) : 0;
  const orderCountDisp = store ? Math.max(0, Math.floor(Number(store.recent_order_count) || 0)) : 0;

  const qtyStepperDisabled = soldOut || orderBlocked;
  const qtyMinusDisabled = qtyStepperDisabled || qty <= minQ;
  const qtyPlusDisabled = qtyStepperDisabled || qty >= capQty;

  const hasOptionDelta =
    optionsPriceReady && optionValidation.ok && optionValidation.unitDelta !== 0;
  const showListStrike = product && Math.floor(product.price) !== Math.floor(baseUnit);
  const showLineTotalInCard =
    qty > 1 || hasOptionDelta || (showListStrike && product !== null);

  const headerTitle = product?.title ?? (showFullLoadingBody ? "불러오는 중…" : "메뉴 담기");

  const ctaDisabled =
    soldOut ||
    orderBlocked ||
    !canSubmitOptions ||
    !commerceCart ||
    capQty < minQ ||
    awaitingOptionHydration ||
    optionHydrationFailed;

  const ctaLabel = awaitingOptionHydration
    ? "옵션을 불러오는 중…"
    : optionHydrationFailed
      ? "옵션을 불러올 수 없음"
      : `${formatMoneyPhp(lineTotal)} 담기`;

  return (
    <StoreProductSheetShell onBackdropClose={onClose}>
      <StoreProductSheetHeader title={headerTitle} onClose={onClose} />

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white [-webkit-overflow-scrolling:touch]">
        {showNotFound ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-sam-muted">
              {slugBlocked ? "이 매장의 메뉴가 아닙니다." : "상품을 불러올 수 없습니다."}
            </p>
            <button
              type="button"
              onClick={onClose}
              className={`mt-4 text-sm font-medium text-[#1C8DB8] underline-offset-2 hover:underline ${STORE_ORDER_TOUCH_BTN}`}
            >
              닫기
            </button>
          </div>
        ) : showFullLoadingBody ? (
          <StoreProductSheetBodySkeleton />
        ) : product && store ? (
          <div className="pb-3">
            {orderBlocked ? (
              <p className="mx-3 mt-3 rounded-ui-rect border border-amber-200/80 bg-amber-50 px-3 py-2.5 sam-text-helper font-medium leading-snug text-amber-950">
                {commerceBlocked && commerceBlockedHint?.trim()
                  ? commerceBlockedHint.trim()
                  : sheetCommerce?.inBreak
                    ? `준비중 · Break time: ${sheetCommerce.breakRangeLabel}. 쉬는 시간에는 담을 수 없습니다.`
                    : "지금은 준비 중이라 담을 수 없습니다."}
              </p>
            ) : null}
            {soldOut ? (
              <p className="mx-3 mt-3 rounded-ui-rect bg-sam-border-soft/60 px-3 py-2 text-sm font-medium text-sam-fg">
                품절
              </p>
            ) : null}

            <div className="relative aspect-[16/10] max-h-[200px] min-h-[160px] w-full overflow-hidden bg-neutral-100">
              {sheetPrimaryImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sheetPrimaryImage} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-neutral-100" />
              )}
            </div>

            <div className="bg-white px-4 pb-3 pt-3">
              <h3 className="text-[18px] font-extrabold leading-snug tracking-[-0.03em] text-neutral-900">
                {product.title}
              </h3>
              <Link
                href={`/stores/${encodeURIComponent(store.slug)}/p/${encodeURIComponent(product.id)}`}
                className={`mt-1.5 inline-flex items-center text-[11px] font-semibold underline-offset-2 hover:underline ${STORE_ORDER_TOUCH_BTN}`}
                style={{ color: STORE_ORDER_BRAND.accentSoftText }}
                onClick={onClose}
              >
                메뉴 리뷰 {reviewCountDisp.toLocaleString("ko-KR")}개 ›
              </Link>
            </div>

            <div className="hidden mx-3 mt-3 gap-3 rounded-ui-rect bg-sam-surface p-3 shadow-sm ring-1 ring-sam-border/70">
              <div className="h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-ui-rect bg-sam-surface-muted">
                {sheetPrimaryImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={sheetPrimaryImage}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center sam-text-xxs text-sam-meta">
                    이미지 없음
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="sam-text-body font-semibold leading-snug text-sam-fg">{product.title}</h3>
                  <span className="shrink-0 rounded-full bg-sam-surface-muted px-2 py-0.5 sam-text-xxs font-medium text-sam-muted">
                    찜 {favCount.toLocaleString("en-PH")}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
                  {Math.floor(product.price) !== Math.floor(baseUnit) ? (
                    <span className="sam-text-body-secondary text-sam-meta line-through">
                      {formatMoneyPhp(Math.floor(product.price))}
                    </span>
                  ) : null}
                  <span className="sam-text-page-title font-bold text-sam-fg">
                    {formatMoneyPhp(Math.floor(baseUnit))}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full bg-sam-border-soft/70 px-2.5 py-0.5 sam-text-xxs font-medium text-sam-fg">
                    ★ {ratingLabel ?? "—"} · 리뷰 {reviewCountDisp.toLocaleString("en-PH")}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-sam-border-soft/70 px-2.5 py-0.5 sam-text-xxs font-medium text-sam-fg">
                    주문 {orderCountDisp.toLocaleString("en-PH")}+
                  </span>
                </div>
              </div>
            </div>

            {reviewSnippets.length > 0 ? (
              <details className="hidden mx-3 mt-3 rounded-ui-rect border border-sam-border/80 bg-sam-surface shadow-sm">
                <summary className="cursor-pointer px-3 py-2.5 sam-text-body-secondary font-semibold text-sam-fg">
                  리뷰 미리보기 ({reviewSnippets.length})
                </summary>
                <div className="grid grid-cols-1 gap-2 border-t border-sam-border-soft px-3 pb-3 pt-2 sm:grid-cols-2">
                  {reviewSnippets.map((r) => (
                    <div
                      key={`${r.created_at}-${r.content.slice(0, 12)}`}
                      className="rounded-ui-rect bg-sam-app p-2.5 ring-1 ring-sam-border/60"
                    >
                      <p className="line-clamp-3 sam-text-helper leading-snug text-sam-fg">
                        {r.rating != null && r.rating >= 4 ? "★ " : ""}
                        {r.content}
                      </p>
                      <p className="mt-1.5 sam-text-xxs text-sam-muted">{r.created_at}</p>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}

            {product.summary ? (
              <p className="mx-4 mt-1 rounded-[10px] bg-neutral-50 px-3 py-2 text-[12px] font-medium leading-relaxed text-neutral-600">
                {product.summary}
              </p>
            ) : null}

            {mergedHasOptionsFlag && product.options_summary ? (
              <p className="mx-4 mt-2 text-[12px] font-medium text-neutral-500">
                {product.options_summary}
              </p>
            ) : null}

            {awaitingOptionHydration ? (
              <StoreProductSheetOptionsSkeleton />
            ) : optionHydrationFailed ? (
              <div className="border-t-[8px] border-[#EDEDED] px-4 py-6 text-center">
                <p className="text-[13px] font-medium text-neutral-700">
                  옵션 정보를 불러오지 못했습니다.
                </p>
                <button
                  type="button"
                  onClick={() => detail.retry()}
                  className={`mt-3 text-[14px] font-bold text-[#1C8DB8] ${STORE_ORDER_TOUCH_BTN}`}
                >
                  다시 시도
                </button>
              </div>
            ) : optionGroups.length > 0 ? (
              <div className="border-t-[8px] border-[#EDEDED]">
                <StoreModifierPicker
                  groups={optionGroups}
                  value={modifierWire}
                  onChange={setModifierWireTracked}
                  disabled={soldOut || orderBlocked}
                  variant="sheet"
                />
              </div>
            ) : null}

            <div
              className="border-t-[8px] border-[#EDEDED] px-4 py-4"
              style={{ backgroundColor: STORE_ORDER_BRAND.frameGray }}
            >
              {hasOptionDelta ? (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-[12px] font-medium text-neutral-500">{t("store_menu_label")}</span>
                    <div className="text-right">
                      {showListStrike ? (
                        <span className="mr-2 text-[11px] font-medium tabular-nums text-neutral-400 line-through">
                          {formatMoneyPhp(Math.floor(product.price))}
                        </span>
                      ) : null}
                      <span className="text-[15px] font-bold tabular-nums text-neutral-900">
                        {formatMoneyPhp(Math.floor(baseUnit))}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] font-medium">
                    <span className="text-neutral-500">{t("store_add_options")}</span>
                    <span className="tabular-nums font-semibold text-neutral-700">
                      {optionValidation.unitDelta > 0 ? "+" : ""}
                      {formatMoneyPhp(optionValidation.unitDelta)}
                    </span>
                  </div>
                  <div className="mt-3 flex items-end justify-between border-t border-neutral-200/70 pt-3">
                    <span className="text-[12px] font-bold text-neutral-800">{t("store_per_item")}</span>
                    <span className="text-[17px] font-extrabold tabular-nums tracking-tight text-neutral-900">
                      {formatMoneyPhp(unitWithOptions)}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <span className="pt-0.5 text-[12px] font-medium text-neutral-500">{t("store_menu_amount")}</span>
                  <div className="text-right">
                    {showListStrike ? (
                      <span className="mr-2 text-[11px] font-medium tabular-nums text-neutral-400 line-through">
                        {formatMoneyPhp(Math.floor(product.price))}
                      </span>
                    ) : null}
                    <span className="text-[17px] font-extrabold tabular-nums tracking-tight text-neutral-900">
                      {formatMoneyPhp(unitWithOptions)}
                    </span>
                    <span className="ml-0.5 text-[11px] font-semibold text-neutral-500">{t("store_per_unit_suffix")}</span>
                  </div>
                </div>
              )}

              <div className="mt-4 flex items-center justify-between border-t border-neutral-200/70 pt-4">
                <span className="text-[13px] font-bold text-neutral-900">{t("store_quantity")}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={qtyMinusDisabled}
                    onClick={() => setQtyTracked((q) => Math.max(minQ, q - 1))}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center text-lg font-bold leading-none ${STORE_ORDER_CTA_STEPPER}`}
                    aria-label={t("store_qty_decrease_aria")}
                  >
                    −
                  </button>
                  <span className="min-w-[2.25rem] text-center text-[16px] font-extrabold tabular-nums text-neutral-900">
                    {qty}
                  </span>
                  <button
                    type="button"
                    disabled={qtyPlusDisabled}
                    onClick={() => setQtyTracked((q) => Math.min(capQty, q + 1))}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center text-lg font-bold leading-none ${STORE_ORDER_CTA_STEPPER}`}
                    aria-label={t("store_qty_increase_aria")}
                  >
                    +
                  </button>
                </div>
              </div>

              {showLineTotalInCard ? (
                <div className="mt-4 flex items-center justify-between border-t border-neutral-200/70 pt-4">
                  <span className="text-[12px] font-semibold text-neutral-600">{t("store_order_total")}</span>
                  <span className="text-[17px] font-extrabold tabular-nums text-neutral-900">
                    {formatMoneyPhp(lineTotal)}
                  </span>
                </div>
              ) : null}
            </div>

            <div className="border-t border-neutral-100 bg-white px-4 py-3.5">
              <label htmlFor="store-add-sheet-line-note" className="text-[12px] font-bold text-neutral-800">
                {t("store_request_note")} <span className="font-medium text-neutral-500">{t("store_optional_suffix")}</span>
              </label>
              <textarea
                id="store-add-sheet-line-note"
                rows={2}
                value={lineNote}
                onChange={(e) => setLineNote(e.target.value)}
                disabled={soldOut || orderBlocked}
                placeholder={t("store_request_placeholder")}
                className="mt-2 w-full resize-none rounded-[10px] border border-neutral-200 bg-white px-3 py-2 text-[13px] font-medium text-neutral-900 placeholder:text-neutral-400 focus:border-[#1C8DB8] focus:outline-none focus:ring-2 focus:ring-[#1C8DB8]/20 disabled:bg-neutral-100"
              />
            </div>

            <p className="px-4 pb-3 pt-0">
              <Link
                href={`/stores/${encodeURIComponent(store.slug)}/p/${encodeURIComponent(product.id)}`}
                className={`text-[11px] font-semibold hover:underline ${STORE_ORDER_TOUCH_BTN}`}
                style={{ color: STORE_ORDER_BRAND.accent }}
                onClick={onClose}
              >
                전체 화면에서 보기
              </Link>
            </p>

            {!optionValidation.ok && !awaitingOptionHydration && !optionHydrationFailed ? (
              <p className="mt-1 px-4 text-[11px] text-amber-800">{t("store_fix_modifier_selection")}</p>
            ) : null}
            {!commerceCart ? (
              <p className="mt-1 px-4 pb-2 text-[11px] text-amber-800">
                장바구니를 사용할 수 없습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {!showNotFound && !showFullLoadingBody && product && store ? (
        <div
          className="shrink-0 border-t border-neutral-100 bg-white px-4 pt-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]"
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))" }}
        >
          {sheetErr ? (
            <p className="mb-2 text-center text-[11px] font-medium text-red-600">{sheetErr}</p>
          ) : null}
          <button
            type="button"
            disabled={ctaDisabled}
            onClick={addToCart}
            className={`w-full py-3.5 text-[17px] leading-none ${STORE_ORDER_CTA_PRIMARY}`}
          >
            {ctaLabel}
          </button>
        </div>
      ) : null}
    </StoreProductSheetShell>
  );
}
