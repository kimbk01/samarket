"use client";

/**
 * 거래 운영 기록 (설계 v2 §F-4) — 탭: 운영 기록(관리자 조치) | 찜 기록.
 * URL: tab=favorites · targetType · targetId · actorId · userId · postId · action · from/to(PHT) ·
 *      period(호환 프리셋 · 운영 기록은 all=전체 기간, 없으면 최근 30일) · page · size(20/50/100)
 */
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import Link from "next/link";
import { useState } from "react";
import {
  COMMUNITY_TD,
  CommunityFilterBar,
  CommunityFilterField,
  CommunityListBody,
  CommunityListPagination,
  CommunityListShell,
  CommunitySelect,
  CommunitySummaryCard,
  CommunityTable,
  CommunityTabs,
  CommunityTimeCell,
  useCommunityListQuery,
  useCommunityQueryState,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { useCommunityAdminJson } from "@/components/admin/community/members/use-community-admin-data";
import { AdminTechDetails } from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { AdminFormSheet } from "@/components/admin/AdminFormSheet";
import {
  TradeDefaultPeriodField,
  TradeMemberCell,
  tradeDetailHref,
  tradeListApiParams,
} from "@/components/admin/trade/kit/TradeAdminKit";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import type { MessageKey } from "@/lib/i18n/messages";

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

const OPS_EXTRAS = ["targetType", "targetId", "actorId"] as const;
const FAVORITE_EXTRAS = ["userId", "postId", "action"] as const;

/* ───────── 라벨 (대시보드 「최근 관리자 조치」와 공용) ───────── */

export const TRADE_AUDIT_TARGET_OPTIONS: { value: string; labelKey: MessageKey }[] = [
  { value: "trade_post", labelKey: "admin_trade_audit_target_post" },
  { value: "post", labelKey: "admin_trade_audit_target_post_legacy" },
  { value: "trade_report", labelKey: "common_report" },
  { value: "trade_restriction", labelKey: "admin_trade_members_th_restriction" },
  { value: "trade_promotion_order", labelKey: "admin_trade_audit_target_promotion" },
  { value: "trade_ad_product", labelKey: "admin_trade_audit_target_ad_product" },
  { value: "trade_category", labelKey: "admin_trade_audit_target_category" },
  { value: "trade_settings", labelKey: "admin_trade_audit_target_settings" },
  { value: "transaction_review", labelKey: "admin_trade_audit_target_review" },
  { value: "product_chat", labelKey: "admin_trade_audit_target_chat" },
];
const TARGET_LABEL: Record<string, MessageKey> = Object.fromEntries(TRADE_AUDIT_TARGET_OPTIONS.map((o) => [o.value, o.labelKey]));

export function tradeAuditTargetLabel(t: Translate, targetType: string | null | undefined): string {
  return t(TARGET_LABEL[String(targetType ?? "")] ?? "admin_trade_audit_target_other");
}

const ACTION_LABEL: Record<string, MessageKey> = {
  "trade_post.hide": "admin_trade_audit_act_post_hide",
  "trade_post.unhide": "admin_trade_audit_act_post_unhide",
  "trade_post.delete": "admin_trade_audit_act_post_delete",
  "trade_post.undelete": "admin_trade_audit_act_post_undelete",
  "trade_post.confirm_admin_hidden": "admin_trade_audit_act_post_confirm_hidden",
  "trade_post.edit": "admin_trade_audit_act_post_edit",
  "trade_post.hard_delete": "admin_trade_audit_act_post_hard_delete",
  "trade_post.force_complete": "admin_trade_audit_act_post_force_complete",
  "trade_post.cancel_sale": "admin_trade_post_detail_cancel_sale",
  "trade_report.reject": "admin_trade_audit_act_report_reject",
  "trade_report.hide": "admin_trade_audit_act_report_hide",
  "trade_report.warn": "admin_trade_audit_act_report_warn",
  "trade_report.restrict": "admin_trade_audit_act_report_restrict",
  "trade_restriction.apply_warning": "admin_trade_restrict_badge_warning",
  "trade_restriction.apply_trade_restriction": "admin_trade_members_th_restriction",
  "trade_restriction.revoke": "admin_trade_audit_act_restriction_revoke",
  "trade_promotion_order.request_review": "admin_trade_audit_act_promo_request",
  "trade_promotion_order.approve": "admin_trade_audit_act_promo_approve",
  "trade_promotion_order.reject": "admin_trade_audit_act_promo_reject",
  "trade_promotion_order.pause": "admin_trade_audit_act_promo_pause",
  "trade_promotion_order.resume": "admin_trade_audit_act_promo_resume",
  "trade_promotion_order.end": "admin_trade_audit_act_promo_end",
  "trade_promotion_order.expire": "admin_trade_audit_act_promo_expire",
  "trade_category.create": "admin_trade_audit_act_category_create",
  "trade_category.update": "admin_trade_audit_act_category_update",
  "trade_category.delete": "admin_trade_audit_act_category_delete",
  "trade_category.reorder": "admin_trade_audit_act_category_reorder",
  "trade_settings.update": "admin_trade_audit_act_settings_update",
  "trade_settings.ops_policy_update": "admin_trade_audit_act_ops_policy_update",
  "trade_ad_product.update": "admin_trade_audit_act_ad_product_update",
  "trade_flow.revert": "admin_trade_audit_act_flow_revert",
  "trade_flow.confirm_buyer": "admin_trade_audit_act_flow_confirm_buyer",
  "transaction_review.hide_review": "admin_trade_audit_act_review_hide",
  "transaction_review.restore_review": "admin_trade_audit_act_review_restore",
};

/** 알려진 조치 코드면 문구, 아니면 null (화면은 원래 값을 작게 표시) */
export function tradeAuditActionKnown(t: Translate, action: string | null | undefined): string | null {
  const key = ACTION_LABEL[String(action ?? "")];
  return key ? t(key) : null;
}

export function tradeAuditActionLabel(t: Translate, action: string | null | undefined): string {
  return tradeAuditActionKnown(t, action) ?? t("admin_trade_audit_act_other");
}

function targetHref(targetType: string | null, targetId: string | null, after: Record<string, unknown> | null): string | null {
  const id = String(targetId ?? "");
  switch (targetType) {
    case "trade_post":
    case "post":
      return id ? `/admin/products/${encodeURIComponent(id)}` : null;
    case "trade_report": {
      const postId = typeof after?.post_id === "string" ? after.post_id : null;
      return postId ? `/admin/trade/reports?tab=all&targetId=${encodeURIComponent(postId)}` : "/admin/trade/reports?tab=all";
    }
    case "trade_restriction":
      return "/admin/trade/restrictions";
    case "trade_promotion_order":
      return "/admin/trade/promotions?tab=all";
    default:
      return null;
  }
}

function reasonOf(after: unknown): string | null {
  if (after && typeof after === "object" && !Array.isArray(after)) {
    const r = (after as Record<string, unknown>).reason;
    if (typeof r === "string" && r.trim()) return r.trim();
  }
  return null;
}

/* ───────── 화면 ───────── */

type AuditRow = {
  id: string;
  actor_type: string | null;
  actor_id: string | null;
  actor_label: string | null;
  target_type: string | null;
  target_id: string | null;
  action: string | null;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  created_at: string;
};
type AuditResponse = { ok?: boolean; error?: string; total?: number; rows?: AuditRow[] };

type FavoriteRow = {
  id: string;
  user_id: string | null;
  user_label: string | null;
  post_id: string | null;
  post_title: string | null;
  action: string;
  created_at: string;
};
type FavoriteResponse = { ok?: boolean; error?: string; total?: number; items?: FavoriteRow[] };

export function TradeAuditPage() {
  const q = useCommunityQueryState();
  const tab = q.get("tab") === "favorites" ? "favorites" : "ops";
  return tab === "favorites" ? <FavoritesTab /> : <OpsTab />;
}

function AuditTabs() {
  const { t } = useI18n();
  const q = useCommunityQueryState();
  const tab = q.get("tab") === "favorites" ? "favorites" : "ops";
  return (
    <CommunityTabs
      value={tab}
      // 탭을 바꾸면 다른 탭의 필터는 비운다
      onChange={(v) =>
        q.set({
          tab: v === "favorites" ? "favorites" : null,
          targetType: null,
          targetId: null,
          actorId: null,
          userId: null,
          postId: null,
          action: null,
          period: null,
          from: null,
          to: null,
        })
      }
      tabs={[
        { value: "ops", label: t("admin_trade_audit_title") },
        { value: "favorites", label: t("admin_trade_audit_tab_favorites") },
      ]}
    />
  );
}

function OpsTab() {
  const { t } = useI18n();
  const q = useCommunityListQuery({ extras: OPS_EXTRAS });
  const [detail, setDetail] = useState<AuditRow | null>(null);
  const { targetType, targetId, actorId } = q.query.extras;

  const params = tradeListApiParams(q, { defaultPeriod: "30d" });
  const { state, reload } = useCommunityAdminJson<AuditResponse>(`/api/admin/trade/audit?${params.toString()}`);
  const rows = state.data?.rows ?? [];
  const total = state.status === "ok" ? Number(state.data.total ?? 0) : null;
  const actorName = actorId ? rows.find((r) => r.actor_id === actorId)?.actor_label : null;

  return (
    <CommunityListShell
      title={t("admin_trade_audit_title")}
      description={t("admin_trade_audit_ops_desc")}
      tabs={<AuditTabs />}
      filterBar={
        <CommunityFilterBar lq={q} showSearch={false} pending={state.status === "loading"}>
          <TradeDefaultPeriodField lq={q} />
          <CommunityFilterField label={t("admin_trade_audit_target_type")}>
            <CommunitySelect
              value={targetType}
              onChange={(v) => q.patch({ extras: { targetType: v, targetId: "" } })}
              options={[{ value: "", label: t("common_all") }, ...TRADE_AUDIT_TARGET_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))]}
            />
          </CommunityFilterField>
          {actorId ? (
            <CommunityFilterField label={t("admin_trade_audit_actor")}>
              <span className="flex h-10 items-center gap-2 text-[13px] text-sam-fg">
                {actorName || t("admin_trade_audit_selected_admin")}
                <AdminActionButton variant="quiet" size="sm" className="h-auto! px-1!" onClick={() => q.setExtra("actorId", "")}>
                  {t("admin_trade_filter_clear")}
                </AdminActionButton>
              </span>
            </CommunityFilterField>
          ) : null}
          {targetId ? (
            <CommunityFilterField label={t("admin_trade_audit_target")}>
              <span className="flex h-10 items-center gap-2 text-[13px] text-sam-fg">
                {t("admin_trade_audit_one_target_only")}
                <AdminActionButton variant="quiet" size="sm" className="h-auto! px-1!" onClick={() => q.setExtra("targetId", "")}>
                  {t("admin_trade_filter_clear")}
                </AdminActionButton>
              </span>
            </CommunityFilterField>
          ) : null}
        </CommunityFilterBar>
      }
      footer={<CommunityListPagination lq={q} total={total} disabled={state.status === "loading"} />}
    >
      <CommunityListBody
        state={state}
        empty={rows.length === 0}
        lq={q}
        onRetry={reload}
        emptyMessage={t("admin_trade_audit_ops_empty")}
      >
        <CommunityTable head={[t("admin_trade_audit_th_time_pht"), t("admin_trade_audit_actor"), t("admin_trade_audit_target"), t("admin_trade_audit_th_action"), t("admin_trade_flow_th_reason"), ""]}>
          {rows.map((r) => {
            const href = targetHref(r.target_type, r.target_id, r.after_json);
            const known = tradeAuditActionKnown(t, r.action);
            const actor = r.actor_label || (r.actor_type === "system" ? t("admin_trade_audit_system") : t("admin_trade_confirm_source_admin"));
            return (
              <tr key={r.id} className="border-b border-sam-border-soft">
                <td className={COMMUNITY_TD}>
                  <CommunityTimeCell iso={r.created_at} absolute />
                </td>
                <td className={COMMUNITY_TD}>
                  {r.actor_id && !actorId ? (
                    <AdminActionButton
                      variant="ghost"
                      size="sm"
                      className="!h-auto !px-0 text-left"
                      title={t("admin_trade_audit_filter_actor")}
                      onClick={() => q.setExtra("actorId", r.actor_id ?? "")}
                    >
                      {actor}
                    </AdminActionButton>
                  ) : (
                    actor
                  )}
                </td>
                <td className={COMMUNITY_TD}>
                  {href ? (
                    <Link href={tradeDetailHref(href, q.selfHref)} className="font-medium text-sam-primary hover:underline">
                      {tradeAuditTargetLabel(t, r.target_type)}
                    </Link>
                  ) : (
                    tradeAuditTargetLabel(t, r.target_type)
                  )}
                  {r.target_id && !targetId ? (
                    <AdminActionButton
                      variant="quiet"
                      size="sm"
                      className="!h-auto !px-0 text-left text-[12px] font-normal"
                      onClick={() => q.patch({ extras: { targetType: r.target_type ?? "", targetId: r.target_id ?? "" } })}
                    >
                      {t("admin_trade_audit_this_target_only")}
                    </AdminActionButton>
                  ) : null}
                </td>
                <td className={COMMUNITY_TD}>
                  {known ?? (
                    <>
                      {t("admin_trade_audit_other_action")}
                      <span className="block font-mono sam-text-xxs text-sam-muted">{r.action || "—"}</span>
                    </>
                  )}
                </td>
                <td className={`${COMMUNITY_TD} max-w-[24rem] whitespace-pre-wrap [overflow-wrap:anywhere]`}>
                  {reasonOf(r.after_json) || "—"}
                </td>
                <td className={COMMUNITY_TD}>
                  <AdminActionButton variant="ghost" size="sm" onClick={() => setDetail(r)}>
                    {t("admin_trade_audit_details")}
                  </AdminActionButton>
                </td>
              </tr>
            );
          })}
        </CommunityTable>
      </CommunityListBody>

      {detail ? (
        <AdminFormSheet
          title={t("admin_trade_audit_detail_title")}
          onClose={() => setDetail(null)}
          footer={
            <AdminActionButton variant="secondary" className="w-full" onClick={() => setDetail(null)}>
              {t("admin_trade_close")}
            </AdminActionButton>
          }
        >
          <div className="space-y-3">
            <CommunitySummaryCard
              rows={[
                { label: t("admin_trade_th_time"), value: `${formatAdminManilaDateTime(detail.created_at)} PHT` },
                { label: t("admin_trade_audit_actor"), value: detail.actor_label || (detail.actor_type === "system" ? t("admin_trade_audit_system") : t("admin_trade_confirm_source_admin")) },
                { label: t("admin_trade_audit_target"), value: tradeAuditTargetLabel(t, detail.target_type) },
                { label: t("admin_trade_audit_th_action"), value: tradeAuditActionLabel(t, detail.action) },
                { label: t("admin_trade_flow_th_reason"), value: reasonOf(detail.after_json) || "—" },
              ]}
            />
            <AdminTechDetails ko>
              <p className="mb-1 font-sans font-semibold text-sam-fg">{t("admin_trade_audit_before")}</p>
              <pre className="whitespace-pre-wrap">{JSON.stringify(detail.before_json, null, 2) ?? "—"}</pre>
              <p className="mb-1 mt-2 font-sans font-semibold text-sam-fg">{t("admin_trade_audit_after")}</p>
              <pre className="whitespace-pre-wrap">{JSON.stringify(detail.after_json, null, 2) ?? "—"}</pre>
              <p className="mt-2">
                {detail.action ?? "—"} · {detail.target_type ?? "—"} / {detail.target_id ?? "—"} · actor {detail.actor_id ?? "—"}
              </p>
            </AdminTechDetails>
          </div>
        </AdminFormSheet>
      ) : null}
    </CommunityListShell>
  );
}

