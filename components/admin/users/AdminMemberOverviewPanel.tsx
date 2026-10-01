"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  displayNameForDetailUser,
  formatAdminLiteDate,
  formatAdminLiteDateTime,
  publicIdForDetailUser,
  resolveDetailAuthProvider,
} from "@/components/admin/users/admin-user-lite-display";
import { adminMembershipRoleFromRow } from "@/lib/admin-users/member-role-badges";
import type { MemberOverviewAggregates, OverviewMetric } from "@/lib/admin-users/member-overview-aggregates";
import type { MemberOpsHistoryItem } from "@/lib/admin-users/member-ops-history";
import type { ChatDomain } from "@/lib/chat-domain/four-domain-freeze";
import type {
  AdminPersonMembershipRow,
  AdminPersonStoreRow,
  AdminUserDetailPayload,
} from "@/components/admin/users/AdminTestUserDetail";
import { ADMIN_USERS_LITE_CARD } from "@/lib/ui/admin-users-lite-styles";
import { MEMBER_ADMIN_COPY } from "@/lib/admin-users/member-admin-copy-ssot";
import {
  MEMBER_DETAIL_STORE_NONE_KO,
  MEMBER_DETAIL_STORE_OPERATOR_KO,
  memberDetailAccountStateLabelKo,
  memberDetailPrivilegeLabelKo,
  memberDetailSignupOriginLabelKo,
  memberDetailStoreHref,
  memberDetailVerificationLabelKo,
} from "@/lib/admin-users/member-detail-presentation";
import {
  memberDetailContactEmail,
  memberDetailLoginIdLabel,
  memberDetailNicknameIfDistinct,
  memberDetailOverviewSectionRenderPlan,
  type MemberDetailOverviewSectionId,
} from "@/lib/admin-users/member-detail-control-center-ia";
import Link from "next/link";

type OverviewJumpTab = "community" | "trade" | "delivery" | "chat" | "store";

function metricNum(metric: OverviewMetric<number> | { ok: false; unavailable: true }): string {
  if ("unavailable" in metric && metric.unavailable) return "—";
  if (!metric.ok) return "!";
  return metric.value == null ? "—" : String(metric.value);
}

function metricTime(
  metric: OverviewMetric<string | null>,
  fmt: (value: string | null) => string,
): string {
  if (!metric.ok) return "!";
  return fmt(metric.value);
}

function Panel({
  sectionId,
  title,
  children,
}: {
  sectionId: MemberDetailOverviewSectionId;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`${ADMIN_USERS_LITE_CARD} p-3`}
      data-member-overview-section={sectionId}
    >
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#667085]">{title}</h3>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-2 border-b border-[#f2f4f7] py-1.5 text-[13px] last:border-b-0">
      <dt className="text-[#667085]">{label}</dt>
      <dd className="font-medium text-[#101828]">{value}</dd>
    </div>
  );
}

