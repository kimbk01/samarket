"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { isLikelyUuid } from "@/lib/stores/is-likely-uuid";
import { formatMoneyPhp } from "@/lib/utils/format";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";

type RealOrderHead = {
  id: string;
  order_no: string;
  store_name: string;
  store_slug: string;
  payment_amount: number;
  order_status: string;
  fulfillment_type: string;
};

export function RestaurantOrderCompleteClient({ storeSlug }: { storeSlug: string }) {
  const sp = useSearchParams();
  const orderId = sp.get("orderId")?.trim() ?? "";

  const [real, setReal] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | {
        kind: "ok";
        order: RealOrderHead;
        canSubmitReview: boolean;
        hasReview: boolean;
      }
    | { kind: "fail" }
  >({ kind: "idle" });

  const loadReal = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!orderId || !isLikelyUuid(orderId)) {
        setReal({ kind: "idle" });
        return;
      }
      const silent = !!opts?.silent;
      if (!silent) setReal({ kind: "loading" });
      try {
        const res = await fetch(`/api/me/store-orders/${encodeURIComponent(orderId)}`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = await res.json();
        if (!json?.ok || !json.order) {
          if (!silent) setReal({ kind: "fail" });
          return;
        }
        const o = json.order as RealOrderHead;
        if (o.store_slug && o.store_slug !== storeSlug) {
          if (!silent) setReal({ kind: "fail" });
          return;
        }
        setReal({
          kind: "ok",
          order: o,
          canSubmitReview: !!json.can_submit_review,
          hasReview: !!json.review?.id,
        });
      } catch {
        if (!silent) setReal({ kind: "fail" });
      }
    },
    [orderId, storeSlug]
  );

  useEffect(() => {
    void loadReal();
  }, [loadReal]);

  useRefetchOnPageShowRestore(() => void loadReal({ silent: true }));

  if (orderId && isLikelyUuid(orderId)) {
    if (real.kind === "loading" || real.kind === "idle") {
      return <p className="p-6 text-center text-sm text-sam-muted">불러오는 중…</p>;
    }
    if (real.kind === "ok") {
      const o = real.order;
      const { canSubmitReview, hasReview } = real;
      const showReviewCta =
        o.order_status === "completed" && canSubmitReview && !hasReview;
      return (
        <div className="min-h-screen bg-[#f3f4f6] px-4 py-8 pb-16">
          <div className="mx-auto max-w-md rounded-ui-rect border border-emerald-100 bg-sam-surface p-6 shadow-sm">
            <p className="text-center text-sm font-semibold text-emerald-700">
              {o.order_status === "completed" ? "주문이 완료되었습니다" : "주문이 접수되었습니다"}
            </p>
            <h1 className="mt-2 text-center text-xl font-bold text-sam-fg">감사합니다</h1>
            <dl className="mt-6 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-sam-muted">주문번호</dt>
                <dd className="font-mono font-semibold">{o.order_no}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sam-muted">업체</dt>
                <dd className="font-medium">{o.store_name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sam-muted">주문 금액</dt>
                <dd className="font-bold">{formatMoneyPhp(o.payment_amount)}</dd>
              </div>
            </dl>
            {showReviewCta ? (
              <Link
                href={`/my/store-orders/${encodeURIComponent(o.id)}/review`}
                className="mt-6 block w-full rounded-ui-rect bg-amber-500 py-3 text-center text-sm font-bold text-white shadow-sm"
              >
                배달 완료 · 리뷰 남기기
              </Link>
            ) : null}
            {!showReviewCta && o.order_status !== "completed" ? (
              <p className="mt-4 rounded-ui-rect bg-sam-app px-3 py-2 text-center text-[11px] leading-relaxed text-sam-muted">
                진행 상황은 주문 상세에서 확인하고, 매장과 조율이 필요할 때만 채팅을 이용할 수 있어요. 주문이
                모두 완료되면 리뷰를 작성할 수 있습니다.
              </p>
            ) : null}
            <Link
              href={`/my/store-orders/${encodeURIComponent(o.id)}`}
              className={`${showReviewCta ? "mt-3" : "mt-6"} block w-full rounded-ui-rect bg-signature py-3 text-center text-sm font-bold text-white`}
            >
              주문 상세 보기
            </Link>
            <Link
              href={`/my/store-orders/${encodeURIComponent(o.id)}/chat`}
              className="mt-3 block w-full rounded-ui-rect border border-signature bg-signature/5 py-3 text-center text-sm font-semibold text-signature"
            >
              매장 문의 남기기
            </Link>
            <Link
              href={`/stores/${encodeURIComponent(storeSlug)}/order/${encodeURIComponent(o.id)}`}
              className="mt-2 block w-full py-2 text-center text-sm text-sam-muted underline"
            >
              매장에서 보기
            </Link>
            <Link
              href={`/stores/${encodeURIComponent(storeSlug)}`}
              className="mt-2 block w-full py-2 text-center text-sm text-sam-muted"
            >
              매장으로 돌아가기
            </Link>
          </div>
        </div>
      );
    }
  }

  const maybeReal = orderId.length > 0 && isLikelyUuid(orderId);
  return (
    <div className="px-4 py-12 text-center">
      <p className="text-sm text-sam-muted">주문 정보를 불러오지 못했거나 주문 번호가 없습니다.</p>
      {maybeReal ? (
        <p className="mt-2 text-sm text-sam-muted">
          실제 배달 주문이면 아래에서 진행 상태를 확인할 수 있습니다.
        </p>
      ) : null}
      {maybeReal ? (
        <Link
          href={`/my/store-orders/${encodeURIComponent(orderId)}`}
          className="mt-4 inline-block text-sm font-medium text-signature underline"
        >
          내 배달 주문 상세
        </Link>
      ) : null}
      <Link href="/stores" className="mt-4 block text-sm text-signature">
        매장 홈
      </Link>
    </div>
  );
}
