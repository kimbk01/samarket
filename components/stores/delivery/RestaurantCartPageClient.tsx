"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { STORE_DETAIL_SUBHEADER_STICKY } from "@/lib/stores/store-detail-ui";
import { useRestaurantDeliveryCart } from "@/contexts/RestaurantDeliveryCartContext";
import { computeLineTotal, summarizeOptions } from "@/lib/stores/delivery-mock/cart-math";
import { hasRestaurantDeliveryCatalog } from "@/lib/stores/delivery-mock/mock-restaurant-catalog";
import { formatMoneyPhp } from "@/lib/utils/format";

export function RestaurantCartPageClient({ storeSlug }: { storeSlug: string }) {
  const router = useRouter();
  const cart = useRestaurantDeliveryCart();

  const wrongStore = cart.storeSlug && cart.storeSlug !== storeSlug;
  const empty = cart.lines.length === 0;

  if (wrongStore || empty) {
    const demoCart = hasRestaurantDeliveryCatalog(storeSlug);
    return (
      <div className="min-h-[50vh]">
        <h1 className={`${STORE_DETAIL_SUBHEADER_STICKY} px-4 py-2.5 text-center text-base font-semibold text-gray-900`}>
          장바구니
        </h1>
        <div className="px-4 py-8">
        {demoCart ? (
          <p className="text-sm text-gray-600">담긴 메뉴가 없습니다.</p>
        ) : (
          <>
            <p className="text-sm text-gray-600">
              이 화면은 샘플 배달 매장용 데모 장바구니입니다. 실제 등록 매장은 상품을 눌러 수량·수령 방식을 고른 뒤
              바로 주문합니다.
            </p>
            {wrongStore && !empty ? (
              <p className="mt-2 text-xs text-amber-800">다른 매장에서 담은 메뉴가 있어 이 매장 장바구니와 맞지 않습니다.</p>
            ) : null}
          </>
        )}
        <Link
          href={`/stores/${encodeURIComponent(storeSlug)}`}
          className="mt-4 inline-block text-sm font-medium text-signature"
        >
          매장으로 돌아가기
        </Link>
        </div>
      </div>
    );
  }

  const fee = cart.profile?.deliveryFee ?? 0;
  const min = cart.profile?.minOrderAmount ?? 0;

  return (
    <div className="min-h-screen bg-[#f3f4f6] pb-36">
      <header className={`${STORE_DETAIL_SUBHEADER_STICKY} flex items-center justify-center px-4 py-2.5`}>
        <h1 className="text-center text-[16px] font-semibold text-gray-900">장바구니</h1>
      </header>

      <div className="px-4 pt-4">
        <p className="text-sm font-semibold text-gray-900">{cart.storeNameKo}</p>
        <ul className="mt-3 space-y-3">
          {cart.lines.map((line) => {
            const lineTotal = computeLineTotal(line);
            const optText = summarizeOptions(line);
            return (
              <li key={line.lineId} className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                <div className="flex justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{line.menuName}</p>
                    <p className="mt-1 text-[11px] text-gray-500">{optText}</p>
                    <p className="mt-1 text-xs text-gray-600">
                      단가 {formatMoneyPhp(line.basePrice + line.selections.reduce((s, g) => s + g.options.reduce((a, o) => a + o.priceDelta, 0), 0))}{" "}
                      × {line.quantity}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-bold text-gray-900">{formatMoneyPhp(lineTotal)}</p>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="h-8 w-8 rounded-lg border border-gray-200 bg-gray-50 text-lg leading-none"
                      onClick={() => cart.updateLineQuantity(line.lineId, line.quantity - 1)}
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-sm font-semibold">{line.quantity}</span>
                    <button
                      type="button"
                      className="h-8 w-8 rounded-lg border border-gray-200 bg-gray-50 text-lg leading-none"
                      onClick={() => cart.updateLineQuantity(line.lineId, line.quantity + 1)}
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => cart.removeLine(line.lineId)}
                    className="text-xs font-medium text-red-600"
                  >
                    삭제
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">상품 금액</span>
            <span className="font-semibold">{formatMoneyPhp(cart.subtotal)}</span>
          </div>
          <div className="mt-2 flex justify-between text-sm">
            <span className="text-gray-600">배달비 (배달 주문 시)</span>
            <span className="font-semibold">{formatMoneyPhp(fee)}</span>
          </div>
          <div className="mt-3 border-t border-gray-100 pt-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">최소주문금액</span>
              <span>{formatMoneyPhp(min)}</span>
            </div>
            {!cart.meetsMinOrder ? (
              <p className="mt-2 rounded-lg bg-amber-50 px-2 py-2 text-xs text-amber-900">
                최소주문까지 {formatMoneyPhp(cart.minOrderShortage)} 더 담아주세요.
              </p>
            ) : (
              <p className="mt-2 text-xs text-emerald-700">최소주문 금액을 충족했습니다.</p>
            )}
          </div>
          <div className="mt-3 flex justify-between border-t border-gray-100 pt-3 text-base font-bold">
            <span>배달 주문 예정 금액</span>
            <span>{formatMoneyPhp(cart.grandTotalFor("delivery"))}</span>
          </div>
          <p className="mt-1 text-right text-xs text-gray-500">
            포장 시 {formatMoneyPhp(cart.grandTotalFor("pickup"))}
          </p>
        </div>
      </div>

      <div className="pointer-events-none fixed bottom-0 left-1/2 z-30 w-full max-w-lg -translate-x-1/2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        <button
          type="button"
          disabled={!cart.meetsMinOrder}
          onClick={() => router.push(`/stores/${encodeURIComponent(storeSlug)}/checkout`)}
          className="pointer-events-auto w-full rounded-2xl bg-signature py-4 text-center text-sm font-bold text-white shadow-lg disabled:bg-gray-300"
        >
          주문하기
        </button>
      </div>
    </div>
  );
}