function ActivityLine({
  label,
  summary,
  onView,
  viewLabel,
}: {
  label: string;
  summary: string;
  onView: () => void;
  viewLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-[#f2f4f7] py-1.5 text-[13px] last:border-b-0">
      <div className="min-w-0">
        <span className="font-semibold text-[#344054]">{label}</span>
        <span className="ml-2 text-[#475467]">{summary}</span>
      </div>
      <button type="button" className="shrink-0 text-[12px] font-semibold text-[#2563eb]" onClick={onView}>
        {viewLabel}
      </button>
    </div>
  );
}

export function AdminMemberOverviewPanel({
  user,
  stores,
  adminMembership,
  onOpenTab,
}: {
  user: AdminUserDetailPayload;
  stores: AdminPersonStoreRow[];
  adminMembership: AdminPersonMembershipRow | null;
  onOpenTab: (tab: OverviewJumpTab) => void;
}) {
  const { t, safeT, language } = useI18n();
  const locale = language === "en" ? "en-US" : "ko-KR";
  const empty = t("admin_users_empty_placeholder");
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "ok"; overview: MemberOverviewAggregates }
  >({ kind: "loading" });
  const [ops, setOps] = useState<MemberOpsHistoryItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    (async () => {
      try {
        const [overviewRes, opsRes] = await Promise.all([
          fetch(`/api/admin/users/${encodeURIComponent(user.id)}/overview`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`/api/admin/users/${encodeURIComponent(user.id)}/ops-history?pageSize=5`, {
            credentials: "include",
            cache: "no-store",
          }),
        ]);
        const overviewData = (await overviewRes.json().catch(() => ({}))) as {
          ok?: boolean;
          overview?: MemberOverviewAggregates;
        };
        const opsData = (await opsRes.json().catch(() => ({}))) as { ok?: boolean; items?: MemberOpsHistoryItem[] };
        if (cancelled) return;
        if (!overviewRes.ok || !overviewData.ok || !overviewData.overview) {
          setState({ kind: "error" });
        } else {
          setState({ kind: "ok", overview: overviewData.overview });
        }
        setOps(Array.isArray(opsData.items) ? opsData.items : []);
      } catch {
        if (!cancelled) setState({ kind: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const viewLabel = safeT("admin_users_overview_view", { fallbackKo: "보기", fallbackEn: "View" });
  const fmtTime = (value: string | null) => {
    if (!value) return empty;
    return formatAdminLiteDateTime(value, locale, empty);
  };

  const displayName = displayNameForDetailUser(user);
  const nicknameDistinct = memberDetailNicknameIfDistinct(displayName, user.nickname);
  const contactEmail = memberDetailContactEmail(user.email);
  const loginId = memberDetailLoginIdLabel(user.username);

  const chatSummary = (overview: MemberOverviewAggregates) => {
    const domains: ChatDomain[] = ["general_direct", "group", "trade", "store_order"];
    const labels = {
      general_direct: "GD",
      group: "Group",
      trade: "Trade",
      store_order: "SO",
    } as const;
    return domains
      .map((d) => `${labels[d]} ${metricNum(overview.chat.byDomain[d])}`)
      .join(" · ");
  };

  const sectionBody: Record<MemberDetailOverviewSectionId, ReactNode> = {
    basic: (
      <dl>
        <Fact label="표시 이름" value={displayName} />
        {nicknameDistinct ? <Fact label="닉네임" value={nicknameDistinct} /> : null}
        <Fact label="@회원 ID" value={publicIdForDetailUser(user) || empty} />
        <Fact label="로그인 ID" value={loginId || empty} />
        <Fact label={t("admin_users_lite_label_phone")} value={user.contact_phone?.trim() || empty} />
        {contactEmail ? <Fact label="연락 이메일" value={contactEmail} /> : null}
        <Fact label={t("admin_users_col_region")} value={user.region_name?.trim() || empty} />
        <Fact label={t("admin_users_col_joined")} value={formatAdminLiteDate(user.created_at, locale, empty)} />
        <Fact
          label={safeT("admin_users_label_app_last_login", { fallbackKo: "최근 로그인", fallbackEn: "Last login" })}
          value={formatAdminLiteDateTime(user.last_login_at, locale, empty)}
        />
      </dl>
    ),
    account_auth: (
      <dl>
        <Fact
          label="계정 상태"
          value={memberDetailAccountStateLabelKo(user.moderation_status, user.status)}
        />
        <Fact label="인증" value={memberDetailVerificationLabelKo(user.phone_verified)} />
        <Fact
          label="가입 경로"
          value={memberDetailSignupOriginLabelKo(resolveDetailAuthProvider(user.email))}
        />
      </dl>
    ),
    store: (
      <dl>
        <Fact
          label="매장"
          value={
            stores.length === 0
              ? MEMBER_DETAIL_STORE_NONE_KO
              : `${stores[0]?.store_name?.trim() || "—"} (#${stores[0]?.id})`
          }
        />
        {stores.length > 0 ? (
          <div className="py-1.5 text-[13px]">
            <Link
              href={memberDetailStoreHref(stores[0].id)}
              className="font-semibold text-[#2563eb]"
              data-overview-store-cta="1"
              data-member-cta-cap="CAP-STORE-VIEW"
            >
              매장 상세 보기
            </Link>
          </div>
        ) : null}
      </dl>
    ),
    privilege: (
      <dl>
        <Fact
          label={MEMBER_ADMIN_COPY.admin_privilege}
          value={memberDetailPrivilegeLabelKo({
            hasAdminMembership: Boolean(adminMembership),
            isSuperAdmin: adminMembershipRoleFromRow(adminMembership?.role) === "super_admin",
          })}
        />
        <Fact
          label={t("admin_users_cc_tab_points")}
          value={
            state.kind === "ok"
              ? "unavailable" in state.overview.points && state.overview.points.unavailable
                ? t("admin_users_cc_metric_unavailable")
                : state.overview.points.ok
                  ? `${Number(state.overview.points.value).toLocaleString(locale)} P`
                  : t("admin_users_cc_metric_error")
              : empty
          }
        />
        <Fact
          label={t("admin_users_cc_overview_manner")}
          value={
            state.kind === "ok" && state.overview.trust.ok
              ? `${state.overview.trust.value.percent}%`
              : empty
          }
        />
      </dl>
    ),
    recent_activity: (
      <>
        {state.kind === "loading" ? (
          <p className="py-6 text-center text-[13px] text-[#667085]">{t("admin_users_detail_loading")}</p>
        ) : null}
        {state.kind === "error" ? (
          <p className="py-6 text-center text-[13px] font-semibold text-[#b42318]">
            {safeT("admin_users_cc_metric_error", { fallbackKo: "불러오지 못함", fallbackEn: "Load error" })}
          </p>
        ) : null}
        {state.kind === "ok" ? (
          <div>
            <ActivityLine
              label={t("admin_users_cc_tab_community")}
              summary={`${t("admin_users_cc_overview_posts")} ${metricNum(state.overview.community.posts)} · ${t("admin_users_cc_overview_comments")} ${metricNum(state.overview.community.comments)} · ${t("admin_users_cc_overview_reports")} ${metricNum(state.overview.community.reportsFiled)}`}
              onView={() => onOpenTab("community")}
              viewLabel={viewLabel}
            />
            <ActivityLine
              label={t("admin_users_cc_tab_trade")}
              summary={`${t("admin_users_cc_overview_listings")} ${metricNum(state.overview.trade.listings)} · ${t("admin_users_cc_overview_completed")} ${metricNum(state.overview.trade.completed)}`}
              onView={() => onOpenTab("trade")}
              viewLabel={viewLabel}
            />
            <ActivityLine
              label={t("admin_users_cc_tab_delivery")}
              summary={`${metricNum(state.overview.delivery.total)}${language === "en" ? "" : "건"} · ${t("admin_users_cc_overview_last_order")} ${metricTime(state.overview.delivery.lastOrderAt, fmtTime)}`}
              onView={() => onOpenTab("delivery")}
              viewLabel={viewLabel}
            />
            <ActivityLine
              label={t("admin_users_cc_tab_chat")}
              summary={chatSummary(state.overview)}
              onView={() => onOpenTab("chat")}
              viewLabel={viewLabel}
            />
            <ActivityLine
              label={t("admin_users_cc_tab_store")}
              summary={
                stores.length === 0
                  ? MEMBER_DETAIL_STORE_NONE_KO
                  : `${MEMBER_DETAIL_STORE_OPERATOR_KO} ${stores.length}곳`
              }
              onView={() => onOpenTab("store")}
              viewLabel={viewLabel}
            />
          </div>
        ) : null}
      </>
    ),
    recent_ops: (
      <>
        {ops.length === 0 ? (
          <p className="text-[13px] text-[#667085]">{safeT("admin_users_cc_empty", { fallbackKo: "항목이 없습니다.", fallbackEn: "No items." })}</p>
        ) : (
          <ul className="space-y-1">
            {ops.slice(0, 4).map((item) => (
              <li key={item.id} className="text-[12px] text-[#344054]">
                {formatAdminLiteDateTime(item.createdAt, locale, empty)}{" "}
                {item.actionLabel || item.action}
                {" · "}
                {item.actorLoginId || item.actorId || "—"}
              </li>
            ))}
          </ul>
        )}
      </>
    ),
  };

  return (
    <div className="grid gap-3 lg:grid-cols-3" data-member-overview-hierarchy="1">
      {memberDetailOverviewSectionRenderPlan().map(({ id: sectionId, labelKo }) => (
        <Panel key={sectionId} sectionId={sectionId} title={labelKo}>
          {sectionBody[sectionId]}
        </Panel>
      ))}
    </div>
  );
}

