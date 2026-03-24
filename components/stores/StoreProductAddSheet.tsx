"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useStoreCommerceCartOptional } from "@/contexts/StoreCommerceCartContext";
import { StoreProductOptionPicker } from "@/components/stores/StoreProductOptionPicker";
import {
  parseProductOptionsJson,
  validateLineOptionSelections,
} from "@/lib/stores/product-line-options";
import { approximateDiscountPercent } from "@/lib/stores/store-product-pricing";
import { formatMoneyPhp } from "@/lib/utils/format";
import { resolveStoreFrontCommerceState } from "@/lib/stores/store-auto-hours";

type PublicStore = {
  id: string;
  slug: string;
  store_name: string;
  business_hours_json?: unknown;
  is_open?: boolean | null;
  delivery_available?: boolean | null;
};

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
  options_json?: unknown;
};

function normalizeStoreSlugSegment(raw: string): string {
  let s = raw.trim();
  try {
    s = decodeURIComponent(s);
  } catch {
    /* already decoded */
  }
  return s.normalize("NFC").trim();
}

function storeSlugsMatch(urlSlug: string, apiSlug: string): boolean {
  const a = normalizeStoreSlugSegment(urlSlug);
  const b = normalizeStoreSlugSegment(apiSlug);
  if (a === b) return true;
  return a.toLowerCase() === b.toLowerCase();
}

