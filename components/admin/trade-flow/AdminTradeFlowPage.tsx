"use client";

import { dibayConfirm } from "@/components/ui/dibay-overlay";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { resolveAdminHttpErrorMessage } from "@/lib/admin/resolve-admin-http-error";
import { logAdminMutation } from "@/lib/admin/admin-perf-logger";
import Link from "next/link";
import { tradeChatNotificationHref } from "@/lib/chats/trade-chat-notification-href";
import {
  adminTradeFlowDeepLinkActive,
  matchAdminTradeFlowSessionToDeepLink,
  parseAdminTradeFlowDeepLink,
} from "@/lib/admin-products/admin-trade-deep-link";
import { AdminTradeCompletionPage } from "@/components/admin/chats/AdminTradeCompletionPage";
import {
  ConsoleButton,
  SectionHeader,
  TabStrip,
} from "@/components/admin/trade-console/trade-console-ui";
import { useRouter } from "next/navigation";

interface SessionRow {
  id: string;
  post_id: string;
  postTitle?: string;
  postStatus?: string;
  sellerListingState?: string | null;
  seller_id: string;
  buyer_id: string;
  trade_flow_status: string;
  chat_mode: string;
  seller_completed_at: string | null;
  buyer_confirmed_at: string | null;
  last_message_preview?: string;
  hasBuyerReview?: boolean;
}

interface RepRow {
  id: string;
  user_id: string;
  source_type: string;
  delta: number;
  status: string;
  reason: string | null;
  created_at: string;
}

interface ReviewRow {
  id: string;
  product_id: string;
  product_title?: string;
  room_id: string | null;
  reviewer_id: string;
  reviewee_id: string;
  reviewer_nickname?: string;
  reviewee_nickname?: string;
  role_type: string;
  public_review_type: string;
  positive_tag_keys: string[] | null;
  negative_tag_keys: string[] | null;
  positive_tag_labels?: string;
  negative_tag_labels?: string;
  review_comment: string | null;
  is_anonymous_negative?: boolean | null;
  created_at: string;
}

