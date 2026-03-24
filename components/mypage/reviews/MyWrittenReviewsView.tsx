"use client";

import { useCallback, useEffect, useState } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import Link from "next/link";
import { getAppSettings } from "@/lib/app-settings";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { formatPrice } from "@/lib/utils/format";
import { formatAdminReviewTagKeys } from "@/lib/admin-reviews/admin-review-utils";
import { WRITTEN_REVIEW_UPDATED_EVENT } from "@/lib/mypage/written-review-events";

export interface MyWrittenReviewItem {
  id: string;
  roomId: string;
  productId: string;
  title: string;
  thumbnail: string;
  price: number;
  revieweeId: string;
  revieweeNickname: string;
  roleType: string;
  publicReviewType: "good" | "normal" | "bad";
  positiveTagKeys: string[];
  negativeTagKeys: string[];
  comment: string;
  isAnonymousNegative: boolean;
  createdAt: string;
}

const PUBLIC_LABELS: Record<string, string> = {
  good: "좋아요",
  normal: "보통",
  bad: "별로",
};

function tagLine(roleType: string, positiveTagKeys: string[], negativeTagKeys: string[]): string {
  const pos = formatAdminReviewTagKeys(roleType, positiveTagKeys);
  const neg = formatAdminReviewTagKeys(roleType, negativeTagKeys);
  const parts: string[] = [];
  if (pos !== "—") parts.push(`긍정: ${pos}`);
  if (neg !== "—") parts.push(`부정: ${neg}`);
  return parts.length ? parts.join(" · ") : "";
}

export function MyWrittenReviewsView() {
  const currency = getAppSettings().defaultCurrency ?? "KRW";
  const [items, setItems] = useState<MyWrittenReviewItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback((opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    const user = getCurrentUser();
    const uid = user?.id?.trim();
    if (!uid) {
      setItems([]);
      if (!silent) setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    fetch("/api/my/written-reviews", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { items?: MyWrittenReviewItem[] }) => {
        setItems(Array.isArray(d.items) ? d.items : []);
      })
      .catch(() => {
        if (!silent) setItems([]);
      })
      .finally(() => {
        if (!silent) setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onAuth = () => load();
    const onWritten = () => load();
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
    window.addEventListener(WRITTEN_REVIEW_UPDATED_EVENT, onWritten);
    return () => {
      window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
      window.removeEventListener(WRITTEN_REVIEW_UPDATED_EVENT, onWritten);
    };
  }, [load]);

  useRefetchOnPageShowRestore(() => void load({ silent: true }));

  if (loading) {
    return <p className="py-12 text-center text-[14px] text-gray-500">불러오는 중…</p>;
  }

  if (items.length === 0) {
    return (
      <div className="space-y-4 rounded-xl border border-gray-200 bg-white px-4 py-8 text-center">
        <p className="text-[14px] text-gray-600">아직 작성한 거래 후기가 없어요.</p>
        <p className="text-[13px] text-gray-500">
          거래완료 확인 후 구매내역에서 평가·후기를 남길 수 있어요.
        </p>
        <Link
          href="/mypage/purchases"
          className="inline-block rounded-lg bg-violet-700 px-4 py-2.5 text-[14px] font-medium text-white"
        >
          구매내역 보기
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((it) => {
        const tags = tagLine(it.roleType, it.positiveTagKeys, it.negativeTagKeys);
        const detailHref = it.roomId ? `/mypage/purchases/${encodeURIComponent(it.roomId)}` : "/mypage/purchases";
        return (
          <li
            key={it.id}
            className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm"
          >
            <div className="flex gap-2 p-3">
              <Link href={detailHref} className="flex min-w-0 flex-1 gap-3">
                <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-lg bg-gray-100">
                  {it.thumbnail ? (
                    <img src={it.thumbnail} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[11px] text-gray-400">이미지</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[14px] font-medium text-gray-900">{it.title || "상품"}</p>
                  <p className="mt-0.5 text-[15px] font-bold text-gray-900">{formatPrice(it.price, currency)}</p>
                  <p className="mt-0.5 truncate text-[12px] text-gray-600">
                    판매자 {it.revieweeNickname}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-800">
                      {PUBLIC_LABELS[it.publicReviewType] ?? it.publicReviewType}
                    </span>
                    {it.isAnonymousNegative ? (
                      <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                        익명 표시
                      </span>
                    ) : null}
                  </div>
                  {tags ? (
                    <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-gray-600">{tags}</p>
                  ) : null}
                  {it.comment ? (
                    <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[12px] text-gray-700">
                      {it.comment}
                    </p>
                  ) : null}
                  <p className="mt-1.5 text-[11px] text-gray-400">
                    작성 {new Date(it.createdAt).toLocaleString("ko-KR")}
                  </p>
                </div>
              </Link>
            </div>
            <div className="flex gap-2 border-t border-gray-50 px-3 py-2">
              {it.roomId ? (
                <Link
                  href={`/chats/${encodeURIComponent(it.roomId)}`}
                  className="text-[13px] font-medium text-violet-700 hover:underline"
                >
                  채팅방
                </Link>
              ) : null}
              <Link href={detailHref} className="text-[13px] font-medium text-violet-700 hover:underline">
                구매 상세
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
