"use client";

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
 */
export function AdminFeedAdRequestQueue() {
  const { t, safeT, language } = useI18n();
  const en = language === "en";
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending_review");
  const [busyId, setBusyId] = useState<string | null>(null);
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

  const act = async (id: string, action: "approve" | "reject") => {
    let reason = "";
    if (action === "reject") {
      reason = window.prompt(
        safeT("admin_feed_req_reject_prompt", {
          fallbackKo: "거절 사유 (필수)",
          fallbackEn: "Reject reason (required)",
        }),
        ""
      ) ?? "";
      if (!reason.trim()) return;
    }
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/feed-ad-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "failed");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
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
              fallbackKo: "승인 시 D-Point 확정 + 캠페인 생성. 거절 시 보류 해제.",
              fallbackEn: "Approve = capture + campaign. Reject = release hold.",
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
                {r.status === "pending_review" ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      data-testid={`feed-ad-req-approve-${r.id}`}
                      disabled={busyId === r.id}
                      className="rounded-ui-rect bg-signature px-3 py-1.5 sam-text-helper font-medium text-white disabled:opacity-50"
                      onClick={() => void act(r.id, "approve")}
                    >
                      {safeT("admin_feed_req_approve", { fallbackKo: "승인", fallbackEn: "Approve" })}
                    </button>
                    <button
                      type="button"
                      data-testid={`feed-ad-req-reject-${r.id}`}
                      disabled={busyId === r.id}
                      className="rounded-ui-rect border border-sam-border px-3 py-1.5 sam-text-helper disabled:opacity-50"
                      onClick={() => void act(r.id, "reject")}
                    >
                      {safeT("admin_feed_req_reject", { fallbackKo: "거절", fallbackEn: "Reject" })}
                    </button>
                  </div>
                ) : null}
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