export function StoreProductAddSheet({
  productId,
  pageStoreSlug,
  onClose,
  commerceBlocked,
  commerceBlockedHint,
}: {
  productId: string | null;
  pageStoreSlug: string;
  onClose: () => void;
  commerceBlocked: boolean;
  commerceBlockedHint?: string;
}) {
  const router = useRouter();
  const commerceCart = useStoreCommerceCartOptional();
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [product, setProduct] = useState<PublicProduct | null>(null);
  const [store, setStore] = useState<PublicStore | null>(null);
  const [qty, setQty] = useState(1);
  const [optionSelections, setOptionSelections] = useState<Record<string, string[]>>({});
  const [sheetErr, setSheetErr] = useState<string | null>(null);
  const [hoursTick, setHoursTick] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.setInterval(() => setHoursTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!productId) {
      setProduct(null);
      setStore(null);
      setNotFound(false);
      setSheetErr(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setNotFound(false);
      setSheetErr(null);
      try {
        const res = await fetch(`/api/stores/products/${encodeURIComponent(productId)}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (cancelled) return;
        if (!json?.ok || !json.product || !json.store) {
          setNotFound(true);
          setProduct(null);
          setStore(null);
          return;
        }
        const apiSlug = String(json.store.slug ?? "");
        if (!storeSlugsMatch(pageStoreSlug, apiSlug)) {
          setNotFound(true);
          setProduct(null);
          setStore(null);
          return;
        }
        setProduct(json.product as PublicProduct);
        setStore(json.store as PublicStore);
        const p = json.product as PublicProduct;
        const minQ = Math.max(1, Number(p.min_order_qty) || 1);
        setQty(minQ);
        setOptionSelections({});
      } catch {
        if (!cancelled) {
          setNotFound(true);
          setProduct(null);
          setStore(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId, pageStoreSlug]);

  const optionGroups = useMemo(
    () => (product ? parseProductOptionsJson(product.options_json) : []),
    [product]
  );

  const optionValidation = useMemo(
    () => validateLineOptionSelections(optionGroups, optionSelections),
    [optionGroups, optionSelections]
  );

  const sheetCommerce = useMemo(() => {
    if (!store) return null;
    return resolveStoreFrontCommerceState(store.business_hours_json, store.is_open ?? null);
  }, [store, hoursTick]);

  void hoursTick;
  const orderBlocked =
    commerceBlocked || (sheetCommerce != null && !sheetCommerce.isOpenForCommerce);

  const trackInv = product?.track_inventory === true;
  const soldOut = !!(product && trackInv && product.stock_qty <= 0);

  const minQ = product ? Math.max(1, Number(product.min_order_qty) || 1) : 1;
  const maxQ = product ? Math.max(minQ, Number(product.max_order_qty) || 99) : 99;
  const capQty = product ? (trackInv ? Math.min(maxQ, product.stock_qty) : maxQ) : maxQ;

  useEffect(() => {
    if (!product) return;
    setQty((q) => Math.max(minQ, Math.min(capQty, q)));
  }, [product, minQ, capQty]);

  const baseUnit = product
    ? product.discount_price != null &&
      Number.isFinite(product.discount_price) &&
      product.discount_price >= 0 &&
      product.discount_price < product.price
      ? product.discount_price
      : product.price
    : 0;

  const unitWithOptions =
    product && optionValidation.ok ? baseUnit + optionValidation.unitDelta : baseUnit;
  const lineTotal = unitWithOptions * qty;

  function addToCart() {
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
      return;
    }
    if (soldOut) {
      setSheetErr("품절인 상품은 담을 수 없습니다.");
      return;
    }
    if (!optionValidation.ok) {
      setSheetErr("옵션 선택을 확인해 주세요.");
      return;
    }
    setSheetErr(null);
    const others = commerceCart.otherBucketsExcluding(st.id);
    if (others.length > 0) {
      const o = others[0];
      window.alert(
        `다른 매장의 상품이 있습니다.\n${o.storeName} 장바구니를 주문하거나 비운 뒤 이 매장에서 담을 수 있어요.`
      );
      router.push(`/stores/${encodeURIComponent(o.storeSlug)}/cart`);
      onClose();
      return;
    }
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
      optionSelections: { ...optionSelections },
      optionsSummary: optionValidation.snapshot.summary,
      pickupAvailable: !!pr.pickup_available,
      localDeliveryAvailable:
        !!pr.local_delivery_available || st.delivery_available === true,
      shippingAvailable: !!pr.shipping_available,
      minOrderQty: minQ,
      maxOrderQty: maxForCart,
    });
    onClose();
  }

  if (!productId) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end bg-black/45" role="dialog" aria-modal>
      <button type="button" className="min-h-0 flex-1 cursor-default" aria-label="닫기" onClick={onClose} />
      <div className="max-h-[85vh] overflow-hidden rounded-t-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 className="pr-4 text-base font-bold text-gray-900">
            {loading ? "불러오는 중…" : product?.title ?? "상품"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-gray-500 hover:bg-gray-100"
            aria-label="바텀시트 닫기"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto px-4 pb-4 pt-2">
          {loading ? (
            <p className="py-6 text-center text-sm text-gray-500">불러오는 중…</p>
          ) : notFound || !product || !store ? (
            <div className="py-6 text-center">
              <p className="text-sm text-gray-600">상품을 불러올 수 없습니다.</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-4 text-sm font-medium text-signature"
              >
                닫기
              </button>
            </div>
          ) : (
            <>
              {orderBlocked ? (
                <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium leading-snug text-amber-950">
                  {commerceBlocked && commerceBlockedHint?.trim()
                    ? commerceBlockedHint.trim()
                    : sheetCommerce?.inBreak
                      ? `준비중 · Break time: ${sheetCommerce.breakRangeLabel}. 쉬는 시간에는 담을 수 없습니다.`
                      : "지금은 준비 중이라 담을 수 없습니다."}
                </p>
              ) : null}
              {soldOut ? (
                <p className="mb-3 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-600">
                  품절
                </p>
              ) : null}
              {product.summary ? (
                <p className="mb-3 text-sm text-gray-600">{product.summary}</p>
              ) : null}
              <p className="mb-3">
                <Link
                  href={`/stores/${encodeURIComponent(store.slug)}/p/${encodeURIComponent(product.id)}`}
                  className="text-xs font-medium text-signature underline decoration-signature/30"
                  onClick={onClose}
                >
                  상세·이미지 보기
                </Link>
              </p>
              <StoreProductOptionPicker
                groups={optionGroups}
                value={optionSelections}
                onChange={setOptionSelections}
                disabled={soldOut || orderBlocked}
              />
              <div className="mt-4 flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
                <span className="text-sm font-medium text-gray-800">수량</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={qty <= minQ || soldOut || orderBlocked}
                    onClick={() => setQty((q) => Math.max(minQ, q - 1))}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-lg disabled:opacity-40"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-base font-semibold">{qty}</span>
                  <button
                    type="button"
                    disabled={qty >= capQty || soldOut || orderBlocked}
                    onClick={() => setQty((q) => Math.min(capQty, q + 1))}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-lg disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
              </div>
              {!optionValidation.ok ? (
                <p className="mt-2 text-xs text-amber-800">옵션을 올바르게 선택해 주세요.</p>
              ) : null}
              {sheetErr ? <p className="mt-2 text-xs text-red-600">{sheetErr}</p> : null}
              {!commerceCart ? (
                <p className="mt-2 text-xs text-amber-800">
                  장바구니를 사용할 수 없습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.
                </p>
              ) : null}
            </>
          )}
        </div>

        {!loading && !notFound && product && store ? (
          <div className="border-t border-gray-100 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-gray-600">합계</span>
              <span className="text-lg font-bold text-gray-900">{formatMoneyPhp(lineTotal)}</span>
            </div>
            <button
              type="button"
              disabled={
                soldOut ||
                orderBlocked ||
                !optionValidation.ok ||
                !commerceCart ||
                capQty < minQ
              }
              onClick={addToCart}
              className="w-full rounded-xl bg-signature py-3.5 text-center text-sm font-bold text-white disabled:bg-gray-300"
            >
              장바구니 담기
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
