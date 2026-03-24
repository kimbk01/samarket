"use client";

import { useState, useMemo } from "react";
import { getCurrentUserId } from "@/lib/regions/mock-user-regions";
import { getTrustSummary } from "@/lib/reviews/trust-utils";
import { getReviewsForTarget, getReviewableItems } from "@/lib/reviews/mock-reviews";
import { getProductById } from "@/lib/mock-products";
import { TrustSummaryCard } from "./TrustSummaryCard";
import { ReviewList } from "./ReviewList";
import { ReviewWriteForm } from "./ReviewWriteForm";

const TARGET_LABEL: Record<string, string> = {
  s1: "판매자A",
  s2: "판매자B",
  s3: "판매자C",
  s4: "판매자D",
  s5: "판매자E",
  b1: "구매자",
  b2: "구매자",
  buyer: "구매자",
};

export function MyReviewsView() {
  const userId = getCurrentUserId();
  const [writingItem, setWritingItem] = useState<{
    transaction: import("@/lib/types/review").Transaction;
    role: import("@/lib/types/review").ReviewRole;
    targetUserId: string;
    targetLabel: string;
    productTitle: string;
  } | null>(null);

  const summary = useMemo(() => getTrustSummary(userId), [userId]);
  const reviews = useMemo(() => getReviewsForTarget(userId), [userId]);
  const reviewableItems = useMemo(() => getReviewableItems(userId), [userId]);

  const handleWriteSuccess = () => {
    setWritingItem(null);
  };

  if (writingItem) {
    return (
      <div className="mx-auto max-w-lg px-4 py-4">
        <h2 className="mb-4 text-[16px] font-semibold text-gray-900">
          후기 작성
        </h2>
        <ReviewWriteForm
          transaction={writingItem.transaction}
          role={writingItem.role}
          targetUserId={writingItem.targetUserId}
          targetLabel={writingItem.targetLabel}
          productTitle={writingItem.productTitle}
          onSuccess={handleWriteSuccess}
          onCancel={() => setWritingItem(null)}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 pb-24">
      <TrustSummaryCard summary={summary} variant="full" />

      <section>
        <h2 className="mb-2 text-[15px] font-semibold text-gray-900">
          받은 후기
        </h2>
        <ReviewList reviews={reviews} />
      </section>

      {reviewableItems.length > 0 && (
        <section>
          <h2 className="mb-2 text-[15px] font-semibold text-gray-900">
            작성 가능한 후기
          </h2>
          <ul className="space-y-2">
            {reviewableItems.map((item) => {
              const product = getProductById(item.transaction.productId);
              const title = product?.title ?? "상품";
              const targetLabel = TARGET_LABEL[item.targetUserId] ?? (item.role === "buyer_to_seller" ? "판매자" : "구매자");
              return (
                <li key={`${item.transaction.id}-${item.role}`}>
                  <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-white p-3">
                    <div>
                      <p className="text-[14px] font-medium text-gray-900">
                        {title}
                      </p>
                      <p className="text-[12px] text-gray-500">
                        {item.role === "buyer_to_seller"
                          ? "판매자에게 후기 쓰기"
                          : "구매자에게 후기 쓰기"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setWritingItem({
                          transaction: item.transaction,
                          role: item.role,
                          targetUserId: item.targetUserId,
                          targetLabel,
                          productTitle: title,
                        })
                      }
                      className="rounded-lg bg-signature px-3 py-1.5 text-[13px] font-medium text-white"
                    >
                      후기 쓰기
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
