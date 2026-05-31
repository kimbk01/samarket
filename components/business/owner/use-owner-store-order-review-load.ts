"use client";

import { useEffect, useRef, useState } from "react";
import { fetchOwnerStoreOrderDetailDeduped } from "@/lib/business/fetch-owner-store-order-detail";
import type { OwnerStoreOrderReviewDetail } from "@/lib/stores/owner-store-order-review-meta";

type Args = {
  storeId: string;
  orderId: string;
  reviewStatus: string | null | undefined;
  enabled: boolean;
};

type Result = {
  review: OwnerStoreOrderReviewDetail | null;
  loading: boolean;
  loadErr: string | null;
  setReview: React.Dispatch<React.SetStateAction<OwnerStoreOrderReviewDetail | null>>;
};

function shouldSkipReviewFetch(reviewStatus: string | null | undefined): boolean {
  return reviewStatus !== "completed";
}

/** 완료 주문 + review_status completed 일 때만 주문 상세 GET 1회( deduped JSON ). */
export function useOwnerStoreOrderReviewLoad({
  storeId,
  orderId,
  reviewStatus,
  enabled,
}: Args): Result {
  const [review, setReview] = useState<OwnerStoreOrderReviewDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const loadSeqRef = useRef(0);

  useEffect(() => {
    const sid = storeId.trim();
    const oid = orderId.trim();

    if (!enabled || !sid || !oid || shouldSkipReviewFetch(reviewStatus)) {
      loadSeqRef.current += 1;
      setReview(null);
      setLoadErr(null);
      setLoading(false);
      return;
    }

    const seq = ++loadSeqRef.current;
    let cancelled = false;
    setLoading(true);
    setLoadErr(null);

    void fetchOwnerStoreOrderDetailDeduped(sid, oid)
      .then((result) => {
        if (cancelled || seq !== loadSeqRef.current) return;
        if (!result.ok) {
          setLoadErr(result.error ?? "load_failed");
          setReview(null);
          return;
        }
        setReview(result.review ?? null);
        setLoadErr(null);
      })
      .catch(() => {
        if (cancelled || seq !== loadSeqRef.current) return;
        setLoadErr("network_error");
        setReview(null);
      })
      .finally(() => {
        if (!cancelled && seq === loadSeqRef.current) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, orderId, reviewStatus, storeId]);

  return { review, loading, loadErr, setReview };
}
