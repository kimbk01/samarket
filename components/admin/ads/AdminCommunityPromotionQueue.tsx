"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayPrompt } from "@/components/ui/dibay-overlay";

type OrderRow = {
  id: string;
  userId: string;
  userNickname: string;
  targetId: string;
  targetTitle: string;
  pointCost: number;
  durationDays: number;
  orderStatus: string;
  productId?: string;
  endAt: string;
  createdAt: string;
  reviewReason?: string | null;
  listingStatus?: string;
  listingEligible?: boolean;
};

type Domain = "community" | "trade";

/**
 * Member paid-exposure approval queue (point_promotion_orders).
 * Community + Trade「더 알리기」 share HOLD capture / release.
 */
export function AdminCommunityPromotionQueue({ domain = "community" }: { domain?: Domain }) {
  const { safeT, language } = useI18n();
  const en = language === "en";
  const isTrade = domain === "trade";
  const listHref = isTrade
    ? "/api/admin/trade-promotion-orders"
    : "/api/admin/community-promotion-orders";
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending_review");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = filter ? `?status=${encodeURIComponent(filter)}` : "";
      const res = await fetch(`${listHref}${qs}`, {
        cache: "no-store",
      });
      const j = (await res.json()) as { ok?: boolean; orders?: OrderRow[]; error?: string };
      setRows(Array.isArray(j.orders) ? j.orders : []);
      setErr(j.error ?? "");
    } finally {
      setLoading(false);
    }
  }, [filter, listHref]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id: string, action: "approve" | "reject") => {
    let reason = "";
    if (action === "reject") {
      reason =
        (await dibayPrompt({
          title: safeT("admin_comm_promo_reject_prompt", {
            fallbackKo: "거절 사유 (필수)",
            fallbackEn: "Reject reason (required)",
          }),
          defaultValue: "",
          required: true,
        })) ?? "";
      if (!reason.trim()) return;
    }
    setBusyId(id);
    try {
      const res = await fetch(`${listHref}/${id}`, {
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
            {isTrade
              ? safeT("admin_trade_promo_title", {
                  fallbackKo: "거래 더 알리기 신청",
                  fallbackEn: "Trade promote requests",
                })
              : safeT("admin_comm_promo_title", {
                  fallbackKo: "게시물 홍보 신청",
                  fallbackEn: "Post promotion requests",
                })}
          </h2>
          <p className="sam-text-helper text-sam-muted">
            {isTrade
              ? safeT("admin_trade_promo_hint", {
                  fallbackKo: "거래 매물 더 알리기 — 글 확인 후 HOLD 확정/해제. 승인 시 홈·해당 카테고리 목록에 노출됩니다.",
                  fallbackEn:
                    "Trade listing boost — review the post, then HOLD capture / release. After approval it appears on Home and that category feed.",
                })
              : safeT("admin_comm_promo_hint", {
                  fallbackKo: "커뮤니티 게시물 상위노출 — HOLD 확정/해제",
                  fallbackEn: "Community post boost — HOLD capture / release",
                })}
          </p>
        </div>
        <select
          className="rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 sam-text-helper"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="pending_review">{en ? "Pending" : "심사 중"}</option>
          <option value="active">{en ? "Active" : "노출 중"}</option>
          <option value="rejected">{en ? "Rejected" : "거절"}</option>
          <option value="">{en ? "All" : "전체"}</option>
        </select>
      </div>

      {err ? <p className="sam-text-helper text-red-600">{err}</p> : null}
      {loading ? (
        <p className="py-6 text-center sam-text-helper text-sam-muted">…</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center sam-text-helper text-sam-muted">
          {safeT("admin_comm_promo_empty", {
            fallbackKo: "해당 상태의 신청이 없습니다.",
            fallbackEn: "No requests in this status.",
          })}
        </p>
      ) : (
        <ul className="divide-y divide-sam-border-soft">
          {rows.map((row) => {
            const busy = busyId === row.id;
            const canAct = row.orderStatus === "pending_review";
            const listingHref = isTrade ? `/post/${encodeURIComponent(row.targetId)}` : "";
            return (
              <li key={row.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="sam-text-body font-medium text-sam-fg truncate">
                    {row.targetTitle || row.targetId}
                  </p>
                  <p className="sam-text-helper text-sam-muted">
                    {row.userNickname || row.userId.slice(0, 8)} · {row.pointCost.toLocaleString()}P ·{" "}
                    {row.durationDays}d · {row.productId ?? "—"} · {row.orderStatus}
                    {isTrade && row.listingStatus
                      ? ` · ${row.listingStatus}${row.listingEligible === false ? " (비공개)" : ""}`
                      : ""}
                  </p>
                  {listingHref && row.listingEligible !== false ? (
                    <a
                      href={listingHref}
                      target="_blank"
                      rel="noreferrer"
                      className="sam-text-helper font-medium text-signature underline-offset-2 hover:underline"
                    >
                      {safeT("admin_trade_promo_open_listing", {
                        fallbackKo: "매물 상세 확인",
                        fallbackEn: "Open listing",
                      })}
                    </a>
                  ) : isTrade ? (
                    <p className="sam-text-helper text-sam-muted">
                      {safeT("admin_trade_promo_review_snapshot", {
                        fallbackKo: "공개 상세는 숨김/삭제 글을 열 수 없습니다. 위 상태·제목으로 심사하세요.",
                        fallbackEn:
                          "Public listing detail may be blocked for hidden/deleted posts. Review status and title here.",
                      })}
                    </p>
                  ) : null}
                  {row.reviewReason ? (
                    <p className="sam-text-helper text-sam-muted">{row.reviewReason}</p>
                  ) : null}
                </div>
                {canAct ? (
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void act(row.id, "approve")}
                      className="rounded-ui-rect bg-signature px-3 py-1.5 sam-text-helper font-medium text-white disabled:opacity-50"
                    >
                      {en ? "Approve" : "승인"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void act(row.id, "reject")}
                      className="rounded-ui-rect border border-sam-border px-3 py-1.5 sam-text-helper font-medium text-sam-fg disabled:opacity-50"
                    >
                      {en ? "Reject" : "거절"}
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
