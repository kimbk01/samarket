"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayPrompt } from "@/components/ui/dibay-overlay";
import {
  adsOpsStatusLabel,
  projectAdsEffectiveLifecycle,
} from "@/lib/admin/ads-exposure/ops-status";
import { emitAdminQueueChanged } from "@/lib/admin/admin-queue-events";
import { formatAdminShortId } from "@/components/admin/ui/AdminTechId";

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
  startAt?: string;
  endAt: string;
  createdAt: string;
  reviewReason?: string | null;
  listingStatus?: string;
  listingEligible?: boolean;
};

type Domain = "community" | "trade";

/**
 * Member paid-exposure application queue (point_promotion_orders).
 * Community + Trade「더 알리기」 share HOLD capture / release.
 * Campaign operations are handled by Ads / Exposure operations.
 *
 * CUT B: display uses effective lifecycle (STORED ≠ EFFECTIVE).
 * 설계 v2 §F-1 (C-47): 커뮤니티 「신청→승인」 보류 경로는 서버에서 비활성(410) — 커뮤니티 행은 조회만 하고
 * 노출 중지·재개·종료는 `/admin/community/promotions` (게시글 홍보) 에서 처리한다. 거래는 기존 승인/반려 유지.
 */
export function AdminCommunityPromotionQueue({ domain = "community" }: { domain?: Domain }) {
  const { safeT, language, t } = useI18n();
  const en = language === "en";
  const isTrade = domain === "trade";
  const listHref = isTrade
    ? "/api/admin/trade-promotion-orders"
    : "/api/admin/community-promotion-orders";
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  /** 광고 감사 P-5: 거래 상위노출은 심사 없이 결제 즉시 노출 → 기본은 전체(주문 내역). 「승인 대기」는 옛 주문 조회용 */
  const [filter, setFilter] = useState("");
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
    if (!isTrade) return;
    let reason = "";
    if (action === "reject") {
      reason =
        (await dibayPrompt({
          title: safeT("admin_comm_promo_reject_prompt"),
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
      emitAdminQueueChanged("trade_promo_pending");
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
              ? safeT("admin_trade_promo_title")
              : safeT("admin_comm_promo_title")}
          </h2>
          <p className="sam-text-helper text-sam-muted">
            {isTrade
              ? t("admin_ads_trade_boosts_go_live_payment")
              : safeT("admin_comm_promo_hint")}
          </p>
          {!isTrade ? (
            <Link
              href="/admin/community/promotions"
              data-community-promo-ops-link="1"
              className="sam-text-helper font-semibold text-signature underline-offset-2 hover:underline"
            >
              {t("admin_ads_open_post_promotions")}
            </Link>
          ) : (
            <Link
              href="/admin/trade/promotions"
              data-trade-promo-ops-link="1"
              className="sam-text-helper font-semibold text-signature underline-offset-2 hover:underline"
            >
              {t("admin_ads_open_trade_boosts")}
            </Link>
          )}
        </div>
        <select
          className="rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 sam-text-helper"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="pending_review">
            {isTrade ? (t("admin_ads_pending_approval")) : t("admin_ads_pending_legacy")}
          </option>
          <option value="rejected">{t("admin_ads_summary_rejected")}</option>
          <option value="">{t("common_all")}</option>
        </select>
      </div>

      {err ? <p className="sam-text-helper text-red-600">{err}</p> : null}
      {loading ? (
        <p className="py-6 text-center sam-text-helper text-sam-muted">…</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center sam-text-helper text-sam-muted">
          {safeT("admin_comm_promo_empty")}
        </p>
      ) : (
        <ul className="divide-y divide-sam-border-soft">
          {rows.map((row) => {
            const busy = busyId === row.id;
            const canAct = isTrade && row.orderStatus === "pending_review";
            // Boost end boundary = inclusive (matches isLiveTradePromotionEntitlement).
            const effective = projectAdsEffectiveLifecycle({
              rawStatus: row.orderStatus,
              startAt: row.startAt ?? null,
              endAt: row.endAt,
              endBoundary: "inclusive",
            });
            const effectiveLabel = adsOpsStatusLabel(effective.effectiveStatus, !en);
            const adminTargetHref = isTrade
              ? `/admin/products/${encodeURIComponent(row.targetId)}`
              : `/admin/community/posts/${encodeURIComponent(row.targetId)}`;
            const publicHref = isTrade
              ? `/post/${encodeURIComponent(row.targetId)}`
              : `/philife/${encodeURIComponent(row.targetId)}`;
            const showPublic = isTrade ? row.listingEligible !== false : Boolean(row.targetId);
            return (
              <li
                key={row.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between"
                data-boost-order-id={row.id}
                data-stored-status={effective.storedStatus}
                data-effective-status={effective.effectiveStatus}
                data-eligible-now={effective.customerEligibleNow ? "1" : "0"}
              >
                <div className="min-w-0 flex-1">
                  <p className="sam-text-body font-medium text-sam-fg truncate">
                    {row.targetTitle || row.targetId}
                  </p>
                  <p className="sam-text-helper text-sam-muted">
                    {row.userNickname || formatAdminShortId(row.userId)} · {row.pointCost.toLocaleString()}P ·{" "}
                    {row.durationDays}d · {row.productId ?? "—"} · {effectiveLabel}
                    {effective.storedStatus.toLowerCase() !== effective.effectiveStatus ? (
                      <>
                        {" "}
                        ({t("admin_ads_stored")}: {effective.storedStatus})
                      </>
                    ) : null}
                    {isTrade && row.listingStatus
                      ? ` · ${row.listingStatus}${row.listingEligible === false ? ` (${t("admin_ads_listing_private")})` : ""}`
                      : ""}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    <Link
                      href={adminTargetHref}
                      className="sam-text-helper font-medium text-signature underline-offset-2 hover:underline"
                    >
                      {isTrade
                        ? safeT("admin_trade_promo_open_admin_listing")
                        : safeT("admin_comm_promo_open_admin_post")}
                    </Link>
                    {showPublic ? (
                      <a
                        href={publicHref}
                        target="_blank"
                        rel="noreferrer"
                        className="sam-text-helper font-medium text-signature underline-offset-2 hover:underline"
                      >
                        {isTrade
                          ? safeT("admin_trade_promo_open_listing")
                          : safeT("admin_comm_promo_open_site_post")}
                      </a>
                    ) : isTrade ? (
                      <p className="sam-text-helper text-sam-muted">
                        {safeT("admin_trade_promo_review_snapshot")}
                      </p>
                    ) : null}
                  </div>
                  {row.reviewReason ? (
                    <p className="sam-text-helper text-sam-muted">{row.reviewReason}</p>
                  ) : null}
                </div>
                {canAct ? (
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-ui-rect bg-signature px-3 py-1.5 sam-text-helper font-semibold text-white disabled:opacity-50"
                      onClick={() => void act(row.id, "approve")}
                    >
                      {t("admin_ads_action_approve")}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-1.5 sam-text-helper font-semibold text-sam-fg disabled:opacity-50"
                      onClick={() => void act(row.id, "reject")}
                    >
                      {t("admin_ads_action_reject")}
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
