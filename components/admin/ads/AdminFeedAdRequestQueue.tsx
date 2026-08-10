"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminFeedAdRequestDetail } from "@/components/admin/ads/AdminFeedAdRequestDetail";
import {
  feedAdOpsStatusLabel,
  type FeedAdOpsProductStatus,
} from "@/lib/ads/feed-ad-ops-presentation";
import { feedAdPlacementHumanLabel, type FeedAdPlacement } from "@/lib/ads/feed-ad-placement";

type RequestRow = {
  id: string;
  userId: string;
  memberLabel?: string;
  status: string;
  productStatus?: FeedAdOpsProductStatus;
  domain: string;
  placement: string;
  pointCost: number;
  durationDays: number;
  targetCategoryId?: string | null;
  targetTopicSlug?: string | null;
  reviewReason: string | null;
  creatives: { sortOrder: number; imageUrl: string; headline: string }[];
  createdAt: string;
  endAt?: string | null;
  startAt?: string | null;
};

/**
 * Member Feed Ad Request review queue — HOLD capture / release.
 * Detail opens AdminFormSheet (no raw status dropdown).
 */
export function AdminFeedAdRequestQueue() {
  const { t, safeT, language } = useI18n();
  const en = language === "en";
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending_review");
  const [err, setErr] = useState("");
  const [sheetId, setSheetId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = filter ? `?status=${encodeURIComponent(filter)}` : "";
      const res = await fetch(`/api/admin/feed-ad-requests${qs}`, { cache: "no-store" });
      const j = (await res.json()) as {
        ok?: boolean;
        requests?: RequestRow[];
        statusCounts?: Record<string, number>;
        tableMissing?: boolean;
      };
      setRows(Array.isArray(j.requests) ? j.requests : []);
      setStatusCounts(j.statusCounts ?? {});
      if (j.tableMissing) {
        setErr(
          safeT("admin_feed_req_table_missing", {
            fallbackKo: "feed_ad_requests 마이그레이션이 필요합니다.",
            fallbackEn: "feed_ad_requests migration required.",
          })
        );
      } else {
        setErr("");
      }
    } finally {
      setLoading(false);
    }
  }, [filter, safeT]);

  useEffect(() => {
    void load();
  }, [load]);

  const countLabel = (key: string, fallback: number) => {
    const n = statusCounts[key];
    return typeof n === "number" ? n : fallback;
  };

  return (
    <section className="mb-8 space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="sam-text-body font-semibold text-sam-fg">
            {safeT("admin_feed_req_title", {
              fallbackKo: "피드 광고 신청",
              fallbackEn: "Feed ad requests",
            })}
          </h2>
          <p className="sam-text-helper text-sam-muted">
            {safeT("admin_feed_req_hint", {
              fallbackKo: "상세 시트에서 Creative·연결 확인 후 승인/반려/종료합니다.",
              fallbackEn: "Review creative and destination in the sheet, then approve, reject, or end.",
            })}
          </p>
        </div>
        <select
          className="rounded-ui-rect border border-sam-border px-2 py-1.5 sam-text-helper"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          data-testid="admin-feed-req-filter"
        >
          <option value="pending_review">
            {en ? "In review" : "심사중"} ({countLabel("pending_review", 0)})
          </option>
          <option value="scheduled">
            {en ? "Scheduled" : "광고 예정"} ({countLabel("scheduled", 0)})
          </option>
          <option value="active">
            {en ? "Running" : "광고중"} ({countLabel("active", 0)})
          </option>
          <option value="rejected">
            {en ? "Rejected" : "반려"} ({countLabel("rejected", 0)})
          </option>
          <option value="cancelled">
            {en ? "Cancelled" : "취소"} ({countLabel("cancelled", 0)})
          </option>
          <option value="ended">
            {en ? "Ended" : "종료"} ({countLabel("ended", 0)})
          </option>
          <option value="">{en ? "All" : "전체"}</option>
        </select>
      </div>

      {err ? <p className="sam-text-helper text-sam-warning">{err}</p> : null}
      {loading ? (
        <p className="py-6 text-center text-sam-muted">{t("common_loading")}</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center sam-text-helper text-sam-muted">
          {safeT("admin_feed_req_empty", {
            fallbackKo: "해당 상태의 신청이 없습니다.",
            fallbackEn: "No requests in this status.",
          })}
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const productStatus =
              r.productStatus ??
              (r.status as FeedAdOpsProductStatus);
            const statusText = feedAdOpsStatusLabel(productStatus, en ? "en" : "ko");
            const thumb = r.creatives[0]?.imageUrl;
            const target =
              r.targetTopicSlug ||
              (r.targetCategoryId ? `${r.targetCategoryId.slice(0, 8)}…` : "");
            return (
              <li
                key={r.id}
                data-testid={`feed-ad-req-row-${r.id}`}
                className="rounded-ui-rect border border-sam-border-soft p-3"
              >
                <div className="flex flex-wrap items-start gap-3">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb}
                      alt=""
                      className="h-14 w-24 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-24 shrink-0 items-center justify-center rounded bg-sam-surface-muted sam-text-helper text-sam-muted">
                      —
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="sam-text-body font-medium text-sam-fg">
                      {r.memberLabel || `${r.userId.slice(0, 8)}…`}
                      {" · "}
                      <span className="rounded bg-sam-surface-muted px-1.5 py-0.5 sam-text-helper">
                        {statusText}
                      </span>
                    </p>
                    <p className="sam-text-helper text-sam-muted">
                      {r.domain === "trade" ? "Trade" : "Community"}
                      {" · "}
                      {feedAdPlacementHumanLabel(r.placement as FeedAdPlacement, en ? "en" : "ko")}
                      {target ? ` · ${target}` : ""}
                    </p>
                    <p className="sam-text-helper text-sam-muted">
                      {r.durationDays}
                      {en ? "d" : "일"} · {r.pointCost.toLocaleString()}P
                      {" · "}
                      {r.endAt
                        ? `${en ? "Ends" : "종료"} ${new Date(r.endAt).toLocaleString()}`
                        : new Date(r.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    data-testid={`feed-ad-req-detail-${r.id}`}
                    className="rounded-ui-rect bg-signature px-3 py-1.5 sam-text-helper font-medium text-white"
                    onClick={() => setSheetId(r.id)}
                  >
                    {safeT("admin_feed_req_detail", {
                      fallbackKo: "상세",
                      fallbackEn: "Detail",
                    })}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {sheetId ? (
        <AdminFeedAdRequestDetail
          requestId={sheetId}
          onClose={() => setSheetId(null)}
          onChanged={() => void load()}
        />
      ) : null}
    </section>
  );
}
