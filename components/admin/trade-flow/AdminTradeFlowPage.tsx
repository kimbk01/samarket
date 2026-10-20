"use client";

import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { resolveAdminHttpErrorMessage } from "@/lib/admin/resolve-admin-http-error";
import { logAdminMutation } from "@/lib/admin/admin-perf-logger";
import Link from "next/link";
import { formatAdminDateTime } from "@/components/admin/i18n/admin-date-locale";
import { withAdminReturnTo } from "@/lib/admin/admin-operation-return-context";
import type { MessageKey } from "@/lib/i18n/messages";
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
import { AdminTechId, formatAdminShortIdEllipsis } from "@/components/admin/ui/AdminTechId";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminEmptyState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";

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

const TRADE_FLOW_STATUS_KEYS: Record<string, MessageKey> = {
  chatting: "admin_trade_flow_status_chatting",
  seller_marked_done: "admin_trade_flow_status_seller_marked_done",
  buyer_confirmed: "admin_trade_flow_status_buyer_confirmed",
  review_pending: "admin_trade_flow_status_review_pending",
  review_completed: "admin_trade_flow_status_review_completed",
  dispute: "admin_trade_flow_status_dispute",
  cancelled: "admin_trade_flow_status_cancelled",
  archived: "admin_trade_flow_status_archived",
};
const POST_STATUS_KEYS: Record<string, MessageKey> = {
  active: "admin_trade_post_status_active",
  reserved: "admin_trade_post_status_reserved",
  sold: "admin_trade_post_status_sold",
  hidden: "admin_trade_post_status_hidden",
};
const LISTING_STATE_KEYS: Record<string, MessageKey> = {
  inquiry: "admin_trade_listing_inquiry",
  negotiating: "admin_trade_listing_negotiating",
  reserved: "admin_trade_listing_reserved",
  completed: "admin_trade_listing_completed",
};
const REP_SOURCE_KEYS: Record<string, MessageKey> = {
  trade_complete: "admin_trade_rep_source_trade_complete",
  review: "admin_trade_rep_source_review",
  admin_adjust: "admin_trade_rep_source_admin_adjust",
  dispute_hold: "admin_trade_rep_source_dispute_hold",
  report: "admin_trade_rep_source_report",
};
const REP_STATUS_KEYS: Record<string, MessageKey> = {
  applied: "admin_trade_rep_status_applied",
  held: "admin_trade_rep_status_held",
};
const TRADE_CHAT_MODE_KEYS: Record<string, MessageKey> = {
  open: "admin_trade_chat_mode_open",
  limited: "admin_trade_chat_mode_limited",
  readonly: "admin_trade_chat_mode_readonly",
};