const FAVORITE_ACTIONS: { value: string; labelKey: MessageKey }[] = [
  { value: "", labelKey: "common_all" },
  { value: "add", labelKey: "admin_trade_audit_fav_added" },
  { value: "remove", labelKey: "admin_trade_audit_fav_removed" },
];

function FavoritesTab() {
  const { t } = useI18n();
  const q = useCommunityListQuery({ extras: FAVORITE_EXTRAS });
  const { userId, postId, action } = q.query.extras;

  const { state, reload } = useCommunityAdminJson<FavoriteResponse>(`/api/admin/favorite-audit?${q.apiParams().toString()}`);
  const rows = state.data?.items ?? [];
  const total = state.status === "ok" ? Number(state.data.total ?? 0) : null;
  const memberName = userId ? rows.find((r) => r.user_id === userId)?.user_label : null;
  const postName = postId ? rows.find((r) => r.post_id === postId)?.post_title : null;

  return (
    <CommunityListShell
      title={t("admin_trade_audit_title")}
      description={t("admin_trade_audit_fav_desc")}
      tabs={<AuditTabs />}
      filterBar={
        <CommunityFilterBar lq={q} showSearch={false} pending={state.status === "loading"}>
          <CommunityFilterField label={t("admin_trade_post_ads_th_action")}>
            <CommunitySelect value={action} onChange={(v) => q.setExtra("action", v)} options={FAVORITE_ACTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))} />
          </CommunityFilterField>
          {userId ? (
            <CommunityFilterField label={t("admin_trade_points_member")}>
              <span className="flex h-10 items-center gap-2 text-[13px] text-sam-fg">
                {memberName || t("admin_trade_audit_selected_member")}
                <AdminActionButton variant="quiet" size="sm" className="h-auto! px-1!" onClick={() => q.setExtra("userId", "")}>
                  {t("admin_trade_filter_clear")}
                </AdminActionButton>
              </span>
            </CommunityFilterField>
          ) : null}
          {postId ? (
            <CommunityFilterField label={t("admin_trade_audit_post")}>
              <span className="flex h-10 items-center gap-2 text-[13px] text-sam-fg">
                {postName || t("admin_trade_audit_selected_post")}
                <AdminActionButton variant="quiet" size="sm" className="h-auto! px-1!" onClick={() => q.setExtra("postId", "")}>
                  {t("admin_trade_filter_clear")}
                </AdminActionButton>
              </span>
            </CommunityFilterField>
          ) : null}
        </CommunityFilterBar>
      }
      footer={<CommunityListPagination lq={q} total={total} disabled={state.status === "loading"} />}
    >
      <CommunityListBody state={state} empty={rows.length === 0} lq={q} onRetry={reload} emptyMessage={t("admin_trade_audit_fav_empty")}>
        <CommunityTable head={[t("admin_trade_audit_th_time_pht"), t("admin_trade_points_member"), t("admin_trade_audit_post"), t("admin_trade_post_ads_th_action")]}>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-sam-border-soft">
              <td className={COMMUNITY_TD}>
                <CommunityTimeCell iso={r.created_at} absolute />
              </td>
              <td className={COMMUNITY_TD}>
                <TradeMemberCell userId={r.user_id} label={r.user_label} returnTo={q.selfHref} />
                {r.user_id && !userId ? (
                  <AdminActionButton
                    variant="quiet"
                    size="sm"
                    className="!h-auto !px-0 text-left text-[12px] font-normal"
                    onClick={() => q.setExtra("userId", r.user_id ?? "")}
                  >
                    {t("admin_trade_this_member_only")}
                  </AdminActionButton>
                ) : null}
              </td>
              <td className={`${COMMUNITY_TD} max-w-[22rem]`}>
                {r.post_id ? (
                  <Link
                    href={tradeDetailHref(`/admin/products/${encodeURIComponent(r.post_id)}`, q.selfHref)}
                    className="font-medium text-sam-primary hover:underline [overflow-wrap:anywhere]"
                  >
                    {r.post_title || t("admin_trade_audit_post_missing")}
                  </Link>
                ) : (
                  "—"
                )}
                {r.post_id && !postId ? (
                  <AdminActionButton
                    variant="quiet"
                    size="sm"
                    className="!h-auto !px-0 text-left text-[12px] font-normal"
                    onClick={() => q.setExtra("postId", r.post_id ?? "")}
                  >
                    {t("admin_trade_this_post_only")}
                  </AdminActionButton>
                ) : null}
              </td>
              <td className={COMMUNITY_TD}>
                {r.action === "add" ? (
                  <AdminToneBadge tone="success">{t("admin_trade_audit_fav_added")}</AdminToneBadge>
                ) : r.action === "remove" ? (
                  <AdminToneBadge tone="neutral">{t("admin_trade_audit_fav_removed")}</AdminToneBadge>
                ) : (
                  <span className="font-mono sam-text-xxs text-sam-muted">{r.action || "—"}</span>
                )}
              </td>
            </tr>
          ))}
        </CommunityTable>
      </CommunityListBody>
    </CommunityListShell>
  );
}
