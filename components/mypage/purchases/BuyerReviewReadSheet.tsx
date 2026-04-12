"use client";

import { useEffect, useState } from "react";
import {
  BUYER_TO_SELLER_NEGATIVE,
  BUYER_TO_SELLER_POSITIVE,
} from "@/lib/trade/trade-review-tags";
import { getCurrentUser } from "@/lib/auth/get-current-user";

const LABEL = new Map<string, string>([
  ...BUYER_TO_SELLER_POSITIVE.map((x) => [x.key, x.label] as const),
  ...BUYER_TO_SELLER_NEGATIVE.map((x) => [x.key, x.label] as const),
]);

interface ReviewPayload {
  public_review_type: string;
  positive_tag_keys: string[] | null;
  negative_tag_keys: string[] | null;
  review_comment: string | null;
  created_at: string;
}

export function BuyerReviewReadSheet({
  chatId,
  perspective,
  onClose,
}: {
  chatId: string;
  perspective: "buyer_self" | "seller_sees_buyer";
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rev, setRev] = useState<ReviewPayload | null>(null);

  useEffect(() => {
    const u = getCurrentUser()?.id?.trim();
    if (!u) {
      setErr("로그인이 필요합니다.");
      setLoading(false);
      return;
    }
    const path =
      perspective === "buyer_self"
        ? `/api/my/buyer-review?chatId=${encodeURIComponent(chatId)}`
        : `/api/my/seller-sees-buyer-review?chatId=${encodeURIComponent(chatId)}`;
    fetch(path)
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          review?: ReviewPayload;
          error?: string;
        };
        if (!res.ok) {
          setErr(data.error ?? "불러오지 못했습니다.");
          return;
        }
        setRev(data.review ?? null);
      })
      .catch(() => setErr("네트워크 오류입니다."))
      .finally(() => setLoading(false));
  }, [chatId, perspective]);

  const title =
    perspective === "buyer_self" ? "내가 남긴 후기" : "구매자 후기";

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-t-[length:var(--ui-radius-rect)] bg-sam-surface shadow-xl sm:rounded-ui-rect">
        <div className="flex items-center justify-between border-b border-sam-border-soft px-4 py-3">
          <h2 className="text-[16px] font-semibold text-sam-fg">{title}</h2>
          <button type="button" onClick={onClose} className="text-[14px] text-sam-muted">
            닫기
          </button>
        </div>
        <div className="max-h-[calc(85vh-52px)] overflow-y-auto p-4">
          {loading ? (
            <p className="py-8 text-center text-[14px] text-sam-muted">불러오는 중…</p>
          ) : err ? (
            <p className="py-8 text-center text-[14px] text-red-600">{err}</p>
          ) : rev ? (
            <div className="space-y-3 text-[14px] text-sam-fg">
              <p>
                <span className="text-sam-muted">총평</span>{" "}
                <span className="font-medium">
                  {rev.public_review_type === "good"
                    ? "좋아요"
                    : rev.public_review_type === "bad"
                      ? "별로예요"
                      : "보통"}
                </span>
              </p>
              {(rev.positive_tag_keys?.length ?? 0) > 0 ? (
                <div>
                  <p className="mb-1 text-[12px] font-medium text-sam-muted">긍정</p>
                  <ul className="flex flex-wrap gap-1">
                    {(rev.positive_tag_keys ?? []).map((k) => (
                      <li
                        key={k}
                        className="rounded-full bg-signature/5 px-2 py-0.5 text-[11px] text-sam-fg"
                      >
                        {LABEL.get(k) ?? k}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {(rev.negative_tag_keys?.length ?? 0) > 0 ? (
                <div>
                  <p className="mb-1 text-[12px] font-medium text-sam-muted">부정</p>
                  <ul className="flex flex-wrap gap-1">
                    {(rev.negative_tag_keys ?? []).map((k) => (
                      <li
                        key={k}
                        className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-900"
                      >
                        {LABEL.get(k) ?? k}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {rev.review_comment ? (
                <p className="whitespace-pre-wrap text-[13px] text-sam-fg">{rev.review_comment}</p>
              ) : null}
              <p className="text-[11px] text-sam-meta">
                {rev.created_at
                  ? new Date(rev.created_at).toLocaleString("ko-KR")
                  : ""}
              </p>
            </div>
          ) : (
            <p className="py-8 text-center text-sam-muted">후기가 없습니다.</p>
          )}
        </div>
      </div>
    </div>
  );
}