export function AdminTradeFlowPage() {
  const { t, safeT } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const panel = searchParams.get("panel") === "complete" ? "complete" : "flow";
  const deepLink = useMemo(() => parseAdminTradeFlowDeepLink(searchParams), [searchParams]);
  const deepLinkActive = adminTradeFlowDeepLinkActive(deepLink);
  const reviewRoleLabels = useMemo(
    () => ({
      buyer_to_seller: t("admin_trade_flow_review_role_buyer_seller"),
      seller_to_buyer: t("admin_trade_flow_review_role_seller_buyer"),
    }),
    [t]
  );
  const publicReviewLabels = useMemo(
    () => ({
      good: t("admin_trade_flow_review_good"),
      normal: t("admin_trade_flow_review_normal"),
      bad: t("admin_trade_flow_review_bad"),
    }),
    [t]
  );

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [logs, setLogs] = useState<RepRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revertingId, setRevertingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/trade-flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(resolveAdminHttpErrorMessage(res, data, t, "admin_trade_completion_fetch_failed"));
        setSessions([]);
        setLogs([]);
        setReviews([]);
        return;
      }
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
      setLogs(Array.isArray(data.reputationLogs) ? data.reputationLogs : []);
      setReviews(Array.isArray(data.transactionReviews) ? data.transactionReviews : []);
    } catch {
      setError(t("common_network_error"));
      setSessions([]);
      setLogs([]);
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleSessions = useMemo(
    () => (deepLinkActive ? matchAdminTradeFlowSessionToDeepLink(sessions, deepLink) : sessions),
    [deepLinkActive, deepLink, sessions]
  );
  const focusedSession = deepLinkActive ? visibleSessions[0] ?? null : null;

  const revertTrade = useCallback(
    async (roomId: string) => {
      if (
        !(await dibayConfirm({ title: t("admin_trade_flow_revert_confirm") }))
      ) {
        return;
      }
      setRevertingId(roomId);
      setError(null);
      logAdminMutation("trade-flow:revert", "start", { roomId });
      try {
        const res = await fetch("/api/admin/trade-flow/revert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          logAdminMutation("trade-flow:revert", "fail", { roomId, status: res.status });
          setError(resolveAdminHttpErrorMessage(res, data, t, "admin_trade_flow_revert_failed"));
          return;
        }
        logAdminMutation("trade-flow:revert", "success", { roomId });
        await load();
      } catch {
        logAdminMutation("trade-flow:revert", "fail", { roomId });
        setError(t("common_network_error"));
      } finally {
        setRevertingId(null);
      }
    },
    [load, t]
  );

  return (
    <div className="space-y-3" data-admin>
      <SectionHeader
        title={safeT("admin_trade_operations_title", {
          fallbackKo: "거래 운영",
          fallbackEn: "Trade operations",
        })}
        description={safeT("admin_trade_operations_desc", {
          fallbackKo: "trade-flow + trade-complete — product_chats / chat_rooms authority 유지.",
          fallbackEn: "trade-flow + trade-complete — keep product_chats / chat_rooms authority.",
        })}
        actions={
          <ConsoleButton variant="secondary" onClick={() => void load()} disabled={loading}>
            {safeT("admin_posts_mgmt_refresh", {
              fallbackKo: "새로고침",
              fallbackEn: "Refresh",
            })}
          </ConsoleButton>
        }
      />

      <TabStrip
        tabs={[
          {
            id: "flow",
            label: safeT("admin_trade_ops_tab_flow", {
              fallbackKo: "거래 세션",
              fallbackEn: "Sessions",
            }),
            count: loading ? null : visibleSessions.length,
          },
          {
            id: "complete",
            label: safeT("admin_trade_ops_tab_complete", {
              fallbackKo: "구매자 확인",
              fallbackEn: "Buyer confirm",
            }),
            count: null,
            disconnected: true,
          },
        ]}
        active={panel}
        onChange={(id) => {
          const q = new URLSearchParams(searchParams.toString());
          if (id === "complete") q.set("panel", "complete");
          else q.delete("panel");
          const qs = q.toString();
          router.replace(qs ? `/admin/trade-flow?${qs}` : "/admin/trade-flow");
        }}
      />

      {panel === "complete" ? (
        <AdminTradeCompletionPage embedded />
      ) : (
        <>
      {deepLinkActive && focusedSession ? (
        <div
          data-testid="admin-trade-flow-deep-link-focus"
          className="rounded-ui-rect border border-signature/30 bg-signature/5 px-3 py-2 sam-text-body-secondary text-sam-fg"
        >
          {t("admin_trade_deep_link_flow_focus", {
            post: focusedSession.postTitle || focusedSession.post_id,
            status: focusedSession.postStatus ?? "—",
            listing: focusedSession.sellerListingState ?? "—",
            flow: focusedSession.trade_flow_status,
            seller: focusedSession.seller_id.slice(0, 8) + "…",
            buyer: focusedSession.buyer_id.slice(0, 8) + "…",
          })}
        </div>
      ) : null}
      {deepLinkActive && !loading && !focusedSession ? (
        <div className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 sam-text-body text-amber-900">
          {safeT("admin_trade_deep_link_no_match", {
            fallbackKo: "딥링크 조건에 맞는 거래가 목록에 없습니다.",
            fallbackEn: "No trade in this list matches the deep link.",
          })}
        </div>
      ) : null}
      {error && (
        <div className="rounded-ui-rect border border-amber-200 bg-amber-50 px-4 py-3 sam-text-body text-amber-900">
          {error}
        </div>
      )}
      {loading ? (
        <p className="sam-text-body text-sam-muted">{t("common_loading")}</p>
      ) : (
        <>
          <section className="rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
            <h2 className="border-b border-sam-border-soft px-4 py-3 sam-text-body font-semibold text-sam-fg">
              {t("admin_trade_flow_sessions_title")}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] border-collapse sam-text-body-secondary">
                <thead>
                  <tr className="border-b border-sam-border-soft bg-sam-app text-left text-sam-muted">
                    <th className="px-3 py-2 font-medium">{t("admin_trade_completion_chat")}</th>
                    <th className="px-3 py-2 font-medium">{t("admin_trade_completion_post")}</th>
                    <th className="px-3 py-2 font-medium">{t("admin_trade_flow_th_post_status")}</th>
                    <th className="px-3 py-2 font-medium">{t("admin_trade_flow_th_seller_listing")}</th>
                    <th className="px-3 py-2 font-medium">{t("admin_trade_flow_th_trade_flow")}</th>
                    <th className="px-3 py-2 font-medium">{t("admin_trade_flow_th_buyer_review")}</th>
                    <th className="px-3 py-2 font-medium">{t("admin_trade_flow_th_chat_mode")}</th>
                    <th className="px-3 py-2 font-medium">{t("admin_trade_flow_th_seller_completed")}</th>
                    <th className="px-3 py-2 font-medium">{t("admin_trade_flow_th_buyer_confirmed")}</th>
                    <th className="px-3 py-2 font-medium">{t("admin_trade_completion_manage")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSessions.map((s) => (
                    <tr
                      key={s.id}
                      data-focused-flow={focusedSession?.id === s.id ? "1" : undefined}
                      className={`border-b border-sam-border-soft hover:bg-sam-app/80 ${
                        focusedSession?.id === s.id
                          ? "bg-signature/10 ring-1 ring-inset ring-signature/40"
                          : ""
                      }`}
                    >
                      <td className="px-3 py-2 font-mono sam-text-helper">
                        <Link href={tradeChatNotificationHref(s.id, "product_chat")} className="text-signature hover:underline" target="_blank">
                          {s.id.slice(0, 8)}…
                        </Link>
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-2 text-sam-fg" title={s.postTitle}>
                        {s.postTitle ?? s.post_id}
                      </td>
                      <td className="px-3 py-2 text-sam-fg">{s.postStatus ?? "—"}</td>
                      <td className="max-w-[100px] truncate px-3 py-2 text-sam-fg" title={s.sellerListingState ?? ""}>
                        {s.sellerListingState ?? "—"}
                      </td>
                      <td className="px-3 py-2">{s.trade_flow_status}</td>
                      <td className="px-3 py-2">{s.hasBuyerReview ? "Y" : "N"}</td>
                      <td className="px-3 py-2">{s.chat_mode}</td>
                      <td className="px-3 py-2 text-sam-muted">
                        {s.seller_completed_at
                          ? new Date(s.seller_completed_at).toLocaleString("ko-KR")
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-sam-muted">
                        {s.buyer_confirmed_at
                          ? new Date(s.buyer_confirmed_at).toLocaleString("ko-KR")
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {s.trade_flow_status !== "chatting" ? (
                          <button
                            type="button"
                            disabled={revertingId === s.id}
                            onClick={() => void revertTrade(s.id)}
                            className="rounded border border-amber-300 bg-amber-50 px-2 py-1 sam-text-xxs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                          >
                            {revertingId === s.id ? t("admin_trade_flow_processing") : t("admin_trade_flow_revert_trade")}
                          </button>
                        ) : (
                          <span className="text-sam-meta">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visibleSessions.length === 0 && (
                <p className="px-4 py-8 text-center sam-text-body text-sam-muted">{t("admin_trade_flow_no_data")}</p>
              )}
            </div>
          </section>

          <section className="rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
            <h2 className="flex flex-wrap items-baseline gap-x-2 border-b border-sam-border-soft px-4 py-3 sam-text-body font-semibold text-sam-fg">
              {t("admin_trade_flow_reviews_title")}
              <Link href="/admin/reviews" className="sam-text-body-secondary font-normal text-signature hover:underline">
                {t("admin_trade_flow_reviews_all_link")}
              </Link>
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] border-collapse sam-text-body-secondary">
                <thead>
                  <tr className="border-b border-sam-border-soft bg-sam-app text-left text-sam-muted">
                    <th className="px-3 py-2 font-medium">{t("admin_trade_th_time")}</th>
                    <th className="px-3 py-2 font-medium">{t("admin_users_label_role")}</th>
                    <th className="px-3 py-2 font-medium">{t("admin_trade_flow_th_public")}</th>
                    <th className="px-3 py-2 font-medium">{t("admin_trade_flow_th_author_target")}</th>
                    <th className="px-3 py-2 font-medium">{t("admin_trade_flow_th_positive_tags")}</th>
                    <th className="px-3 py-2 font-medium">{t("admin_trade_flow_th_negative_tags")}</th>
                    <th className="px-3 py-2 font-medium">{t("admin_trade_flow_th_comment")}</th>
                    <th className="px-3 py-2 font-medium">{t("admin_trade_flow_th_product_chat_detail")}</th>
                  </tr>
                </thead>
                <tbody>
                  {reviews.map((rv) => (
                    <tr key={rv.id} className="border-b border-sam-border-soft">
                      <td className="whitespace-nowrap px-3 py-2 text-sam-muted">
                        {rv.created_at ? new Date(rv.created_at).toLocaleString("ko-KR") : "—"}
                      </td>
                      <td className="px-3 py-2">{reviewRoleLabels[rv.role_type as keyof typeof reviewRoleLabels] ?? rv.role_type}</td>
                      <td className="px-3 py-2">
                        {publicReviewLabels[rv.public_review_type as keyof typeof publicReviewLabels] ??
                          rv.public_review_type}
                      </td>
                      <td className="max-w-[160px] truncate px-3 py-2 text-sam-fg" title={`${rv.reviewer_nickname ?? ""} → ${rv.reviewee_nickname ?? ""}`}>
                        {rv.reviewer_nickname ?? rv.reviewer_id.slice(0, 8) + "…"} →{" "}
                        {rv.reviewee_nickname ?? rv.reviewee_id.slice(0, 8) + "…"}
                      </td>
                      <td className="max-w-[160px] truncate px-3 py-2 text-sam-fg" title={rv.positive_tag_labels ?? ""}>
                        {rv.positive_tag_labels ?? ((rv.positive_tag_keys ?? []).join(", ") || "—")}
                      </td>
                      <td className="max-w-[160px] truncate px-3 py-2 text-sam-fg" title={rv.negative_tag_labels ?? ""}>
                        {rv.negative_tag_labels ?? ((rv.negative_tag_keys ?? []).join(", ") || "—")}
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-2 text-sam-muted" title={rv.review_comment ?? ""}>
                        {rv.review_comment ?? "—"}
                      </td>
                      <td className="px-3 py-2 sam-text-helper text-sam-fg">
                        <span className="block max-w-[140px] truncate font-medium text-sam-fg" title={rv.product_title ?? rv.product_id}>
                          {rv.product_title ?? rv.product_id.slice(0, 8) + "…"}
                        </span>
                        <span className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                          {rv.room_id ? (
                            <Link href={tradeChatNotificationHref(rv.room_id, "product_chat")} className="text-signature hover:underline" target="_blank">
                              {t("admin_trade_flow_chat_link")}
                            </Link>
                          ) : (
                            <span className="text-sam-meta">{t("admin_trade_flow_chat_none")}</span>
                          )}
                          <Link href={`/admin/reviews/${rv.id}`} className="text-signature hover:underline">
                            {t("admin_trade_flow_admin_detail")}
                          </Link>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {reviews.length === 0 && (
                <p className="px-4 py-8 text-center sam-text-body text-sam-muted">{t("admin_trade_flow_no_reviews")}</p>
              )}
            </div>
          </section>

          <section className="rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
            <h2 className="border-b border-sam-border-soft px-4 py-3 sam-text-body font-semibold text-sam-fg">
              {t("admin_trade_flow_rep_logs_title")}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse sam-text-body-secondary">
                <thead>
                  <tr className="border-b border-sam-border-soft bg-sam-app text-left text-sam-muted">
                    <th className="px-3 py-2 font-medium">{t("admin_trade_th_time")}</th>
                    <th className="px-3 py-2 font-medium">{t("admin_report_target_user")}</th>
                    <th className="px-3 py-2 font-medium">{t("admin_chat_type_label")}</th>
                    <th className="px-3 py-2 font-medium">Δ</th>
                    <th className="px-3 py-2 font-medium">{t("admin_trade_completion_status")}</th>
                    <th className="px-3 py-2 font-medium">{t("admin_trade_flow_th_reason")}</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id} className="border-b border-sam-border-soft">
                      <td className="whitespace-nowrap px-3 py-2 text-sam-muted">
                        {new Date(l.created_at).toLocaleString("ko-KR")}
                      </td>
                      <td className="px-3 py-2 font-mono sam-text-xxs">{l.user_id.slice(0, 8)}…</td>
                      <td className="px-3 py-2">{l.source_type}</td>
                      <td className="px-3 py-2">{l.delta}</td>
                      <td className="px-3 py-2">{l.status}</td>
                      <td className="max-w-[200px] truncate px-3 py-2 text-sam-muted" title={l.reason ?? ""}>
                        {l.reason ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {logs.length === 0 && (
                <p className="px-4 py-8 text-center sam-text-body text-sam-muted">{t("admin_trade_flow_no_logs")}</p>
              )}
            </div>
          </section>
        </>
      )}
        </>
      )}
    </div>
  );
}
