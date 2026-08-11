"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  memberRoleBadgeClass,
  statusBadgeClass,
  statusCategoryForDetailUser,
} from "@/components/admin/users/admin-user-lite-display";
import {
  adminMembershipRoleFromRow,
  resolveAdminMemberRoleBadges,
  type AdminMemberRoleBadge,
} from "@/lib/admin-users/member-role-badges";
import type { MemberOverviewAggregates, OverviewMetric } from "@/lib/admin-users/member-overview-aggregates";
import type { ChatDomain } from "@/lib/chat-domain/four-domain-freeze";
import type {
  AdminPersonMembershipRow,
  AdminPersonStoreRow,
  AdminUserDetailPayload,
} from "@/components/admin/users/AdminTestUserDetail";
import { ADMIN_USERS_LITE_CARD } from "@/lib/ui/admin-users-lite-styles";
import type { MessageKey } from "@/lib/i18n/messages";

const ROLE_BADGE_LABEL_KEYS: Record<AdminMemberRoleBadge, MessageKey> = {
  member: "admin_users_role_badge_member",
  store_owner: "admin_users_role_badge_store_owner",
  admin: "admin_users_lite_role_admin",
  super_admin: "admin_users_lite_role_super_admin",
};

const STATUS_LABEL_KEYS = {
  active: "admin_users_lite_status_active",
  needs_review: "admin_users_lite_status_needs_review",
  suspended: "admin_users_lite_status_suspended",
  deleted: "admin_users_lite_status_deleted",
} as const;

const CHAT_LABEL_KEYS: Record<ChatDomain, MessageKey> = {
  general_direct: "admin_users_cc_chat_general_direct",
  group: "admin_users_cc_chat_group",
  trade: "admin_users_cc_chat_trade",
  store_order: "admin_users_cc_chat_store_order",
};

