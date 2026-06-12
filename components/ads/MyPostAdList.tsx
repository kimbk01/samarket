"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  postAdPaymentLabel,
  postAdStatusLabel,
  postAdTypeLabel,
} from "@/lib/ads/post-ad-label-keys";
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
  metaSource?: "supabase" | "missing_table" | "unavailable";
  onRefresh?: () => void;
}) {
  const { t } = useI18n();
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
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-8 text-center sam-text-body text-sam-muted">
        <p>{t("ui_ad_post_list_empty")}</p>
        <p className="mt-2 sam-text-helper text-sam-meta">
          커뮤니티·동네 피드에서 글을 작성한 뒤, 해당 글에 대해 광고를 신청할 수 있어요.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {metaSource === "missing_table" || metaSource === "unavailable" ? (
        <p className="rounded-ui-rect border border-amber-200 bg-amber-50/90 px-3 py-2 sam-text-xxs text-amber-950">
          {t("ui_ad_post_db_unavailable")}
        </p>
      ) : null}
      {err ? (
        <p className="rounded-ui-rect bg-red-50 px-3 py-2 sam-text-body-secondary text-red-700">{err}</p>
      ) : null}
      <ul className="space-y-3">
        {ads.map((a) => (
          <li key={a.id} className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
            <p className="font-semibold text-sam-fg">{a.postTitle}</p>
            <p className="mt-0.5 sam-text-body-secondary text-sam-muted">
              {a.adProductName} · {postAdTypeLabel(t, a.adType)} · {a.pointCost.toLocaleString()}P
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={`inline-block rounded-full px-2 py-0.5 sam-text-xxs font-semibold ${STATUS_CLASS[a.applyStatus]}`}
              >
                {postAdStatusLabel(t, a.applyStatus)}
              </span>
              <span className="sam-text-xxs text-sam-muted">
                {t("post_ad_list_payment_prefix")} {postAdPaymentLabel(t, a.paymentMethod)}
              </span>
              <span className="sam-text-xxs text-sam-meta">· {a.boardKey}</span>
            </div>
            {a.applyStatus === "active" && a.startAt && a.endAt ? (
              <p className="mt-1 sam-text-xxs text-sam-muted">
                노출 {new Date(a.startAt).toLocaleDateString("ko-KR")} ~{" "}
                {new Date(a.endAt).toLocaleDateString("ko-KR")}
              </p>
            ) : null}
            <p className="mt-1 sam-text-xxs text-sam-meta">
              신청일 {new Date(a.createdAt).toLocaleString("ko-KR")}
            </p>
            {a.adminNote ? (
              <p className="mt-2 rounded-ui-rect bg-sam-app px-2 py-1.5 sam-text-helper text-sam-muted">
                안내: {a.adminNote}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              <Link
                href={`/community/post/${encodeURIComponent(a.postId)}`}
                className="sam-text-helper font-medium text-signature underline decoration-signature/30"
              >
                게시글 보기
              </Link>
              {["draft", "pending_payment", "pending_review"].includes(a.applyStatus) ? (
                <button
                  type="button"
                  disabled={busyId === a.id}
                  onClick={() => void cancel(a.id)}
                  className="sam-text-helper font-medium text-red-600 hover:underline disabled:opacity-50"
                >
                  {busyId === a.id ? t("community_meeting_join_processing") : t("points_ui_cancel_request")}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
