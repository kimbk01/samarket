"use client";

import Link from "next/link";
import { useRestaurantDeliveryCart } from "@/contexts/RestaurantDeliveryCartContext";
import { formatMoneyPhp } from "@/lib/utils/format";

export function RestaurantCartFloatingBar({ storeSlug }: { storeSlug: string }) {
  const cart = useRestaurantDeliveryCart();

  if (cart.storeSlug !== storeSlug || cart.lines.length === 0) return null;

  const total = cart.grandTotalFor("delivery");

  return (
    <div className="pointer-events-none fixed bottom-0 left-1/2 z-40 w-full max-w-lg -translate-x-1/2 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
      <Link
        href={`/stores/${encodeURIComponent(storeSlug)}/cart`}
        className="pointer-events-auto flex w-full items-center justify-between rounded-2xl bg-gray-900 px-4 py-3.5 text-white shadow-xl"
      >
        <span className="text-sm font-semibold">
          장바구니 · {cart.itemCount}개
          {!cart.meetsMinOrder ? (
            <span className="ml-2 text-xs font-normal text-amber-200">최소주문 미달</span>
          ) : null}
        </span>
        <span className="text-sm font-bold">{formatMoneyPhp(total)}</span>
      </Link>
    </div>
  );
}
