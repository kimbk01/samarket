"use client";

/**
 * 포인트 내역·지급 (설계 §C-13) — 커뮤니티 관련 원장(보상·회수·상위노출 차감/환급·관리자 지급/회수).
 * 「포인트 지급/회수」 = 공통 지급 패널(L3, 확인 화면을 열 때 멱등 키 1회 생성)을 시트로 연다.
 * URL: type · userId · from/to(PHT) · (호환) period · page · size
 */
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { formatAdminPointBucketLine, type AdminPointBucketSums } from "@/lib/admin/points/admin-point-bucket-line";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
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
  CommunityTable,
  CommunityTimeCell,
  communityDetailHref,
  useCommunityListQuery,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { AdminTechDetails } from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminFormSheet } from "@/components/admin/AdminFormSheet";
import { AdminPointAdjustPanel } from "@/components/admin/points/AdminPointAdjustPanel";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import {
  formatCommunityPoints,
  useCommunityAdminJson,
} from "@/components/admin/community/members/use-community-admin-data";
import {
  COMMUNITY_POINT_TYPE_OPTIONS,
  communityPointTypeLabel,
} from "@/components/admin/community/points/community-point-labels";

const POINT_EXTRAS = ["type", "userId"] as const;

type LedgerRow = {
  id: string;
  createdAt: string;
  userId: string | null;
  userNickname: string | null;
  entryType: string | null;
  amount: number | null;
  balanceAfter: number | null;
  relatedType: string | null;
  relatedId: string | null;
  description: string | null;
  actorType: string | null;
  actorId: string | null;
  actorNickname: string | null;
};

type PointsResponse = {
  ok?: boolean;
  error?: string;
  total?: number;
  sums?: { count: number; amountIn: number; amountOut: number } | null;
  /** 칸별 합계 (충전·지급·사용·회수·보류 중) */
  buckets?: AdminPointBucketSums | null;
  promoOrderIdCapped?: boolean;
  rows?: LedgerRow[];
};

function actorLabel(r: LedgerRow, t: (key: MessageKey) => string): string {
  if (r.actorNickname) return r.actorNickname;
  if (r.actorType === "admin" || r.actorId) return t("admin_community_ptpage_actor_admin");
  if (r.actorType === "user") return t("admin_community_ptpage_actor_member");
  return t("admin_community_ptpage_actor_system");
}