function MetricValue({
  metric,
  format,
}: {
  metric: OverviewMetric<number | string | null> | { ok: false; unavailable: true };
  format?: (value: number | string | null) => string;
}) {
  const { safeT } = useI18n();
  if ("unavailable" in metric && metric.unavailable) {
    return (
      <span className="text-sm font-semibold text-[#98a2b3]">
        {safeT("admin_users_cc_metric_unavailable", {
          fallbackKo: "권한 없음",
          fallbackEn: "Not available",
        })}
      </span>
    );
  }
  if (!metric.ok) {
    return (
      <span className="text-sm font-semibold text-[#b42318]">
        {safeT("admin_users_cc_metric_error", {
          fallbackKo: "불러오지 못함",
          fallbackEn: "Load error",
        })}
      </span>
    );
  }
  if (metric.value == null || metric.value === "") {
    return (
      <span className="text-sm font-semibold text-[#98a2b3]">
        {safeT("admin_users_empty_placeholder", { fallbackKo: "—", fallbackEn: "—" })}
      </span>
    );
  }
  const text = format ? format(metric.value) : String(metric.value);
  return <span className="text-sm font-bold tabular-nums text-[#101828]">{text}</span>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={`${ADMIN_USERS_LITE_CARD} p-4`}>
      <h3 className="text-xs font-bold uppercase tracking-wide text-[#667085]">{title}</h3>
      <dl className="mt-3 space-y-2">{children}</dl>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-sm text-[#667085]">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function AdminMemberOverviewPanel({
  user,
  stores,
  adminMembership,
}: {
  user: AdminUserDetailPayload;
  stores: AdminPersonStoreRow[];
  adminMembership: AdminPersonMembershipRow | null;
}) {
  const { t, safeT, language } = useI18n();
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "ok"; overview: MemberOverviewAggregates }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    (async () => {
      try {
        const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/overview`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          overview?: MemberOverviewAggregates;
        };
        if (cancelled) return;
        if (!res.ok || !data.ok || !data.overview) {
          setState({ kind: "error" });
          return;
        }
        setState({ kind: "ok", overview: data.overview });
      } catch {
        if (!cancelled) setState({ kind: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const roleBadges = resolveAdminMemberRoleBadges({
    hasStoreOwnership: stores.length > 0,
    adminMembershipRole: adminMembershipRoleFromRow(adminMembership?.role),
  });
  const statusCategory = statusCategoryForDetailUser(user);
  const fmtTime = (value: number | string | null) => {
    if (value == null || value === "") return "—";
    const time = new Date(String(value)).getTime();
    if (!Number.isFinite(time)) return "—";
    return new Date(time).toLocaleString(language === "en" ? "en-US" : "ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-3">
      <Section title={t("admin_users_cc_overview_account")}>
        <Row label={t("admin_users_lite_col_status")}>
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(statusCategory)}`}>
            {t(STATUS_LABEL_KEYS[statusCategory])}
          </span>
        </Row>
        <Row label={t("admin_users_lite_col_role")}>
          <span className="inline-flex flex-wrap justify-end gap-1">
            {roleBadges.map((badge) => (
              <span
                key={badge}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${memberRoleBadgeClass(badge)}`}
              >
                {t(ROLE_BADGE_LABEL_KEYS[badge])}
              </span>
            ))}
          </span>
        </Row>
        <Row label={t("admin_users_lite_label_phone_verified")}>
          <span className="text-sm font-semibold text-[#101828]">
            {user.phone_verified === true
              ? t("admin_users_lite_verified_done")
              : t("admin_users_lite_verified_pending")}
          </span>
        </Row>
      </Section>

      {state.kind === "loading" ? (
        <div className={`${ADMIN_USERS_LITE_CARD} py-10 text-center text-sm text-[#667085]`}>
          {t("admin_users_detail_loading")}
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div className={`${ADMIN_USERS_LITE_CARD} py-10 text-center text-sm font-semibold text-[#b42318]`}>
          {safeT("admin_users_cc_metric_error", {
            fallbackKo: "불러오지 못함",
            fallbackEn: "Load error",
          })}
        </div>
      ) : null}

      {state.kind === "ok" ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Section title={t("admin_users_cc_tab_community")}>
            <Row label={t("admin_users_cc_overview_posts")}>
              <MetricValue metric={state.overview.community.posts} />
            </Row>
            <Row label={t("admin_users_cc_overview_comments")}>
              <MetricValue metric={state.overview.community.comments} />
            </Row>
            <Row label={t("admin_users_cc_overview_reports")}>
              <MetricValue metric={state.overview.community.reportsFiled} />
            </Row>
          </Section>
          <Section title={t("admin_users_cc_tab_trade")}>
            <Row label={t("admin_users_cc_overview_listings")}>
              <MetricValue metric={state.overview.trade.listings} />
            </Row>
            <Row label={t("admin_users_cc_overview_selling")}>
              <MetricValue metric={state.overview.trade.selling} />
            </Row>
            <Row label={t("admin_users_cc_overview_reserved")}>
              <MetricValue metric={state.overview.trade.reserved} />
            </Row>
            <Row label={t("admin_users_cc_overview_completed")}>
              <MetricValue metric={state.overview.trade.completed} />
            </Row>
          </Section>
          <Section title={t("admin_users_cc_tab_delivery")}>
            <Row label={t("admin_users_cc_overview_orders_total")}>
              <MetricValue metric={state.overview.delivery.total} />
            </Row>
            <Row label={t("admin_users_cc_overview_orders_open")}>
              <MetricValue metric={state.overview.delivery.inProgress} />
            </Row>
            <Row label={t("admin_users_cc_overview_orders_done")}>
              <MetricValue metric={state.overview.delivery.completed} />
            </Row>
            <Row label={t("admin_users_cc_overview_orders_cancel")}>
              <MetricValue metric={state.overview.delivery.cancelled} />
            </Row>
          </Section>
          <Section title={t("admin_users_cc_tab_chat")}>
            {(Object.keys(CHAT_LABEL_KEYS) as ChatDomain[]).map((domain) => (
              <Row key={domain} label={t(CHAT_LABEL_KEYS[domain])}>
                <MetricValue metric={state.overview.chat.byDomain[domain]} />
              </Row>
            ))}
          </Section>
          <Section title={t("admin_users_cc_tab_store")}>
            <Row label={t("admin_users_cc_overview_stores")}>
              <MetricValue metric={state.overview.store.owned} />
            </Row>
          </Section>
          <Section title={t("admin_users_cc_tab_points")}>
            <Row label={t("admin_users_cc_overview_balance")}>
              <MetricValue
                metric={state.overview.points}
                format={(value) => `${Number(value).toLocaleString(language === "en" ? "en-US" : "ko-KR")}P`}
              />
            </Row>
          </Section>
          <Section title={t("admin_users_cc_tab_trust")}>
            <Row label={t("admin_users_cc_overview_manner")}>
              <MetricValue
                metric={
                  state.overview.trust.ok
                    ? { ok: true, value: state.overview.trust.value.percent }
                    : state.overview.trust
                }
                format={(value) => `${value}%`}
              />
            </Row>
          </Section>
          <Section title={t("admin_users_cc_overview_recent")}>
            <Row label={t("admin_users_cc_overview_last_post")}>
              <MetricValue metric={state.overview.community.lastPostAt} format={fmtTime} />
            </Row>
            <Row label={t("admin_users_cc_overview_last_order")}>
              <MetricValue metric={state.overview.delivery.lastOrderAt} format={fmtTime} />
            </Row>
            <Row label={t("admin_users_cc_overview_last_chat")}>
              <MetricValue metric={state.overview.chat.lastMessageAt} format={fmtTime} />
            </Row>
          </Section>
        </div>
      ) : null}
    </div>
  );
}
