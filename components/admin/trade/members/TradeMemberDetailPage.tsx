"use client";

/**
 * 판매자·구매자 상세 `/admin/trade/members/[userId]` (설계 v2 §C-6).
 * ① 요약(이름·계정 상태·거래 수치) ② 탭: 판매글 · 구매 채팅 · 신고 받은 내역 · 거래 제한 · 홍보 주문 · 포인트 원장 · 계정 조치.
 * 모든 조회·조치는 거래 Admin 경로(/api/admin/trade/...)만 쓴다. 연락처는 표시하지 않는다.
 */
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  COMMUNITY_TD,
  CommunityActionSheet,
  CommunityPagination,
  CommunityStatusBadge,
  CommunitySummaryCard,
  CommunityTable,
  CommunityTabs,
  CommunityTimeCell,
  CommunityTimeline,
  useCommunityQueryState,
  type CommunitySheetSettle,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminTechDetails,
} from "@/components/admin/ui/AdminStateViews";
import { AdminToneBadge, AdminUnavailableChip } from "@/components/admin/ui/AdminToneBadge";
import { useCommunityAdminJson, type CommunityAdminLoad } from "@/components/admin/community/members/use-community-admin-data";
import {
  CommunityBannerView,
  communityActionFetch,
  type CommunityBanner,
} from "@/components/admin/community/reports/community-report-admin-shared";
import {
  TradeStageBadge,
  formatTradePoints,
  formatTradePrice,
  tradeDetailHref,
  tradeErrorText,
} from "@/components/admin/trade/kit/TradeAdminKit";
import {
  tradeRestrictionScopeLabel,
  TradeAddRestrictionSheet,
  TradeRevokeRestrictionSheet,
  TradeSanctionStateBadge,
  tradeSanctionKindLabel,
  tradeSanctionPeriodText,
  type TradeRestrictionRow,
} from "@/components/admin/trade/restrictions/TradeRestrictionsPage";
import {
  TradeReportStatusBadge,
  tradeReportReasonLabel,
  tradeReportTargetLabel,
} from "@/components/admin/trade/reports/TradeReportsPage";
import { tradeAccountStatusKey } from "@/components/admin/trade/members/TradeMembersPage";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { readAdminReturnToFromSearch } from "@/lib/admin/admin-operation-return-context";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import type { MessageKey } from "@/lib/i18n/messages";

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

type Rec = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const LIST_PAGE_SIZE = 20;
const SIDE_LIMIT = 50;
const REASON_MIN = 2;

const TABS: { value: string; labelKey: MessageKey }[] = [
  { value: "listings", labelKey: "admin_trade_member_tab_listings" },
  { value: "buyer", labelKey: "admin_trade_member_tab_buyer" },
  { value: "reports", labelKey: "admin_trade_member_tab_reports" },
  { value: "restrictions", labelKey: "admin_trade_members_th_restriction" },
  { value: "promotions", labelKey: "admin_trade_points_type_promo_order" },
  { value: "points", labelKey: "admin_trade_member_tab_points" },
  { value: "account", labelKey: "admin_trade_member_tab_account" },
];

type Metric = { ok: true; value: number } | { ok: false; error?: string };
type TradeTabResponse = {
  ok?: boolean;
  error?: string;
  summary?: Partial<Record<"listings" | "selling" | "reserved" | "completed" | "buyerChats" | "tradeChats", Metric>>;
  page?: number;
  pageSize?: number;
  total?: Metric;
  listings?: Array<{
    id: string;
    title: string;
    status: string;
    listingState: string;
    price: number | null;
    currency?: string | null;
    createdAt: string;
    updatedAt: string | null;
  }>;
  buyer?: Array<{ id: string; postId: string; postTitle: string; tradeFlowStatus: string; roomId: string | null; sellerId: string }>;
};
type RowsResponse = { ok?: boolean; error?: string; total?: number; rows?: Rec[] };
type ModerationResponse = { ok?: boolean; error?: string; events?: Rec[] };

const MOD_ACTION_LABEL: Record<string, MessageKey> = {
  warn: "admin_trade_member_act_warn",
  suspend: "admin_trade_member_act_suspend",
  ban: "admin_trade_member_act_ban",
  restore: "admin_trade_member_act_restore",
};

const FLOW_LABEL: Record<string, MessageKey> = {
  chatting: "admin_trade_flow_status_chatting",
  inquiry: "admin_trade_member_flow_inquiry",
  negotiating: "admin_trade_member_flow_negotiating",
  reserved: "admin_trade_member_flow_reserved",
  completed: "admin_trade_listing_completed",
  sold: "admin_trade_listing_completed",
  cancelled: "admin_trade_flow_status_cancelled",
  canceled: "admin_trade_flow_status_cancelled",
};

