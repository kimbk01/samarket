"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  AD_APPLY_STATUS_LABELS,
  AD_PAYMENT_METHOD_LABELS,
  AD_TYPE_LABELS,
} from "@/lib/ads/types";
import type { AdminPostAdRow, AdApplyStatus } from "@/lib/ads/types";

const STATUS_CLASS: Record<AdApplyStatus, string> = {
  draft: "bg-sam-surface-muted text-sam-fg",
  pending_payment: "bg-amber-100 text-amber-800",
  pending_review: "bg-blue-100 text-blue-800",
  approved: "bg-sky-50 text-sky-800",
  active: "bg-emerald-50 text-emerald-800",
  rejected: "bg-red-50 text-red-700",
  expired: "bg-sam-border-soft text-sam-muted",
  cancelled: "bg-sam-border-soft text-sam-muted",
};

export function MyPostAdList({
  ads,
  metaSource,
  onRefresh,
}: {
  ads: AdminPostAdRow[];
  metaSource?: "supabase" | "memory";
  onRefresh?: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const cancel = useCallback(
    async (id: string) => {
      setErr(null);
      setBusyId(id);
      try {
        const res = await fetch(`/api/me/post-ads/${encodeURIComponent(id)}/cancel`, {
          method: "POST",
          credentials: "include",
        });
        const j = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !j.ok) {
          setErr(j.error === "not_cancellable" ? "이 단계에서는 취소할 수 없습니다." : "취소에 실패했습니다.");
          return;
        }
        onRefresh?.();
      } finally {
        setBusyId(null);
      }
    },
    [onRefresh]
  );

  if (ads.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-8 text-center text-[14px] text-sam-muted">
        <p>게시글 광고 신청 내역이 없습니다.</p>
        <p className="mt-2 text-[12px] text-sam-meta">
          커뮤니티·동네 피드에서 글을 작성한 뒤, 해당 글에 대해 광고를 신청할 수 있어요.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {metaSource === "memory" ? (
        <p className="rounded-ui-rect border border-amber-200 bg-amber-50/90 px-3 py-2 text-[11px] text-amber-950">
          개발용 인메모리 목록입니다. Supabase에 <code className="rounded bg-sam-surface/80 px-1">post_ads</code> 테이블을
          적용하면 DB와 동기화됩니다.
        </p>
      ) : null}
      {err ? (
        <p className="rounded-ui-rect bg-red-50 px-3 py-2 text-[13px] text-red-700">{err}</p>
      ) : null}
      <ul className="space-y-3">
        {ads.map((a) => (
          <li key={a.id} className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
            <p className="font-semibold text-sam-fg">{a.postTitle}</p>
            <p className="mt-0.5 text-[13px] text-sam-muted">
              {a.adProductName} · {AD_TYPE_LABELS[a.adType]} · {a.pointCost.toLocaleString()}P
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASS[a.applyStatus]}`}
              >
                {AD_APPLY_STATUS_LABELS[a.applyStatus]}
              </span>
              <span className="text-[11px] text-sam-muted">
                결제: {AD_PAYMENT_METHOD_LABELS[a.paymentMethod]}
              </span>
              <span className="text-[11px] text-sam-meta">· {a.boardKey}</span>
            </div>
            {a.applyStatus === "active" && a.startAt && a.endAt ? (
              <p className="mt-1 text-[11px] text-sam-muted">
                노출 {new Date(a.startAt).toLocaleDateString("ko-KR")} ~{" "}
                {new Date(a.endAt).toLocaleDateString("ko-KR")}
              </p>
            ) : null}
            <p className="mt-1 text-[11px] text-sam-meta">
              신청일 {new Date(a.createdAt).toLocaleString("ko-KR")}
            </p>
            {a.adminNote ? (
              <p className="mt-2 rounded-ui-rect bg-sam-app px-2 py-1.5 text-[12px] text-sam-muted">
                안내: {a.adminNote}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              <Link
                href={`/community/post/${encodeURIComponent(a.postId)}`}
                className="text-[12px] font-medium text-signature underline decoration-signature/30"
              >
                게시글 보기
              </Link>
              {["draft", "pending_payment", "pending_review"].includes(a.applyStatus) ? (
                <button
                  type="button"
                  disabled={busyId === a.id}
                  onClick={() => void cancel(a.id)}
                  className="text-[12px] font-medium text-red-600 hover:underline disabled:opacity-50"
                >
                  {busyId === a.id ? "처리 중…" : "신청 취소"}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
