"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useStoreCommerceCartOptional } from "@/contexts/StoreCommerceCartContext";
import type { ModifierSelectionsWire } from "@/lib/stores/modifiers/types";
import { StoreModifierPicker } from "@/components/stores/modifiers/StoreModifierPicker";
import {
  parseProductOptionsJson,
  validateModifierSelection,
} from "@/lib/stores/product-line-options";
import { approximateDiscountPercent } from "@/lib/stores/store-product-pricing";
import { parseMediaUrlsJson } from "@/lib/stores/parse-media-urls-json";
import { formatMoneyPhp } from "@/lib/utils/format";
import { resolveStoreFrontCommerceState } from "@/lib/stores/store-auto-hours";
import { STORE_DETAIL_GUTTER } from "@/lib/stores/store-detail-ui";
import {
  fetchStoreProductPublicDeduped,
  fetchStoreReviewsPublicDeduped,
} from "@/lib/stores/store-delivery-api-client";

type PublicStore = {
  id: string;
  slug: string;
  store_name: string;
  business_hours_json?: unknown;
  is_open?: boolean | null;
  delivery_available?: boolean | null;
  rating_avg?: number | null;
  review_count?: number | null;
  favorite_count?: number;
  recent_order_count?: number;
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
  images_json?: unknown;
  pickup_available: boolean | null;
  local_delivery_available: boolean | null;
  shipping_available: boolean | null;
  options_json?: unknown;
};

type ReviewSnippet = { content: string; created_at: string; rating: number | null };

