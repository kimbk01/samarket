"use client";

import Link from "next/link";
import { useStoreCommerceCartOptional } from "@/contexts/StoreCommerceCartContext";
import { formatMoneyPhp } from "@/lib/utils/format";
import { sortedNonemptyCommerceBuckets } from "@/lib/stores/store-commerce-cart-nav";

export function StoreCommerceCartEntryFallback({
  hint,
  onRetry,
}: {
  hint: "network" | "missing" | "api";
  onRetry?: () => void;
}) {
  const cart = useStoreCommerceCartOptional();
  const buckets =
    cart?.hydrated ? sortedNonemptyCommerceBuckets(cart.listCartBuckets()) : [];

  const title =
    hint === "network"
      ? "매장 정보를 불러오지 못했습니다."
      : "이 주소의 매장을 찾을 수 없습니다.";

  const sub =
    hint === "network"
      ? "네트워크 연결을 확인한 뒤 다시 시도해 주세요."
      : hint === "api"
        ? "서버 응답에 문제가 있었습니다. 잠시 후 다시 시도해 주세요."
        : "삭제·비공개되었거나 주소가 바뀌었을 수 있습니다.";

  return (
    <div className="min-h-[50vh] bg-[#F7F7F7] px-4 py-10">
      <p className="text-center text-[15px] font-semibold text-gray-900">{title}</p>
      <p className="mt-2 text-center text-sm text-gray-600">{sub}</p>
      {hint === "network" && onRetry ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800"
          >
            다시 시도
          </button>
        </div>
      ) : null}
      {buckets.length > 0 ? (
        <div className="mx-auto mt-8 max-w-md rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950">
          <p className="font-medium">담아 둔 장바구니가 있으면 아래에서 열 수 있어요.</p>
          <ul className="mt-3 space-y-2">
            {buckets.map((b) => (
              <li key={b.storeId} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {b.storeName} · {b.itemCount}종 · {formatMoneyPhp(b.subtotalPhp)}
                </span>
                <Link
                  href={`/stores/${encodeURIComponent(b.storeSlug)}/cart`}
                  className="shrink-0 font-semibold text-signature underline"
                >
                  장바구니
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-8 text-center">
        <Link href="/stores" className="text-sm font-medium text-signature">
          매장 목록
        </Link>
      </div>
    </div>
  );
}
