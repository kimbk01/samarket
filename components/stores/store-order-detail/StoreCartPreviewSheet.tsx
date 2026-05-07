"use client";

import Link from "next/link";
import { useStoreCommerceCartOptional } from "@/contexts/StoreCommerceCartContext";
import { formatMoneyPhp } from "@/lib/utils/format";
import { APP_MAIN_COLUMN_MAX_WIDTH_CLASS } from "@/lib/ui/app-content-layout";

export function StoreCartPreviewSheet({
  open,
  onClose,
  storeId,
  storeSlug,
}: {
  open: boolean;
  onClose: () => void;
  storeId: string;
  storeSlug: string;
}) {
  const commerceCart = useStoreCommerceCartOptional();

  const lines = commerceCart?.hydrated ? commerceCart.getLinesForStoreId(storeId) : [];

  const subtotal = commerceCart?.hydrated ? commerceCart.getSubtotalForStoreId(storeId) : 0;

  if (!open) return null;

  const cartHref = `/stores/${encodeURIComponent(storeSlug)}/cart`;

  return (
    <div className="fixed inset-0 z-[110]" role="dialog" aria-modal aria-labelledby="store-cart-preview-title">
      <button type="button" className="absolute inset-0 bg-black/45 transition-opacity duration-[220ms]" aria-label="닫기" onClick={onClose} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[18dvh] flex justify-center p-0 sm:p-3">
        <div
          className={`pointer-events-auto flex h-full w-full min-w-0 flex-col overflow-hidden rounded-t-[24px] bg-white shadow-2xl transition-transform duration-[220ms] ease-out ${APP_MAIN_COLUMN_MAX_WIDTH_CLASS}`}
          style={{
            paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))",
          }}
        >
          <div className="flex shrink-0 flex-col items-center pt-2 pb-1">
            <span className="h-1 w-10 rounded-full bg-neutral-300" aria-hidden />
            <h2 id="store-cart-preview-title" className="mt-2 px-4 text-center text-[16px] font-bold text-neutral-900">
              장바구니
            </h2>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 [-webkit-overflow-scrolling:touch]">
            {lines.length === 0 ? (
              <p className="py-10 text-center text-[14px] text-neutral-500">담긴 메뉴가 없어요</p>
            ) : (
              <ul className="divide-y divide-neutral-100 pb-2">
                {lines.map((ln) => (
                  <li key={ln.lineId} className="flex gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-bold text-neutral-900">{ln.title}</p>
                      {ln.optionsSummary?.trim() ? (
                        <p className="mt-0.5 text-[12px] text-neutral-500">{ln.optionsSummary}</p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-semibold text-neutral-700">
                          {formatMoneyPhp(Math.floor(Number(ln.unitPricePhp) || 0))}
                        </span>
                        <div className="flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-1">
                          <button
                            type="button"
                            className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold text-neutral-700 transition-transform duration-[120ms] active:scale-[0.96]"
                            aria-label="수량 감소"
                            disabled={!commerceCart}
                            onClick={() => {
                              const q = Math.floor(Number(ln.qty)) || 0;
                              const next = Math.max(0, q - 1);
                              if (next <= 0) commerceCart?.removeLine(ln.lineId);
                              else commerceCart?.updateLineQuantity(ln.lineId, next);
                            }}
                          >
                            −
                          </button>
                          <span className="min-w-[1.5rem] text-center text-[13px] font-bold tabular-nums">
                            {Math.floor(Number(ln.qty)) || 0}
                          </span>
                          <button
                            type="button"
                            className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold text-neutral-700 transition-transform duration-[120ms] active:scale-[0.96]"
                            aria-label="수량 증가"
                            disabled={!commerceCart}
                            onClick={() => {
                              const q = Math.floor(Number(ln.qty)) || 0;
                              const maxQ = Math.max(1, Math.floor(Number(ln.maxOrderQty)) || 99);
                              commerceCart?.updateLineQuantity(ln.lineId, Math.min(maxQ, q + 1));
                            }}
                          >
                            +
                          </button>
                        </div>
                        <button
                          type="button"
                          className="ml-auto text-[12px] font-semibold text-red-600 underline underline-offset-2"
                          onClick={() => commerceCart?.removeLine(ln.lineId)}
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="shrink-0 border-t border-neutral-100 px-4 pt-3">
            <div className="mb-3 flex items-center justify-between text-[15px] font-bold">
              <span className="text-neutral-600">총금액</span>
              <span className="tabular-nums text-neutral-900">{formatMoneyPhp(subtotal)}</span>
            </div>
            <Link
              href={cartHref}
              onClick={onClose}
              className="flex h-[52px] w-full items-center justify-center rounded-[14px] bg-[#1C8DB8] text-[15px] font-bold text-white transition-transform duration-[120ms] active:scale-[0.98]"
            >
              주문하기
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