export function AdminCommunityPointsPage() {
  const { t, language } = useI18n();
  const q = useCommunityListQuery({ extras: POINT_EXTRAS });
  const typeOptions = COMMUNITY_POINT_TYPE_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }));
  /** 쓰기(포인트 지급/회수) — 접근표 action perm("point"). 서버 가드는 그대로. */
  const action = useAdminRouteAction("/admin/community/points");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const type = q.query.extras.type;
  const userId = q.query.extras.userId;

  const { state, reload } = useCommunityAdminJson<PointsResponse>(`/api/admin/community/points?${q.apiParams().toString()}`);
  const rows = state.data?.rows ?? [];
  const total = state.status === "ok" ? Number(state.data.total ?? 0) : null;
  const sums = state.status === "ok" ? state.data.sums ?? null : null;
  const memberName = userId ? rows.find((r) => r.userId === userId)?.userNickname : null;

  return (
    <CommunityListShell
      title={t("admin_community_ptpage_title")}
      description={t("admin_community_ptpage_desc")}
      actions={
        <AdminActionButton
          variant="secondary"
          disabled={!action.allowed}
          title={action.allowed ? undefined : (action.reason ?? undefined)}
          onClick={() => {
            if (action.allowed) setAdjustOpen(true);
          }}
        >
          {t("admin_community_points_grant_revoke")}
        </AdminActionButton>
      }
      banner={
        <>
          {!action.allowed && action.reason ? (
            <p className="sam-text-helper text-sam-muted" data-admin-action-denied="1">
              {t("admin_community_ptpage_adjust_disabled", { reason: action.reason })}
            </p>
          ) : null}
          {state.status === "ok" ? (
            <div className="space-y-1">
              <p className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[13px] text-sam-fg">
                {sums
                  ? t("admin_community_ptpage_sums", {
                      count: formatAdminNumber(sums.count),
                      in: formatAdminNumber(sums.amountIn),
                      out: formatAdminNumber(Math.abs(sums.amountOut)),
                    })
                  : t("admin_community_ptpage_sums_unavailable")}
              </p>
              {state.data.buckets ? (
                <p className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[13px] text-sam-fg" data-admin-point-buckets="1">
                  {t("admin_community_ptpage_buckets", { line: formatAdminPointBucketLine(state.data.buckets, formatAdminNumber, language !== "en") })}
                </p>
              ) : null}
              {state.data.promoOrderIdCapped ? (
                <p className="text-[12px] text-sam-warning">{t("admin_community_ptpage_old_orders_note")}</p>
              ) : null}
            </div>
          ) : null}
        </>
      }
      filterBar={
        <CommunityFilterBar lq={q} showSearch={false} pending={state.status === "loading"}>
          <CommunityFilterField label={t("admin_community_ptpage_filter_type")}>
            <CommunitySelect value={type} onChange={(v) => q.setExtra("type", v)} options={typeOptions} />
          </CommunityFilterField>
          {userId ? (
            <CommunityFilterField label={t("admin_community_ptpage_filter_member")}>
              <span className="flex h-10 items-center gap-2 text-[13px] text-sam-fg">
                {memberName || t("admin_community_ptpage_selected_member")}
                <AdminActionButton variant="quiet" size="sm" className="h-auto! px-1!" onClick={() => q.setExtra("userId", "")}>
                  {t("admin_community_points_clear_member_filter")}
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
        emptyMessage={t("admin_community_ptpage_empty")}
        filteredEmptyMessage={t("admin_community_ptpage_filtered_empty")}
      >
        <CommunityTable head={[
          t("admin_community_ptpage_col_time"),
          t("admin_community_ptpage_col_member"),
          t("admin_community_ptpage_col_type"),
          t("admin_community_ptpage_col_points"),
          t("admin_community_ptpage_col_balance"),
          t("admin_community_ptpage_col_detail"),
          t("admin_community_ptpage_col_actor"),
        ]}>
          {rows.map((r) => {
            const amt = r.amount ?? 0;
            return (
              <tr key={r.id} className="border-b border-sam-border-soft">
                <td className={COMMUNITY_TD}>
                  <CommunityTimeCell iso={r.createdAt} absolute />
                </td>
                <td className={COMMUNITY_TD}>
                  {r.userId ? (
                    <span className="flex flex-col">
                      <Link
                        href={communityDetailHref(`/admin/community/members/${encodeURIComponent(r.userId)}`, q.selfHref)}
                        className="font-medium text-sam-info hover:underline"
                      >
                        {r.userNickname?.trim() || t("admin_community_ptpage_no_name")}
                      </Link>
                      {!userId ? (
                        <AdminActionButton
                          variant="ghost"
                          size="sm"
                          className="h-auto! justify-start! px-0! text-left"
                          onClick={() => q.setExtra("userId", r.userId ?? "")}
                        >
                          {t("admin_community_points_only_this_member")}
                        </AdminActionButton>
                      ) : null}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className={COMMUNITY_TD}>{communityPointTypeLabel(r.relatedType, r.entryType, language)}</td>
                <td className={`${COMMUNITY_TD} whitespace-nowrap font-semibold ${amt < 0 ? "text-sam-danger" : "text-sam-success"}`}>
                  {amt > 0 ? "+" : ""}
                  {formatAdminNumber(amt)} P
                </td>
                <td className={`${COMMUNITY_TD} whitespace-nowrap`}>{formatCommunityPoints(r.balanceAfter)}</td>
                <td className={`${COMMUNITY_TD} max-w-[22rem]`}>
                  {r.description || "—"}
                  <AdminTechDetails ko>
                    <div>ledger: {r.id}</div>
                    <div>
                      related: {r.relatedType ?? "—"} / {r.relatedId ?? "—"} · entry: {r.entryType ?? "—"}
                    </div>
                  </AdminTechDetails>
                </td>
                <td className={COMMUNITY_TD}>{actorLabel(r, t)}</td>
              </tr>
            );
          })}
        </CommunityTable>
      </CommunityListBody>

      {adjustOpen && action.allowed ? (
        <AdminFormSheet
          title={t("admin_community_ptpage_grant_title")}
          subtitle={t("admin_community_ptpage_grant_subtitle")}
          onClose={() => setAdjustOpen(false)}
        >
          <AdminPointAdjustPanel onChanged={reload} />
        </AdminFormSheet>
      ) : null}
    </CommunityListShell>
  );
}
