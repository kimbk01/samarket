"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { dispatchWrittenReviewUpdated } from "@/lib/mypage/written-review-events";

type ItemRow = { product_id: string; product_title_snapshot: string };

export function StoreOrderReviewForm({ ordersHub = false }: { ordersHub?: boolean }) {
  const params = useParams();
  const router = useRouter();
  const orderId = typeof params?.orderId === "string" ? params.orderId : "";
  const detailHref = orderId
    ? ordersHub
      ? `/orders/store/${encodeURIComponent(orderId)}`
      : `/my/store-orders/${encodeURIComponent(orderId)}`
    : ordersHub
      ? "/orders?tab=store"
      : "/mypage/store-orders";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [storeName, setStoreName] = useState("");
  const [items, setItems] = useState<ItemRow[]>([]);
  const [canSubmit, setCanSubmit] = useState(false);
  const [hasReview, setHasReview] = useState(false);

  const [rating, setRating] = useState(5);
  const [content, setContent] = useState("");
  const [productId, setProductId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/me/store-orders/${encodeURIComponent(orderId)}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (!json?.ok) {
        setErr(typeof json?.error === "string" ? json.error : "load_failed");
        return;
      }
      setStoreName(String(json.order?.store_name ?? ""));
      setItems((json.items ?? []) as ItemRow[]);
      setHasReview(!!json.review?.id);
      setCanSubmit(!!json.can_submit_review);
    } catch {
      setErr("network_error");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!orderId || !canSubmit) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/me/store-reviews", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: orderId,
          rating,
          content: content.trim(),
          product_id: productId || undefined,
        }),
      });
      const json = await res.json();
      if (!json?.ok) {
        const code = typeof json?.error === "string" ? json.error : "failed";
        setErr(
          code === "order_not_completed"
            ? "거래 완료된 주문만 리뷰를 남길 수 있습니다."
            : code === "review_already_exists"
              ? "이미 리뷰를 작성했습니다."
              : `저장에 실패했습니다. (${code})`
        );
        return;
      }
      dispatchWrittenReviewUpdated();
      router.replace(detailHref);
      router.refresh();
    } catch {
      setErr("network_error");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-500">불러오는 중…</p>;
  }
  if (hasReview) {
    return (
      <div className="space-y-3 text-sm text-gray-600">
        <p>이 주문에는 이미 리뷰가 있습니다.</p>
        <Link href={detailHref} className="text-signature underline">
          주문 상세로
        </Link>
      </div>
    );
  }
  if (!canSubmit) {
    return (
      <div className="space-y-3 text-sm text-gray-600">
        <p>주문이 완료된 뒤에 리뷰를 작성할 수 있습니다.</p>
        <Link href={detailHref} className="text-signature underline">
          주문 상세로
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <p className="text-sm text-gray-700">
        <span className="font-medium text-gray-900">{storeName || "매장"}</span> 이용은 어떠셨나요?
      </p>

      {items.length > 0 ? (
        <div>
          <label className="text-xs font-medium text-gray-600">상품 지정 (선택)</label>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="">매장 전체에 대한 리뷰</option>
            {items.map((it) => (
              <option key={it.product_id} value={it.product_id}>
                {it.product_title_snapshot}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div>
        <p className="text-xs font-medium text-gray-600">별점</p>
        <div className="mt-2 flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              className={`h-10 w-10 rounded-lg text-lg ${
                rating >= n ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-400"
              }`}
            >
              ★
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="review-content" className="text-xs font-medium text-gray-600">
          내용
        </label>
        <textarea
          id="review-content"
          rows={5}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={2000}
          placeholder="매장·상품·서비스 경험을 남겨 주세요."
          className="mt-1 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />
      </div>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      <button
        type="submit"
        disabled={busy || content.trim().length < 5}
        className="w-full rounded-xl bg-signature py-3 text-[15px] font-semibold text-white disabled:opacity-50"
      >
        {busy ? "등록 중…" : "리뷰 등록"}
      </button>
    </form>
  );
}
