"use client";

import Link from "next/link";
import { HistoryBackTextLink } from "@/components/navigation/HistoryBackTextLink";
import { StoreCommerceOrderDetailClient } from "@/components/stores/StoreCommerceOrderDetailClient";
import { isLikelyUuid } from "@/lib/stores/is-likely-uuid";

/** `/stores/[slug]/order/[orderId]` — UUID만 실매장 주문 상세. 샘플·시뮬 주문 경로는 제거됨. */
export function RestaurantOrderDetailClient({
  storeSlug,
  orderId,
}: {
  storeSlug: string;
  orderId: string;
}) {
  if (isLikelyUuid(orderId)) {
    return <StoreCommerceOrderDetailClient storeSlug={storeSlug} orderId={orderId} />;
  }

  return (
    <div className="px-4 py-12 text-center">
      <div className="mb-4 text-left">
        <HistoryBackTextLink
          fallbackHref={`/stores/${encodeURIComponent(storeSlug)}`}
          className="text-sm text-signature"
          aria-label="매장으로"
        >
          ← 매장
        </HistoryBackTextLink>
      </div>
      <p className="text-sm text-sam-muted">주문을 찾을 수 없거나 올바른 주문 번호가 아닙니다.</p>
      <p className="mt-2 text-sm text-sam-muted">
        실매장에서 주문하셨다면 내 배달 주문에서 확인해 주세요.
      </p>
      <Link
        href="/my/store-orders"
        className="mt-4 inline-block text-sm font-medium text-signature underline"
      >
        내 배달 주문
      </Link>
      <Link href="/stores" className="mt-4 block text-sm text-signature">
        매장 홈
      </Link>
    </div>
  );
}