const POINT_RELATED: Record<string, MessageKey> = {
  promotion_order: "admin_trade_member_pt_promo",
  trade_post_ad: "admin_trade_member_pt_legacy_ad",
  admin_manual: "admin_trade_confirm_source_admin",
};
const POINT_ENTRY: Record<string, MessageKey> = {
  spend: "admin_trade_points_entry_spend",
  refund: "admin_trade_points_entry_refund",
  hold: "admin_trade_points_entry_hold",
  capture: "admin_trade_member_pt_capture",
  release: "admin_trade_points_entry_hold_release",
  admin_credit: "admin_trade_points_op_credit",
  admin_debit: "admin_trade_points_op_debit",
  admin_adjust: "admin_trade_member_pt_adjust",
  charge: "admin_trade_member_pt_charge",
  reward: "admin_trade_points_op_credit",
  reverse: "admin_trade_points_op_debit",
  expire: "admin_trade_member_pt_expire",
};
function pointTypeLabel(t: Translate, relatedType: string, entryType: string): string {
  const r = t(POINT_RELATED[relatedType] ?? "admin_trade_audit_target_other");
  const e = POINT_ENTRY[entryType];
  return e ? `${r} ${t(e)}` : r;
}

function metricText(m: Metric | undefined): ReactNode {
  if (!m || !m.ok) return <AdminUnavailableChip ko />;
  return formatAdminNumber(m.value);
}

function rowsOf(st: CommunityAdminLoad<RowsResponse>): Rec[] | null {
  return st.status === "ok" ? st.data.rows ?? [] : null;
}

type Sheet =
  | { kind: "add" }
  | { kind: "revoke"; row: Rec }
  | { kind: "account"; action: "warn" | "suspend" | "ban" | "restore" }
  | null;