/** Meta/Facebook primary (시트 전용, 앱 시그니처와 구분) */
const SHEET_PRIMARY = "#1877F2";

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
  onAddedToCart,
}: {
  productId: string | null;
  pageStoreSlug: string;
  onClose: () => void;
  commerceBlocked: boolean;
  commerceBlockedHint?: string;
  onAddedToCart?: () => void;
}) {
  const router = useRouter();
  const commerceCart = useStoreCommerceCartOptional();
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [product, setProduct] = useState<PublicProduct | null>(null);
  const [store, setStore] = useState<PublicStore | null>(null);
  const [qty, setQty] = useState(1);
  const [modifierWire, setModifierWire] = useState<ModifierSelectionsWire>({ pick: {}, qty: {} });
  const [sheetErr, setSheetErr] = useState<string | null>(null);
  const [hoursTick, setHoursTick] = useState(0);
  const [reviewSnippets, setReviewSnippets] = useState<ReviewSnippet[]>([]);
  const [lineNote, setLineNote] = useState("");

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
      setLineNote("");
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setNotFound(false);
      setSheetErr(null);
      try {
        const { json } = await fetchStoreProductPublicDeduped(productId);
        if (cancelled) return;
        const pj = json as { ok?: boolean; product?: PublicProduct; store?: PublicStore };
        if (!pj?.ok || !pj.product || !pj.store) {
          setNotFound(true);
          setProduct(null);
          setStore(null);
          return;
        }
        const apiSlug = String(pj.store.slug ?? "");
        if (!storeSlugsMatch(pageStoreSlug, apiSlug)) {
          setNotFound(true);
          setProduct(null);
          setStore(null);
          return;
        }
        setProduct(pj.product);
        setStore(pj.store);
        const p = pj.product;
        const minQ = Math.max(1, Number(p.min_order_qty) || 1);
        setQty(minQ);
        setModifierWire({ pick: {}, qty: {} });
        setLineNote("");
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

  const galleryUrls = useMemo(() => {
    if (!product) return [];
    const extra = parseMediaUrlsJson(product.images_json, 16);
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
    if (!store?.slug || !product?.id) {
      setReviewSnippets([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { json } = await fetchStoreReviewsPublicDeduped(store.slug);
        const rj = json as { ok?: boolean; reviews?: unknown[] };
        if (!rj?.ok || !Array.isArray(rj.reviews)) return;
        const pid = product.id;
        const rows = rj.reviews as { content?: unknown; created_at?: unknown; rating?: unknown; product_id?: unknown }[];
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

  const baseUnit = product
    ? product.discount_price != null &&
      Number.isFinite(product.discount_price) &&
      product.discount_price >= 0 &&
      product.discount_price < product.price
      ? product.discount_price
      : product.price
    : 0;

  const optionValidation = useMemo(
    () => validateModifierSelection(optionGroups, modifierWire, baseUnit),
    [optionGroups, modifierWire, baseUnit]
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
    });
    onAddedToCart?.();
    onClose();
  }

  if (!productId) return null;

  const ratingAvg = store ? Number(store.rating_avg) : NaN;
  const ratingLabel =
    store && Number.isFinite(ratingAvg) && ratingAvg > 0 ? ratingAvg.toFixed(1) : null;
  const reviewCountDisp = store ? Math.max(0, Math.floor(Number(store.review_count) || 0)) : 0;
  const favCount = store ? Math.max(0, Math.floor(Number(store.favorite_count) || 0)) : 0;
  const orderCountDisp = store ? Math.max(0, Math.floor(Number(store.recent_order_count) || 0)) : 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col justify-end bg-sam-ink/45 backdrop-blur-[2px]"
      role="dialog"
      aria-modal
    >
      <button type="button" className="min-h-0 flex-1 cursor-default" aria-label="닫기" onClick={onClose} />
      <div
        className={`flex w-full justify-center ${STORE_DETAIL_GUTTER} pb-[max(12px,env(safe-area-inset-bottom))]`}
      >
        <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-ui-rect bg-sam-surface shadow-2xl ring-1 ring-sam-border/10">
        <div className="relative flex shrink-0 items-center justify-center border-b border-sam-border/80 bg-sam-surface px-10 py-3">
          <h2 className="line-clamp-2 text-center text-[16px] font-bold leading-snug tracking-tight text-sam-fg">
            {loading ? "불러오는 중…" : product && !notFound ? product.title : "메뉴 담기"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-[20px] leading-none text-sam-muted hover:bg-sam-surface-muted"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#F0F2F5]">
          {loading ? (
            <p className="py-10 text-center text-sm text-sam-muted">불러오는 중…</p>
          ) : notFound || !product || !store ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm text-sam-muted">상품을 불러올 수 없습니다.</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-4 text-sm font-medium text-signature"
              >
                닫기
              </button>
            </div>
          ) : (
            <div className="pb-3 pt-1">
              {orderBlocked ? (
                <p className="mx-3 mt-3 rounded-ui-rect border border-amber-200/80 bg-amber-50 px-3 py-2.5 text-[12px] font-medium leading-snug text-amber-950">
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

              <div className="mx-3 mt-3 flex gap-3 rounded-ui-rect bg-sam-surface p-3 shadow-sm ring-1 ring-sam-border/70">
                <div className="h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-ui-rect bg-sam-surface-muted">
                  {galleryUrls[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={galleryUrls[0]}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[11px] text-sam-meta">
                      이미지 없음
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-[15px] font-semibold leading-snug text-sam-fg">{product.title}</h3>
                    <span className="shrink-0 rounded-full bg-sam-surface-muted px-2 py-0.5 text-[11px] font-medium text-sam-muted">
                      찜 {favCount.toLocaleString("en-PH")}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
                    {Math.floor(product.price) !== Math.floor(baseUnit) ? (
                      <span className="text-[13px] text-sam-meta line-through">
                        {formatMoneyPhp(Math.floor(product.price))}
                      </span>
                    ) : null}
                    <span className="text-[18px] font-bold text-sam-fg">
                      {formatMoneyPhp(Math.floor(baseUnit))}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="inline-flex items-center rounded-full bg-sam-border-soft/70 px-2.5 py-0.5 text-[11px] font-medium text-sam-fg">
                      ★ {ratingLabel ?? "—"} · 리뷰 {reviewCountDisp.toLocaleString("en-PH")}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-sam-border-soft/70 px-2.5 py-0.5 text-[11px] font-medium text-sam-fg">
                      주문 {orderCountDisp.toLocaleString("en-PH")}+
                    </span>
                  </div>
                </div>
              </div>

              <div className="mx-3 mt-3 space-y-1.5 rounded-ui-rect bg-sam-surface p-3 shadow-sm ring-1 ring-sam-border/70">
                <div className="flex items-center justify-between text-[13px] text-sam-fg">
                  <span>기본 단가</span>
                  <span className="font-semibold tabular-nums text-sam-fg">
                    {formatMoneyPhp(Math.floor(baseUnit))}
                  </span>
                </div>
                {optionValidation.ok && optionValidation.unitDelta !== 0 ? (
                  <div className="flex items-center justify-between text-[13px] text-sam-muted">
                    <span>옵션 추가</span>
                    <span className="font-semibold tabular-nums">
                      {optionValidation.unitDelta > 0 ? "+" : ""}
                      {formatMoneyPhp(optionValidation.unitDelta)}
                    </span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between border-t border-sam-border-soft pt-2 text-[13px] font-semibold text-sam-fg">
                  <span>1개당</span>
                  <span className="tabular-nums">{formatMoneyPhp(unitWithOptions)}</span>
                </div>
                <div className="flex items-center justify-between text-[13px] text-sam-muted">
                  <span>수량</span>
                  <span className="font-medium tabular-nums">× {qty}</span>
                </div>
                <div className="flex items-center justify-between border-t border-sam-border pt-2 text-[16px] font-bold text-sam-fg">
                  <span>이 라인 합계</span>
                  <span className="tabular-nums text-[#1877F2]">{formatMoneyPhp(lineTotal)}</span>
                </div>
              </div>

              {galleryUrls.length > 1 ? (
                <div className="mt-2 px-3">
                  <div className="flex gap-2 overflow-x-auto rounded-ui-rect bg-sam-surface p-2 shadow-sm ring-1 ring-sam-border/70 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {galleryUrls.slice(1).map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={`${url}-${i}`}
                        src={url}
                        alt=""
                        className="h-14 w-14 shrink-0 rounded-ui-rect object-cover ring-1 ring-sam-border/80"
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {reviewSnippets.length > 0 ? (
                <details className="mx-3 mt-3 rounded-ui-rect border border-sam-border/80 bg-sam-surface shadow-sm">
                  <summary className="cursor-pointer px-3 py-2.5 text-[13px] font-semibold text-sam-fg">
                    리뷰 미리보기 ({reviewSnippets.length})
                  </summary>
                  <div className="grid grid-cols-1 gap-2 border-t border-sam-border-soft px-3 pb-3 pt-2 sm:grid-cols-2">
                    {reviewSnippets.map((r) => (
                      <div
                        key={`${r.created_at}-${r.content.slice(0, 12)}`}
                        className="rounded-ui-rect bg-sam-app p-2.5 ring-1 ring-sam-border/60"
                      >
                        <p className="line-clamp-3 text-[12px] leading-snug text-sam-fg">
                          {r.rating != null && r.rating >= 4 ? "★ " : ""}
                          {r.content}
                        </p>
                        <p className="mt-1.5 text-[10px] text-sam-muted">{r.created_at}</p>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}

              {product.summary ? (
                <p className="mx-3 mt-3 rounded-ui-rect bg-sam-surface px-3 py-2.5 text-[13px] leading-relaxed text-sam-muted shadow-sm ring-1 ring-sam-border/70">
                  {product.summary}
                </p>
              ) : null}

              {optionGroups.length > 0 ? (
                <div className="mt-4 px-3">
                  <p className="mb-1 px-0.5 text-[12px] font-bold text-sam-fg">옵션 선택</p>
                  <p className="mb-2 px-0.5 text-[12px] text-sam-muted">
                    필수 항목을 고르면 위 금액이 바로 바뀌어요.
                  </p>
                  <StoreModifierPicker
                    groups={optionGroups}
                    value={modifierWire}
                    onChange={setModifierWire}
                    disabled={soldOut || orderBlocked}
                    variant="sheet"
                  />
                </div>
              ) : null}

              <div className="mx-3 mt-3">
                <label htmlFor="store-add-sheet-line-note" className="text-[12px] font-semibold text-sam-fg">
                  요청사항 (선택)
                </label>
                <textarea
                  id="store-add-sheet-line-note"
                  rows={2}
                  value={lineNote}
                  onChange={(e) => setLineNote(e.target.value)}
                  disabled={soldOut || orderBlocked}
                  placeholder="예: 덜 맵게, 양파 빼주세요"
                  className="mt-1 w-full resize-none rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[13px] text-sam-fg placeholder:text-sam-meta focus:border-[#1877F2] focus:outline-none focus:ring-2 focus:ring-[#1877F2]/20 disabled:bg-sam-surface-muted"
                />
              </div>

              <p className="mt-3 px-3 pb-1">
                <Link
                  href={`/stores/${encodeURIComponent(store.slug)}/p/${encodeURIComponent(product.id)}`}
                  className="text-[12px] font-semibold text-[#1877F2] hover:underline"
                  onClick={onClose}
                >
                  전체 화면에서 보기
                </Link>
              </p>

              {!optionValidation.ok ? (
                <p className="mt-2 px-3 text-xs text-amber-800">옵션을 올바르게 선택해 주세요.</p>
              ) : null}
              {!commerceCart ? (
                <p className="mt-2 px-3 text-xs text-amber-800">
                  장바구니를 사용할 수 없습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.
                </p>
              ) : null}
            </div>
          )}
        </div>

        {!loading && !notFound && product && store ? (
          <div className="shrink-0 border-t border-sam-border/80 bg-sam-surface px-3 pt-3">
            {sheetErr ? <p className="mb-2 text-center text-xs text-red-600">{sheetErr}</p> : null}
            <div className="flex items-stretch gap-2.5">
              <div className="flex items-center gap-1 rounded-full bg-sam-surface-muted px-1 py-1">
                <button
                  type="button"
                  disabled={qty <= minQ || soldOut || orderBlocked}
                  onClick={() => setQty((q) => Math.max(minQ, q - 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-lg leading-none text-sam-fg transition-colors hover:bg-sam-border-soft/80 disabled:opacity-40"
                >
                  −
                </button>
                <span className="min-w-[1.75rem] text-center text-[16px] font-bold text-sam-fg">{qty}</span>
                <button
                  type="button"
                  disabled={qty >= capQty || soldOut || orderBlocked}
                  onClick={() => setQty((q) => Math.min(capQty, q + 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-lg leading-none text-[#1877F2] transition-colors hover:bg-[#E7F3FF] disabled:opacity-40"
                >
                  +
                </button>
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
                className="min-w-0 flex-1 rounded-ui-rect py-3 text-center text-[15px] font-bold leading-tight text-white shadow-sm transition-opacity hover:opacity-95 disabled:bg-sam-surface-muted"
                style={{ backgroundColor: SHEET_PRIMARY }}
              >
                <span className="block">{formatMoneyPhp(lineTotal)} 담기</span>
                <span className="mt-0.5 block text-[12px] font-semibold text-white/90">장바구니에 추가</span>
              </button>
            </div>
          </div>
        ) : null}
        </div>
      </div>
    </div>
  );
}
