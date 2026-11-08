"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminFeedAdRequestDetail } from "@/components/admin/ads/AdminFeedAdRequestDetail";
import {
  feedAdOpsStatusLabel,
  type FeedAdOpsProductStatus,
} from "@/lib/ads/feed-ad-ops-presentation";
import { feedAdPlacementHumanLabel, type FeedAdPlacement } from "@/lib/ads/feed-ad-placement";
import { formatAdminShortIdEllipsis } from "@/components/admin/ui/AdminTechId";

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
 * Member Feed Ad Request queue — application authority only.
 * Approved campaigns are operated from Ads / Exposure operations.
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
          safeT("admin_feed_req_table_missing")
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
            {safeT("admin_feed_req_title")}
          </h2>
          <p className="sam-text-helper text-sam-muted">
            {safeT("admin_feed_req_hint")}
          </p>
        </div>
        <select
          className="rounded-ui-rect border border-sam-border px-2 py-1.5 sam-text-helper"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          data-testid="admin-feed-req-filter"
        >
          <option value="pending_review">
            {t("admin_ads_pending_approval")} ({countLabel("pending_review", 0)})
          </option>
          <option value="rejected">
            {t("admin_ads_summary_rejected")} ({countLabel("rejected", 0)})
          </option>
          <option value="cancelled">
            {t("admin_ads_app_status_cancelled")} ({countLabel("cancelled", 0)})
          </option>
          <option value="">{t("common_all")}</option>
        </select>
      </div>

      {err ? <p className="sam-text-helper text-sam-warning">{err}</p> : null}
      {loading ? (
        <p className="py-6 text-center text-sam-muted">{t("common_loading")}</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center sam-text-helper text-sam-muted">
          {safeT("admin_feed_req_empty")}
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
              (r.targetCategoryId ? formatAdminShortIdEllipsis(r.targetCategoryId) : "");
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
                      {r.memberLabel || formatAdminShortIdEllipsis(r.userId)}
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
                      {t("admin_ads_d")} · {r.pointCost.toLocaleString()}P
                      {" · "}
                      {r.endAt
                        ? `${t("admin_ads_ends")} ${new Date(r.endAt).toLocaleString()}`
                        : new Date(r.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    data-testid={`feed-ad-req-detail-${r.id}`}
                    className="rounded-ui-rect bg-signature px-3 py-1.5 sam-text-helper font-medium text-white"
                    onClick={() => setSheetId(r.id)}
                  >
                    {safeT("admin_feed_req_detail")}
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