export function TradeMemberDetailPage({ userId }: { userId: string }) {
  const { t } = useI18n();
  const qs = useCommunityQueryState();
  const sp = useSearchParams();
  const backHref = readAdminReturnToFromSearch(sp) ?? "/admin/trade/members";
  const tab = TABS.some((x) => x.value === qs.get("tab")) ? qs.get("tab") : "listings";
  const listPage = Math.max(1, Number(qs.get("lp") || 1) || 1);
  const uid = encodeURIComponent(userId);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [banner, setBanner] = useState<CommunityBanner>(null);

  const tradeSection = tab === "buyer" ? "buyer" : "listings";
  const trade = useCommunityAdminJson<TradeTabResponse>(
    `/api/admin/trade/members/${uid}/trade?section=${tradeSection}&page=${tab === "listings" || tab === "buyer" ? listPage : 1}&pageSize=${LIST_PAGE_SIZE}`
  );
  const moderation = useCommunityAdminJson<ModerationResponse>(`/api/admin/trade/members/${uid}/moderation`);
  const restrictions = useCommunityAdminJson<RowsResponse>(
    `/api/admin/trade/restrictions?userId=${uid}&status=all&limit=${SIDE_LIMIT}`
  );
  // 신고 받은 내역 = 회원 본인 신고 + 이 회원 거래글 신고
  const reports = useCommunityAdminJson<RowsResponse>(`/api/admin/trade/reports?sellerId=${uid}&tab=all&limit=${SIDE_LIMIT}`);
  // 머리말 — 이름·계정 상태 (공용 회원 정보)
  const member = useCommunityAdminJson<RowsResponse>(`/api/admin/trade/members?userId=${uid}&limit=1`);
  const memberRow = rowsOf(member.state)?.[0] ?? null;
  const promotions = useCommunityAdminJson<RowsResponse>(
    `/api/admin/trade/promotions?userId=${uid}&tab=all&limit=${SIDE_LIMIT}`
  );
  const points = useCommunityAdminJson<RowsResponse>(`/api/admin/trade/points?userId=${uid}&period=all&limit=${SIDE_LIMIT}`);

  const restrictionRows = rowsOf(restrictions.state);
  const reportRows = rowsOf(reports.state);
  const promotionRows = rowsOf(promotions.state);
  const pointRows = rowsOf(points.state);
  const events = moderation.state.status === "ok" ? moderation.state.data.events ?? [] : null;

  // 이름 — 거래 화면 응답에 실린 회원 표시명 중 먼저 찾은 것
  const label =
    s(memberRow?.label).trim() ||
    (restrictionRows ?? []).map((r) => s(r.user_label).trim()).find(Boolean) ||
    (promotionRows ?? []).map((r) => s(r.user_label).trim()).find(Boolean) ||
    (pointRows ?? []).map((r) => s(r.userNickname).trim()).find(Boolean) ||
    (reportRows ?? [])
      .filter((r) => s(r.target_user_id) === userId)
      .map((r) => s(r.target_user_label).trim())
      .find(Boolean) ||
    t("admin_trade_points_member");

  // 계정 상태 — 공용 회원 정보(profiles.status) 우선, 없으면 최근 계정 조치 결과
  const lastStatus = memberRow
    ? s(memberRow.account_status)
    : events
      ? s(events.find((e) => s(e.to_status))?.to_status)
      : null;
  const accountKey = lastStatus === null ? null : tradeAccountStatusKey(lastStatus);
  const activeRestrictions = (restrictionRows ?? []).filter(
    (r) => s(r.status) === "active" && s(r.sanction_type) === "trade_restriction"
  );

  const reloadAll = () => {
    trade.reload();
    moderation.reload();
    member.reload();
    restrictions.reload();
    reports.reload();
    promotions.reload();
    points.reload();
  };
  const afterSheet = (b: CommunityBanner) => {
    setSheet(null);
    setBanner(b);
    reloadAll();
  };

  const sum = trade.state.data?.summary ?? {};

  return (
    <div data-trade-member-detail="1" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={backHref} className="text-[13px] font-medium text-sam-muted underline">
          {t("admin_trade_back_to_list")}
        </Link>
        <Link href={`/admin/users/${uid}`} className="text-[12px] text-sam-muted underline">
          {t("admin_trade_member_full_info")}
        </Link>
      </div>

      <header className="flex flex-wrap items-center gap-2">
        <h1 className="sam-text-page-title font-semibold text-sam-fg">{label}</h1>
        {accountKey ? <CommunityStatusBadge domain="account_status" value={accountKey} /> : null}
        {activeRestrictions.map((r) => (
          <AdminToneBadge key={s(r.id)} tone="danger">
            {t("admin_trade_member_scope_restriction_badge", { scope: tradeRestrictionScopeLabel(t, s(r.restriction)) ?? t("admin_trade") })}
          </AdminToneBadge>
        ))}
      </header>

      <CommunityBannerView banner={banner} onClose={() => setBanner(null)} />

      <CommunitySummaryCard
        rows={[
          { label: t("admin_trade_members_th_account_status"), value: accountKey ? <CommunityStatusBadge domain="account_status" value={accountKey} /> : <AdminUnavailableChip ko /> },
          {
            label: t("admin_trade_members_th_restriction"),
            value:
              restrictionRows === null ? (
                <AdminUnavailableChip ko />
              ) : activeRestrictions.length === 0 ? (
                t("common_none")
              ) : (
                activeRestrictions
                  .map(
                    (r) =>
                      `${tradeRestrictionScopeLabel(t, s(r.restriction)) ?? t("admin_trade")} · ${
                        r.end_at ? `~${formatAdminManilaDateTime(s(r.end_at)).slice(0, 10)}` : t("admin_trade_restrict_days_perm")
                      }`
                  )
                  .join(", ")
              ),
          },
          { label: t("admin_trade_member_tab_listings"), value: metricText(sum.listings) },
          {
            label: t("admin_trade_member_sale_status"),
            value: (
              <span>
                {t("admin_trade_member_sale_selling")} {metricText(sum.selling)} · {t("admin_trade_member_sale_reserved")} {metricText(sum.reserved)} · {t("admin_trade_member_sale_completed")} {metricText(sum.completed)}
              </span>
            ),
          },
          { label: t("admin_trade_member_tab_buyer"), value: metricText(sum.buyerChats) },
          {
            label: t("admin_trade_member_reports_received"),
            value:
              reportRows === null
                ? <AdminUnavailableChip ko />
                : t("admin_trade_member_reports_count", {
                    n: formatAdminNumber(reports.state.data?.total ?? reportRows.length),
                    pending: formatAdminNumber(
                      reportRows.filter((r) => s(r.status) === "pending" || s(r.status) === "reviewing").length
                    ),
                  }),
          },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3">
        <AdminActionButton variant="danger" onClick={() => setSheet({ kind: "add" })}>
          {t("admin_trade_activity_restriction")}
        </AdminActionButton>
        {activeRestrictions.map((r) => (
          <AdminActionButton key={s(r.id)} variant="neutral" onClick={() => setSheet({ kind: "revoke", row: r })}>
            {t("admin_trade_member_lift_scope_restriction", { scope: tradeRestrictionScopeLabel(t, s(r.restriction)) ?? t("admin_trade") })}
          </AdminActionButton>
        ))}
        <span className="ml-auto" />
        <AdminActionButton variant="secondary" onClick={() => qs.set({ tab: "account", lp: null })}>
          {t("admin_trade_member_account_action")}
        </AdminActionButton>
      </div>

      <CommunityTabs tabs={TABS.map((x) => ({ value: x.value, label: t(x.labelKey) }))} value={tab} onChange={(v) => qs.set({ tab: v === "listings" ? null : v, lp: null })} />
      <div className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface">
        {tab === "listings" || tab === "buyer" ? (
          <TradeSection
            tab={tab}
            st={trade.state}
            reload={trade.reload}
            userId={userId}
            selfHref={qs.selfHref}
            page={listPage}
            onPage={(p) => qs.set({ lp: p > 1 ? p : null }, { keepPage: true })}
          />
        ) : tab === "reports" ? (
          <ReportsSection st={reports.state} reload={reports.reload} userId={userId} selfHref={qs.selfHref} />
        ) : tab === "restrictions" ? (
          <RestrictionsSection
            st={restrictions.state}
            reload={restrictions.reload}
            userId={userId}
            selfHref={qs.selfHref}
            onAdd={() => setSheet({ kind: "add" })}
            onRevoke={(row) => setSheet({ kind: "revoke", row })}
          />
        ) : tab === "promotions" ? (
          <PromotionsSection st={promotions.state} reload={promotions.reload} userId={userId} selfHref={qs.selfHref} />
        ) : tab === "points" ? (
          <PointsSection st={points.state} reload={points.reload} userId={userId} />
        ) : (
          <AccountSection
            st={moderation.state}
            reload={moderation.reload}
            accountKey={accountKey}
            onAction={(action) => setSheet({ kind: "account", action })}
          />
        )}
      </div>

      <AdminTechDetails ko>
        <div>{t("admin_trade_member_id", { id: userId })}</div>
      </AdminTechDetails>

      {sheet?.kind === "add" ? (
        <TradeAddRestrictionSheet
          initialMember={{ id: userId, label }}
          lockMember
          onClose={() => setSheet(null)}
          onSettled={afterSheet}
        />
      ) : null}
      {sheet?.kind === "revoke" ? (
        <TradeRevokeRestrictionSheet row={sheet.row} onClose={() => setSheet(null)} onSettled={afterSheet} />
      ) : null}
      {sheet?.kind === "account" ? (
        <AccountActionSheet
          userId={userId}
          label={label}
          accountKey={accountKey}
          action={sheet.action}
          onClose={() => setSheet(null)}
          onSettled={afterSheet}
        />
      ) : null}
    </div>
  );
}

/* ───────── 탭 내용 ───────── */

function Empty({ text }: { text: string }) {
  return (
    <div className="p-4">
      <AdminEmptyState ko message={text} />
    </div>
  );
}

function LoadGate<T>({
  st,
  reload,
  children,
}: {
  st: CommunityAdminLoad<T>;
  reload: () => void;
  children: (data: T) => ReactNode;
}) {
  if (st.status === "loading" && !st.data) return <AdminLoadingState ko />;
  if (st.status === "error") return <AdminErrorState ko code={st.code} httpStatus={st.httpStatus} onRetry={reload} />;
  return <>{children(st.data as T)}</>;
}

function FooterLinks({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-3 border-t border-sam-border-soft px-3 py-2 text-[13px]">{children}</div>;
}

function TradeSection({
  tab,
  st,
  reload,
  userId,
  selfHref,
  page,
  onPage,
}: {
  tab: "listings" | "buyer";
  st: CommunityAdminLoad<TradeTabResponse>;
  reload: () => void;
  userId: string;
  selfHref: string;
  page: number;
  onPage: (p: number) => void;
}) {
  const { t } = useI18n();
  const uid = encodeURIComponent(userId);
  // 탭 전환 직후 이전 구역 응답이 남아 있으면 로딩으로 본다
  const stale = st.data && (st.data as TradeTabResponse & { section?: string }).section !== tab;
  if (stale && st.status === "loading") return <AdminLoadingState ko />;
  return (
    <LoadGate st={st} reload={reload}>
      {(d: TradeTabResponse) => {
        const total = d.total && d.total.ok ? d.total.value : null;
        const pager =
          total !== null && total > LIST_PAGE_SIZE ? (
            <div className="border-t border-sam-border-soft p-2">
              <CommunityPagination page={page} pageSize={LIST_PAGE_SIZE} total={total} onPage={onPage} />
            </div>
          ) : null;
        if (d.total && !d.total.ok) {
          return <AdminErrorState ko code="load_failed" httpStatus={500} onRetry={reload} />;
        }
        if (tab === "listings") {
          const list = d.listings ?? [];
          return (
            <>
              {list.length === 0 ? (
                <Empty text={t("admin_trade_member_listings_empty")} />
              ) : (
                <CommunityTable head={[t("admin_trade_member_th_title"), t("admin_trade_member_th_price"), t("admin_trade_member_sale_status"), t("admin_trade_th_created"), t("admin_trade_posts_th_updated")]}>
                  {list.map((r) => (
                    <tr key={r.id} className="border-b border-sam-border-soft">
                      <td className={COMMUNITY_TD}>
                        <Link
                          href={tradeDetailHref(`/admin/products/${encodeURIComponent(r.id)}`, selfHref)}
                          className="font-medium text-[var(--admin-console-accent)] hover:underline"
                        >
                          {r.title || t("admin_trade_posts_no_title")}
                        </Link>
                      </td>
                      <td className={`${COMMUNITY_TD} whitespace-nowrap`}>{formatTradePrice(r.price, undefined, r.currency)}</td>
                      <td className={COMMUNITY_TD}>
                        <TradeStageBadge value={r.listingState} />
                      </td>
                      <td className={COMMUNITY_TD}>
                        <CommunityTimeCell iso={r.createdAt || null} />
                      </td>
                      <td className={COMMUNITY_TD}>
                        <CommunityTimeCell iso={r.updatedAt} />
                      </td>
                    </tr>
                  ))}
                </CommunityTable>
              )}
              {pager}
              <FooterLinks>
                <Link href={tradeDetailHref(`/admin/posts-management?sellerId=${uid}`, selfHref)} className="text-[var(--admin-console-accent)] underline">
                  {t("admin_trade_member_view_posts")}
                </Link>
              </FooterLinks>
            </>
          );
        }
        const list = d.buyer ?? [];
        return (
          <>
            {list.length === 0 ? (
              <Empty text={t("admin_trade_member_buyer_empty")} />
            ) : (
              <CommunityTable head={[t("admin_trade_audit_target_post"), t("admin_trade_member_th_progress")]}>
                {list.map((r) => (
                  <tr key={r.id} className="border-b border-sam-border-soft">
                    <td className={COMMUNITY_TD}>
                      {r.postId ? (
                        <Link
                          href={tradeDetailHref(`/admin/products/${encodeURIComponent(r.postId)}`, selfHref)}
                          className="font-medium text-[var(--admin-console-accent)] hover:underline"
                        >
                          {r.postTitle || t("admin_trade_posts_no_title")}
                        </Link>
                      ) : (
                        <span className="text-sam-muted">{t("admin_trade_member_deleted_post")}</span>
                      )}
                    </td>
                    <td className={COMMUNITY_TD}>{FLOW_LABEL[r.tradeFlowStatus] ? t(FLOW_LABEL[r.tradeFlowStatus]) : r.tradeFlowStatus ? t("admin_trade_audit_target_other") : "—"}</td>
                  </tr>
                ))}
              </CommunityTable>
            )}
            {pager}
            <FooterLinks>
              <Link href={tradeDetailHref(`/admin/chats?type=trade&buyerId=${uid}`, selfHref)} className="text-[var(--admin-console-accent)] underline">
                {t("admin_trade_member_view_chats")}
              </Link>
            </FooterLinks>
          </>
        );
      }}
    </LoadGate>
  );
}

function ReportsSection({
  st,
  reload,
  userId,
  selfHref,
}: {
  st: CommunityAdminLoad<RowsResponse>;
  reload: () => void;
  userId: string;
  selfHref: string;
}) {
  const { t } = useI18n();
  return (
    <LoadGate st={st} reload={reload}>
      {(d: RowsResponse) => {
        const list = d.rows ?? [];
        return (
          <>
            {list.length === 0 ? (
              <Empty text={t("admin_trade_member_reports_empty")} />
            ) : (
              <CommunityTable head={[t("admin_trade_reports_received"), t("admin_trade_audit_target"), t("admin_trade_reports_reason"), t("admin_trade_reports_reporter"), t("admin_trade_th_status")]}>
                {list.map((r) => (
                  <tr key={s(r.id)} className="border-b border-sam-border-soft">
                    <td className={COMMUNITY_TD}>
                      <CommunityTimeCell iso={s(r.created_at) || null} />
                    </td>
                    <td className={COMMUNITY_TD}>
                      {(r.post as Rec | null)?.title ? s((r.post as Rec).title) : tradeReportTargetLabel(t, s(r.target_type))}
                    </td>
                    <td className={COMMUNITY_TD}>
                      <Link
                        href={tradeDetailHref(`/admin/trade/reports?tab=all&reportId=${encodeURIComponent(s(r.id))}`, selfHref)}
                        className="font-medium text-[var(--admin-console-accent)] hover:underline"
                      >
                        {tradeReportReasonLabel(t, s(r.reason_code))}
                      </Link>
                      {s(r.reason_text) ? <p className="line-clamp-1 sam-text-xxs text-sam-muted">{s(r.reason_text)}</p> : null}
                    </td>
                    <td className={COMMUNITY_TD}>{s(r.reporter_label) || t("admin_trade_points_member")}</td>
                    <td className={COMMUNITY_TD}>
                      <TradeReportStatusBadge value={s(r.status)} />
                    </td>
                  </tr>
                ))}
              </CommunityTable>
            )}
            <FooterLinks>
              <Link
                href={tradeDetailHref(`/admin/trade/reports?tab=all&sellerId=${encodeURIComponent(userId)}`, selfHref)}
                className="text-[var(--admin-console-accent)] underline"
              >
                {t("admin_trade_member_view_all_reports")}
              </Link>
            </FooterLinks>
          </>
        );
      }}
    </LoadGate>
  );
}

function RestrictionsSection({
  st,
  reload,
  userId,
  selfHref,
  onAdd,
  onRevoke,
}: {
  st: CommunityAdminLoad<RowsResponse>;
  reload: () => void;
  userId: string;
  selfHref: string;
  onAdd: () => void;
  onRevoke: (row: Rec) => void;
}) {
  const { t } = useI18n();
  return (
    <LoadGate st={st} reload={reload}>
      {(d: RowsResponse) => {
        const list = (d.rows ?? []) as unknown as TradeRestrictionRow[];
        return (
          <>
            <div className="flex justify-end border-b border-sam-border-soft p-2">
              <AdminActionButton variant="primary" onClick={onAdd}>
                {t("admin_trade_add_restriction")}
              </AdminActionButton>
            </div>
            {list.length === 0 ? (
              <Empty text={t("admin_trade_restrict_empty_all")} />
            ) : (
              <CommunityTable head={[t("admin_trade_restrict_kind_legend"), t("admin_trade_restrict_th_scope"), t("admin_trade_post_ads_th_period"), t("admin_trade_flow_th_reason"), t("admin_trade_audit_actor"), t("admin_trade_th_status"), t("admin_trade_restrict_th_handle")]}>
                {list.map((r) => (
                  <tr key={r.id} className="border-b border-sam-border-soft">
                    <td className={COMMUNITY_TD}>{tradeSanctionKindLabel(t, r.sanction_type)}</td>
                    <td className={COMMUNITY_TD}>
                      {r.sanction_type === "warning" ? "—" : tradeRestrictionScopeLabel(t, s(r.restriction)) ?? t("admin_trade_restrict_scope_unknown")}
                    </td>
                    <td className={`${COMMUNITY_TD} whitespace-nowrap`}>{tradeSanctionPeriodText(t, r)}</td>
                    <td className={COMMUNITY_TD}>
                      <p className="line-clamp-3 max-w-[16rem] whitespace-pre-wrap">{r.reason || "—"}</p>
                      {r.revoked_at ? (
                        <p className="mt-1 max-w-[16rem] sam-text-xxs text-sam-muted">{t("admin_trade_member_revoked_reason", { reason: r.revoke_reason || "—" })}</p>
                      ) : null}
                    </td>
                    <td className={COMMUNITY_TD}>
                      <span className="flex flex-col">
                        <span>{r.created_by_label ?? t("admin_trade_confirm_source_admin")}</span>
                        <span className="sam-text-xxs text-sam-muted">
                          <CommunityTimeCell iso={r.created_at} />
                        </span>
                      </span>
                    </td>
                    <td className={COMMUNITY_TD}>
                      <TradeSanctionStateBadge row={r} />
                    </td>
                    <td className={COMMUNITY_TD}>
                      {r.status === "active" ? (
                        <AdminActionButton
                          variant="secondary"
                          className="min-h-8 px-2 py-1 text-[12px]"
                          onClick={() => onRevoke(r as unknown as Rec)}
                        >
                          {t("admin_trade_filter_clear")}
                        </AdminActionButton>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </CommunityTable>
            )}
            <FooterLinks>
              <Link
                href={tradeDetailHref(`/admin/trade/restrictions?tab=all&userId=${encodeURIComponent(userId)}`, selfHref)}
                className="text-[var(--admin-console-accent)] underline"
              >
                {t("admin_trade_member_view_restrictions")}
              </Link>
            </FooterLinks>
          </>
        );
      }}
    </LoadGate>
  );
}

function PromotionsSection({
  st,
  reload,
  userId,
  selfHref,
}: {
  st: CommunityAdminLoad<RowsResponse>;
  reload: () => void;
  userId: string;
  selfHref: string;
}) {
  const { t } = useI18n();
  return (
    <LoadGate st={st} reload={reload}>
      {(d: RowsResponse) => {
        const list = d.rows ?? [];
        return (
          <>
            {list.length === 0 ? (
              <Empty text={t("admin_trade_member_promos_empty")} />
            ) : (
              <CommunityTable head={[t("admin_trade_audit_target_post"), t("admin_trade_post_ads_th_period"), t("admin_trade_member_th_points_paid"), t("admin_trade_points_entry_refund"), t("admin_trade_th_status")]}>
                {list.map((r) => (
                  <tr key={s(r.id)} className="border-b border-sam-border-soft">
                    <td className={COMMUNITY_TD}>
                      {s(r.target_id) ? (
                        <Link
                          href={tradeDetailHref(`/admin/products/${encodeURIComponent(s(r.target_id))}`, selfHref)}
                          className="font-medium text-[var(--admin-console-accent)] hover:underline"
                        >
                          {s(r.target_title) || t("admin_trade_audit_target_post")}
                        </Link>
                      ) : (
                        s(r.target_title) || "—"
                      )}
                    </td>
                    <td className={`${COMMUNITY_TD} whitespace-nowrap`}>
                      {r.start_at ? formatAdminManilaDateTime(s(r.start_at)).slice(0, 10) : "—"} ~{" "}
                      {r.end_at ? formatAdminManilaDateTime(s(r.end_at)).slice(0, 10) : "—"}
                    </td>
                    <td className={`${COMMUNITY_TD} whitespace-nowrap`}>{formatTradePoints(r.point_cost)}</td>
                    <td className={`${COMMUNITY_TD} whitespace-nowrap`}>
                      {n(r.refund_points) ? formatTradePoints(r.refund_points) : "—"}
                    </td>
                    <td className={COMMUNITY_TD}>
                      <CommunityStatusBadge domain="promotion_status" value={s(r.order_status)} />
                    </td>
                  </tr>
                ))}
              </CommunityTable>
            )}
            <FooterLinks>
              <Link
                href={tradeDetailHref(`/admin/trade/promotions?tab=all&userId=${encodeURIComponent(userId)}`, selfHref)}
                className="text-[var(--admin-console-accent)] underline"
              >
                {t("admin_trade_member_view_all_promotions")}
              </Link>
            </FooterLinks>
          </>
        );
      }}
    </LoadGate>
  );
}

function PointsSection({ st, reload, userId }: { st: CommunityAdminLoad<RowsResponse>; reload: () => void; userId: string }) {
  const { t } = useI18n();
  return (
    <LoadGate st={st} reload={reload}>
      {(d: RowsResponse) => {
        const list = d.rows ?? [];
        return (
          <>
            {list.length === 0 ? (
              <Empty text={t("admin_trade_member_points_empty")} />
            ) : (
              <CommunityTable head={[t("admin_trade_th_time"), t("admin_trade_points_th_type"), t("admin_trade_th_points"), t("admin_trade_points_th_balance"), t("admin_trade_points_th_detail")]}>
                {list.map((r) => {
                  const amt = n(r.amount) ?? 0;
                  return (
                    <tr key={s(r.id)} className="border-b border-sam-border-soft">
                      <td className={COMMUNITY_TD}>
                        <CommunityTimeCell iso={s(r.createdAt) || null} absolute />
                      </td>
                      <td className={COMMUNITY_TD}>{pointTypeLabel(t, s(r.relatedType), s(r.entryType))}</td>
                      <td className={`${COMMUNITY_TD} whitespace-nowrap ${amt < 0 ? "text-sam-danger" : "text-sam-success"}`}>
                        {amt > 0 ? "+" : ""}
                        {formatAdminNumber(amt)} P
                      </td>
                      <td className={`${COMMUNITY_TD} whitespace-nowrap`}>{formatTradePoints(r.balanceAfter)}</td>
                      <td className={COMMUNITY_TD}>{s(r.description) || "—"}</td>
                    </tr>
                  );
                })}
              </CommunityTable>
            )}
            <FooterLinks>
              <Link
                href={`/admin/trade/points?userId=${encodeURIComponent(userId)}&period=all`}
                className="text-[var(--admin-console-accent)] underline"
              >
                {t("admin_trade_member_view_all_points")}
              </Link>
            </FooterLinks>
          </>
        );
      }}
    </LoadGate>
  );
}

function AccountSection({
  st,
  reload,
  accountKey,
  onAction,
}: {
  st: CommunityAdminLoad<ModerationResponse>;
  reload: () => void;
  accountKey: string | null;
  onAction: (a: "warn" | "suspend" | "ban" | "restore") => void;
}) {
  const { t } = useI18n();
  const k = accountKey ?? "active";
  const withdrawn = k === "withdrawn";
  // MB-01: 계정 조치 = 중앙 회원 관리(/admin/users)와 같은 `users` 키 — 서버 가드가 최종 판정
  const accountAction = useAdminRouteAction("/admin/users");
  const blocked = !accountAction.allowed;
  const blockedTitle = accountAction.reason ?? undefined;
  return (
    <div className="space-y-3 p-3" id="account">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-sam-muted">{t("admin_trade_member_account_status")}</span>
        {accountKey ? <CommunityStatusBadge domain="account_status" value={accountKey} /> : <AdminUnavailableChip ko />}
      </div>
      {withdrawn ? (
        <p className="text-[13px] text-sam-muted">{t("admin_trade_member_withdrawn_no_action")}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <AdminActionButton variant="secondary" disabled={!accountKey || blocked} title={blockedTitle} onClick={() => onAction("warn")}>
            {t("admin_trade_member_account_warning")}
          </AdminActionButton>
          {k === "active" ? (
            <AdminActionButton variant="danger" disabled={!accountKey || blocked} title={blockedTitle} onClick={() => onAction("suspend")}>
              {t("admin_trade_member_account_suspend")}
            </AdminActionButton>
          ) : null}
          {k !== "blocked" ? (
            <AdminActionButton variant="danger" disabled={!accountKey || blocked} title={blockedTitle} onClick={() => onAction("ban")}>
              {t("admin_trade_member_account_ban")}
            </AdminActionButton>
          ) : null}
          {k === "suspended" || k === "blocked" ? (
            <AdminActionButton variant="primary" disabled={blocked} title={blockedTitle} onClick={() => onAction("restore")}>
              {t("admin_trade_member_account_restore")}
            </AdminActionButton>
          ) : null}
        </div>
      )}
      {!withdrawn && blocked && accountAction.reason ? (
        <p className="text-[12px] text-sam-muted" data-admin-action-denied="1">
          {t("admin_trade_member_account_action_disabled", { reason: accountAction.reason })}
        </p>
      ) : null}
      <h3 className="pt-2 text-[13px] font-semibold text-sam-fg">{t("admin_trade_member_account_actions_log")}</h3>
      <LoadGate st={st} reload={reload}>
        {(d: ModerationResponse) => (
          <CommunityTimeline
            emptyText={t("admin_trade_member_account_empty")}
            items={(d.events ?? []).map((e) => ({
              id: s(e.id),
              at: s(e.created_at),
              actor: t("admin_trade_confirm_source_admin"),
              action: t(MOD_ACTION_LABEL[s(e.action)] ?? "admin_trade_member_tab_account"),
              reason: s(e.reason).replace(/^\[SUCCESS\]\s*/, "") || null,
            }))}
          />
        )}
      </LoadGate>
    </div>
  );
}

const ACCOUNT_SHEET: Record<
  "warn" | "suspend" | "ban" | "restore",
  { title: MessageKey; confirm: MessageKey; notice: MessageKey; destructive: boolean; ok: MessageKey }
> = {
  warn: {
    title: "admin_trade_member_act_warn",
    confirm: "admin_trade_member_act_warn",
    notice: "admin_trade_member_warn_notice",
    destructive: false,
    ok: "admin_trade_member_warn_ok",
  },
  suspend: {
    title: "admin_trade_member_act_suspend",
    confirm: "admin_trade_member_act_suspend",
    notice: "admin_trade_member_suspend_notice",
    destructive: true,
    ok: "admin_trade_member_suspend_ok",
  },
  ban: {
    title: "admin_trade_member_act_ban",
    confirm: "admin_trade_member_act_ban",
    notice: "admin_trade_member_ban_notice",
    destructive: true,
    ok: "admin_trade_member_ban_ok",
  },
  restore: {
    title: "admin_trade_member_act_restore",
    confirm: "admin_trade_restrict_revoke_btn",
    notice: "admin_trade_member_restore_notice",
    destructive: false,
    ok: "admin_trade_member_restore_ok",
  },
};

function AccountActionSheet({
  userId,
  label,
  accountKey,
  action,
  onClose,
  onSettled,
}: {
  userId: string;
  label: string;
  accountKey: string | null;
  action: "warn" | "suspend" | "ban" | "restore";
  onClose: () => void;
  onSettled: (b: CommunityBanner) => void;
}) {
  const { t } = useI18n();
  const cfg = ACCOUNT_SHEET[action];
  return (
    <CommunityActionSheet
      title={t(cfg.title)}
      rows={[
        { label: t("admin_trade_points_member"), value: label },
        {
          label: t("admin_trade_dash_current"),
          value: accountKey ? <CommunityStatusBadge domain="account_status" value={accountKey} /> : t("admin_trade_dash_unavailable"),
        },
      ]}
      notice={t(cfg.notice)}
      reason={{ minLength: REASON_MIN, placeholder: t("admin_trade_member_reason_ph") }}
      destructive={cfg.destructive}
      confirmLabel={t(cfg.confirm)}
      onClose={onClose}
      onSubmit={async (reason) => {
        const { result } = await communityActionFetch(
          `/api/admin/trade/members/${encodeURIComponent(userId)}/moderation`,
          "POST",
          { action, reason }
        );
        return result;
      }}
      onSettled={(k: CommunitySheetSettle) =>
        onSettled(
          k === "done"
            ? { tone: "success", text: t(cfg.ok) }
            : k === "stale"
              ? { tone: "warning", text: `${t("admin_community_post_stale")}. ${t("admin_trade_member_stale_hint")}` }
              : { tone: "error", text: tradeErrorText("not_found") }
        )
      }
    />
  );
}

