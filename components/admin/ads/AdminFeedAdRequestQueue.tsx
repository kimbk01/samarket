"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { feedAdPlacementHumanLabel, type FeedAdPlacement } from "@/lib/ads/feed-ad-placement";

type RequestRow = {
  id: string;
  userId: string;
  status: string;
  domain: string;
  placement: string;
  pointCost: number;
  durationDays: number;
  reviewReason: string | null;
  creatives: { sortOrder: number; imageUrl: string; headline: string }[];
  createdAt: string;
};

/**
 * Member Feed Ad Request review queue — HOLD capture / release.
 * Mounted on /admin/ad-applications alongside legacy post_ads.
 * Approve/reject happen on Detail (PHASE 2).
 */
export function AdminFeedAdRequestQueue() {
  const { t, safeT, language } = useI18n();
  const en = language === "en";
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending_review");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = filter ? `?status=${encodeURIComponent(filter)}` : "";
      const res = await fetch(`/api/admin/feed-ad-requests${qs}`, { cache: "no-store" });
      const j = (await res.json()) as { ok?: boolean; requests?: RequestRow[]; tableMissing?: boolean };
      setRows(Array.isArray(j.requests) ? j.requests : []);
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
              fallbackKo: "상세에서 Creative·Destination 확인 후 승인/거절합니다.",
              fallbackEn:
                "Review Creative and Destination on the detail page, then approve or reject.",
            })}
          </p>
        </div>
        <select
          className="rounded-ui-rect border border-sam-border px-2 py-1.5 sam-text-helper"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="pending_review">{en ? "In review" : "심사 중"}</option>
          <option value="active">{en ? "Active" : "광고 중"}</option>
          <option value="rejected">{en ? "Rejected" : "거절"}</option>
          <option value="cancelled">{en ? "Cancelled" : "취소"}</option>
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
          {rows.map((r) => (
            <li
              key={r.id}
              data-testid={`feed-ad-req-row-${r.id}`}
              className="rounded-ui-rect border border-sam-border-soft p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="sam-text-body font-medium text-sam-fg">
                    {feedAdPlacementHumanLabel(r.placement as FeedAdPlacement, en ? "en" : "ko")}
                    {" · "}
                    {r.durationDays}
                    {en ? "d" : "일"} · {r.pointCost.toLocaleString()}P
                  </p>
                  <p className="sam-text-helper text-sam-muted">
                    {r.userId.slice(0, 8)}…
                    {" · "}
                    {r.status === "pending_review"
                      ? en
                        ? "In review"
                        : "심사 중"
                      : r.status === "active"
                        ? en
                          ? "Running"
                          : "광고 중"
                        : r.status === "rejected"
                          ? en
                            ? "Rejected"
                            : "거절"
                          : r.status}
                    {" · "}
                    {new Date(r.createdAt).toLocaleString()}
                  </p>
                </div>
                <Link
                  href={`/admin/feed-ad-requests/${r.id}`}
                  data-testid={`feed-ad-req-detail-${r.id}`}
                  className="rounded-ui-rect bg-signature px-3 py-1.5 sam-text-helper font-medium text-white"
                >
                  {safeT("admin_feed_req_detail", {
                    fallbackKo: "상세",
                    fallbackEn: "Detail",
                  })}
                </Link>
              </div>
              <div className="mt-2 flex gap-2 overflow-x-auto">
                {r.creatives.map((c) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={c.sortOrder}
                    src={c.imageUrl}
                    alt={c.headline || ""}
                    className="h-16 w-28 shrink-0 rounded object-cover"
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