export function AdminTradeFlowPage() {
  const { t, safeT, language } = useI18n();
  const tradeFlowStatusLabel = (v: string | null | undefined) => {
    const key = TRADE_FLOW_STATUS_KEYS[String(v ?? "")];
    return key ? t(key) : v ? t("admin_trade_label_unknown") : "—";
  };
  /** 등록되지 않은 값은 「알 수 없음」 — 원시 값은 화면 1차 정보로 쓰지 않는다 (상태 라벨 레지스트리 규칙). */
  const labelOf = (map: Record<string, MessageKey>, v: string | null | undefined) => {
    const raw = String(v ?? "").trim();
    if (!raw) return "—";
    const key = map[raw];
    return key ? t(key) : t("admin_trade_label_unknown");
  };
  const tradeChatModeLabel = (v: string | null | undefined) => {
    const key = TRADE_CHAT_MODE_KEYS[String(v ?? "")];
    return key ? t(key) : v ? t("admin_trade_label_unknown") : "—";
  };
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
      const confirmed = await confirmAdminAction({
        level: adminActionLevel("reject"),
        ko: language !== "en",
        title: t("admin_trade_flow_revert_confirm"),
        confirmLabel: t("admin_trade_flow_revert_trade"),
        destructive: true,
      });
      if (!confirmed.ok) return;
      const reason = confirmed.reason ?? "";
      setRevertingId(roomId);
      setError(null);
      logAdminMutation("trade-flow:revert", "start", { roomId });
      try {
        const res = await fetch("/api/admin/trade-flow/revert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId, reason }),
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
          fallbackKo: "거래 진행 단계·구매자 확인·후기·신뢰 기록을 봅니다.",
          fallbackEn: "Trade stages, buyer confirmation, reviews and trust records.",
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
            status: labelOf(POST_STATUS_KEYS, focusedSession.postStatus),
            listing: labelOf(LISTING_STATE_KEYS, focusedSession.sellerListingState),
            flow: tradeFlowStatusLabel(focusedSession.trade_flow_status),
            seller: formatAdminShortIdEllipsis(focusedSession.seller_id),
            buyer: formatAdminShortIdEllipsis(focusedSession.buyer_id),
          })}
        </div>
      ) : null}
      {deepLinkActive && !loading && !focusedSession ? (
        <div className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-3 py-2 sam-text-body text-sam-fg">
          {safeT("admin_trade_deep_link_no_match", {
            fallbackKo: "딥링크 조건에 맞는 거래가 목록에 없습니다.",
            fallbackEn: "No trade in this list matches the deep link.",
          })}
        </div>
      ) : null}
      {error && (
        <div role="alert" className="rounded-ui-rect border border-sam-danger bg-sam-danger-soft px-4 py-3 sam-text-body text-sam-fg">
          {error}
        </div>
      )}
      {loading ? (
        <AdminLoadingState ko={language !== "en"} label={t("common_loading")} />
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
                        <div className="flex flex-col gap-0.5">
                          {/* 설계 §8·§10: Admin 방 상세로 (사용자 앱 방은 열지 않는다 — 레거시 상세가 CM 방 상세로 보낸다) */}
                          <Link
                            href={withAdminReturnTo(`/admin/chats/${encodeURIComponent(s.id)}`, "/admin/trade-flow")}
                            className="text-signature hover:underline"
                          >
                            {formatAdminShortIdEllipsis(s.id)}
                          </Link>
                        </div>
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-2 text-sam-fg" title={s.postTitle}>
                        <Link
                          href={`/admin/products/${encodeURIComponent(s.post_id)}`}
                          className="text-signature hover:underline"
                        >
                          {s.postTitle ?? s.post_id}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-sam-fg">{labelOf(POST_STATUS_KEYS, s.postStatus)}</td>
                      <td className="max-w-[100px] truncate px-3 py-2 text-sam-fg">
                        {labelOf(LISTING_STATE_KEYS, s.sellerListingState)}
                      </td>
                      <td className="px-3 py-2">{tradeFlowStatusLabel(s.trade_flow_status)}</td>
                      <td className="px-3 py-2">{s.hasBuyerReview ? (language !== "en" ? "있음" : "Yes") : (language !== "en" ? "없음" : "No")}</td>
                      <td className="px-3 py-2">{tradeChatModeLabel(s.chat_mode)}</td>
                      <td className="px-3 py-2 text-sam-muted">
                        {s.seller_completed_at
                          ? formatAdminDateTime(s.seller_completed_at, language)
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-sam-muted">
                        {s.buyer_confirmed_at
                          ? formatAdminDateTime(s.buyer_confirmed_at, language)
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {s.trade_flow_status !== "chatting" ? (
                          <AdminActionButton
                            variant="ghost"
                            size="sm"
                            disabled={revertingId === s.id}
                            onClick={() => void revertTrade(s.id)}
                          >
                            {t("admin_trade_flow_revert_trade")}
                          </AdminActionButton>
                        ) : (
                          <span className="text-sam-meta">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visibleSessions.length === 0 && (
                <AdminEmptyState ko={language !== "en"} message={t("admin_trade_flow_no_data")} />
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
                        {rv.created_at ? formatAdminDateTime(rv.created_at, language) : "—"}
                      </td>
                      <td className="px-3 py-2">{reviewRoleLabels[rv.role_type as keyof typeof reviewRoleLabels] ?? rv.role_type}</td>
                      <td className="px-3 py-2">
                        {publicReviewLabels[rv.public_review_type as keyof typeof publicReviewLabels] ??
                          rv.public_review_type}
                      </td>
                      <td className="max-w-[160px] truncate px-3 py-2 text-sam-fg" title={`${rv.reviewer_nickname ?? ""} → ${rv.reviewee_nickname ?? ""}`}>
                        {rv.reviewer_nickname ?? formatAdminShortIdEllipsis(rv.reviewer_id)} →{" "}
                        {rv.reviewee_nickname ?? formatAdminShortIdEllipsis(rv.reviewee_id)}
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
                          {rv.product_title ?? formatAdminShortIdEllipsis(rv.product_id)}
                        </span>
                        <span className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                          {rv.room_id ? (
                            <Link href={withAdminReturnTo(`/admin/chats/${encodeURIComponent(rv.room_id)}`, "/admin/trade-flow")} className="text-signature hover:underline">
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
                        {formatAdminDateTime(l.created_at, language)}
                      </td>
                      <td className="px-3 py-2 font-mono sam-text-xxs"><AdminTechId id={l.user_id} /></td>
                      <td className="px-3 py-2">{labelOf(REP_SOURCE_KEYS, l.source_type)}</td>
                      <td className="px-3 py-2">{l.delta}</td>
                      <td className="px-3 py-2">{labelOf(REP_STATUS_KEYS, l.status)}</td>
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
