"use client";

/**
 * 판매자·구매자 `/admin/trade/members` (설계 v2 §C-6) — 거래글을 올렸거나 거래 채팅을 한 회원.
 * 탭: 전체 / 거래 제한 중 / 계정 정지 (건수) · 닉네임 검색 · 행 → 판매자·구매자 상세.
 * URL: tab(탭 — 대시보드 딥링크 호환) · q · page · size(20/50/100)
 */
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import Link from "next/link";
import {
  COMMUNITY_TD,
  CommunityFilterBar,
  CommunityListBody,
  CommunityListPagination,
  CommunityListShell,
  CommunityStatusBadge,
  CommunityTable,
  CommunityTabs,
  useCommunityListQuery,
  useCommunityQueryState,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { useCommunityAdminJson } from "@/components/admin/community/members/use-community-admin-data";
import { tradeDetailHref } from "@/components/admin/trade/kit/TradeAdminKit";
import { tradeRestrictionScopeLabel } from "@/components/admin/trade/restrictions/TradeRestrictionsPage";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import type { MessageKey } from "@/lib/i18n/messages";

type TabKey = "all" | "restricted" | "suspended";
const TABS: { value: TabKey; labelKey: MessageKey }[] = [
  { value: "all", labelKey: "common_all" },
  { value: "restricted", labelKey: "admin_trade_members_tab_restricted" },
  { value: "suspended", labelKey: "admin_trade_members_tab_suspended" },
];
const EMPTY_TEXT: Record<TabKey, MessageKey> = {
  all: "admin_trade_members_empty_all",
  restricted: "admin_trade_members_empty_restricted",
  suspended: "admin_trade_members_empty_suspended",
};

type MemberRow = {
  user_id: string;
  label: string | null;
  account_status: string | null;
  post_count: number;
  buyer_chat_count: number;
  trade_restrictions: string[];
  open_user_reports: number;
};

type ListResponse = {
  ok?: boolean;
  error?: string;
  total?: number;
  capped?: boolean;
  tabCounts?: Partial<Record<TabKey, number>>;
  rows?: MemberRow[];
};

/** 프로필 상태 → 계정 상태 라벨 키 (정상·계정 정지·계정 차단·탈퇴) */
export function tradeAccountStatusKey(raw: string | null | undefined): string {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "suspended") return "suspended";
  if (v === "blocked" || v === "banned") return "blocked";
  if (v === "deleted" || v === "withdrawn" || v === "deactivated") return "withdrawn";
  return "active";
}

export function TradeMembersPage() {
  const { t } = useI18n();
  /** `tab` 은 조회 조건 밖 키 — [초기화] 후에도 유지, 탭을 바꾸면 1쪽으로 */
  const qs = useCommunityQueryState();
  const lq = useCommunityListQuery();
  const tabRaw = qs.get("tab");
  const tab: TabKey = (TABS.find((t) => t.value === tabRaw)?.value ?? "all") as TabKey;

  const params = lq.apiParams({ period: false });
  params.set("tab", tab);
  const { state, reload } = useCommunityAdminJson<ListResponse>(`/api/admin/trade/members?${params.toString()}`);
  const rows = state.data?.rows ?? [];
  const total = state.status === "ok" ? Number(state.data.total ?? 0) : null;
  const counts = state.data?.tabCounts ?? {};

  return (
    <CommunityListShell
      title={t("admin_trade_members_title")}
      description={t("admin_trade_members_desc")}
      tabs={
        <CommunityTabs
          value={tab}
          onChange={(v) => qs.set({ tab: v === "all" ? null : v })}
          tabs={TABS.map((x) => ({ value: x.value, label: t(x.labelKey), count: counts[x.value] ?? null }))}
        />
      }
      filterBar={
        <CommunityFilterBar lq={lq} showPeriod={false} searchPlaceholder={t("admin_trade_restrict_nickname")} pending={state.status === "loading"}>
          {state.data?.capped ? (
            <p className="w-full text-[12px] text-sam-muted">
              {t("admin_trade_members_partial_aggregate")}
            </p>
          ) : null}
        </CommunityFilterBar>
      }
      footer={<CommunityListPagination lq={lq} total={total} disabled={state.status === "loading"} />}
    >
      <CommunityListBody state={state} empty={rows.length === 0} lq={lq} onRetry={reload} emptyMessage={t(EMPTY_TEXT[tab])}>
        <CommunityTable head={[t("admin_trade_points_member"), t("admin_trade_members_th_account_status"), t("admin_trade_members_th_posts"), t("admin_trade_members_th_buyer_chats"), t("admin_trade_members_th_restriction"), t("admin_trade_members_th_open_reports"), t("admin_trade_members_th_detail")]}>
          {rows.map((r) => {
            const href = tradeDetailHref(`/admin/trade/members/${encodeURIComponent(r.user_id)}`, lq.selfHref);
            return (
              <tr key={r.user_id} className="border-b border-sam-border-soft hover:bg-sam-app">
                <td className={COMMUNITY_TD}>
                  <Link href={href} className="font-medium text-sam-primary hover:underline">
                    {r.label?.trim() || t("admin_trade_kit_no_name")}
                  </Link>
                </td>
                <td className={COMMUNITY_TD}>
                  <CommunityStatusBadge domain="account_status" value={tradeAccountStatusKey(r.account_status)} />
                </td>
                <td className={`${COMMUNITY_TD} text-right tabular-nums`}>{formatAdminNumber(r.post_count)}</td>
                <td className={`${COMMUNITY_TD} text-right tabular-nums`}>{formatAdminNumber(r.buyer_chat_count)}</td>
                <td className={COMMUNITY_TD}>
                  {r.trade_restrictions.length === 0 ? (
                    <span className="text-sam-muted">{t("admin_trade_members_none")}</span>
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {r.trade_restrictions.map((x, i) => (
                        <AdminToneBadge key={`${x}-${i}`} tone="danger">
                          {tradeRestrictionScopeLabel(t, x) ?? t("admin_trade_members_th_restriction")}
                        </AdminToneBadge>
                      ))}
                    </span>
                  )}
                </td>
                <td className={COMMUNITY_TD}>
                  {r.open_user_reports > 0 ? (
                    <AdminToneBadge tone="waiting">{t("admin_trade_count_items", { n: formatAdminNumber(r.open_user_reports) })}</AdminToneBadge>
                  ) : (
                    <span className="text-sam-muted">0</span>
                  )}
                </td>
                <td className={COMMUNITY_TD}>
                  <AdminActionLink href={href} variant="ghost" size="sm">
                    {t("admin_trade_members_row_detail")}
                  </AdminActionLink>
                </td>
              </tr>
            );
          })}
        </CommunityTable>
      </CommunityListBody>
    </CommunityListShell>
  );
}
