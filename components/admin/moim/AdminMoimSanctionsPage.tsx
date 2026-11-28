"use client";

/**
 * 모임 제재 이력 (설계 moim §8 「제재 이력」) — 진행 중 · 7일 안 만료 · 만료 · 해제 · 전체.
 * R5 D2: 모임·콘텐츠·사용자 제재가 같이 보이고 대상 종류로 거른다. `?userId=` 로 들어오면 그 회원 제재만.
 * 「해제」는 모임 단위 제재에만 — 콘텐츠는 콘텐츠 탭에서 숨김 해제, 이용 제한은 회원 활동 제한 화면(계약 P14 · R5 D §1-3).
 */
import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  COMMUNITY_TD,
  CommunityFilterField,
  CommunityListBody,
  CommunityListPagination,
  CommunityListShell,
  CommunitySelect,
  CommunityTable,
  CommunityTabs,
  useCommunityListQuery,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { useCommunityAdminJson } from "@/components/admin/community/members/use-community-admin-data";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { MOIM_ADMIN_SANCTION_FILTERS, MOIM_ADMIN_SANCTION_KINDS, moimSanctionRowView } from "@/lib/admin/moim/moim-admin-contract";
import { MoimAdminPersonCell, MoimAdminTime, useMoimReasonLabel, useMoimSettleBanner } from "@/components/admin/moim/admin-moim-shared";
import {
  MoimSanctionActionCell,
  MoimSanctionRevokeSheet,
  MoimSanctionTargetCell,
  moimSanctionStateKey,
  type MoimSanctionRow,
} from "@/components/admin/moim/AdminMoimDetailPage";

type Row = MoimSanctionRow & { moim_id: string; moim: { name: string; status?: string } | null };
type ListResponse = { ok?: boolean; error?: string; total?: number; rows?: Row[] };

const EXTRAS = ["filter", "kind", "userId"] as const;

export function AdminMoimSanctionsPage() {
  const { t } = useI18n();
  const { label: reasonLabel } = useMoimReasonLabel();
  const q = useCommunityListQuery({ extras: EXTRAS });
  const filter = q.query.extras.filter || "active";
  const { state, reload } = useCommunityAdminJson<ListResponse>(`/api/admin/moim/sanctions?${q.apiParams({ period: false }).toString()}`);
  const rows = state.data?.rows ?? [];
  const total = state.status === "ok" ? Number(state.data.total ?? 0) : null;
  const [revoke, setRevoke] = useState<Row | null>(null);
  const { settle, node } = useMoimSettleBanner(reload);
  const userFilter = q.query.extras.userId;

  return (
    <CommunityListShell
      title={t("admin_moim_sanctions_title")}
      description={t("admin_moim_sanctions_desc")}
      banner={
        <div className="space-y-2">
          {node}
          {userFilter ? (
            <div className="flex items-center gap-2 text-[13px]" data-moim-sanctions-user-filter={userFilter}>
              <span>{t("admin_moim_sanction_user_only")}</span>
              <AdminActionButton size="sm" variant="quiet" onClick={() => q.setExtra("userId", "")}>
                {t("admin_moim_filter_clear")}
              </AdminActionButton>
            </div>
          ) : null}
        </div>
      }
      tabs={
        <CommunityTabs
          value={filter}
          onChange={(v) => q.setExtra("filter", v === "active" ? "" : v)}
          tabs={MOIM_ADMIN_SANCTION_FILTERS.map((f) => ({ value: f, label: t(`admin_moim_sanction_filter_${f}` as MessageKey) }))}
        />
      }
      filters={
        <CommunityFilterField label={t("admin_moim_sanction_kind_filter")}>
          <CommunitySelect
            value={q.query.extras.kind}
            onChange={(v) => q.setExtra("kind", v === "all" ? "" : v)}
            options={MOIM_ADMIN_SANCTION_KINDS.map((k) => ({
              value: k === "all" ? "" : k,
              label: k === "all" ? t("admin_moim_filter_any") : t(`admin_moim_sanction_kind_${k}` as MessageKey),
            }))}
          />
        </CommunityFilterField>
      }
      footer={<CommunityListPagination lq={q} total={total} disabled={state.status === "loading"} />}
    >
      <CommunityListBody state={state} empty={rows.length === 0} lq={q} onRetry={reload} emptyMessage={t("admin_moim_sanctions_empty")}>
        <CommunityTable
          head={[
            t("admin_moim_col_name"),
            t("admin_moim_col_kind"),
            t("admin_moim_col_target"),
            t("admin_moim_col_level"),
            t("admin_moim_col_reason"),
            t("admin_moim_col_period"),
            t("admin_moim_col_status"),
            t("admin_moim_col_actor"),
            t("admin_moim_col_actions"),
          ]}
        >
          {rows.map((r) => {
            const view = moimSanctionRowView(r, r.moim?.status ?? null);
            return (
              <tr key={r.id} className="border-b border-sam-border-soft align-top" data-moim-sanction-row={r.id} data-moim-sanction-kind={view.kind}>
                <td className={COMMUNITY_TD}>
                  <Link href={`/admin/community/moims/${encodeURIComponent(r.moim_id)}?tab=sanctions`} className="font-medium text-sam-info hover:underline">
                    {r.moim?.name ?? r.moim_id}
                  </Link>
                </td>
                <td className={COMMUNITY_TD}>{t(`admin_moim_sanction_kind_${view.kind}` as MessageKey)}</td>
                <td className={`${COMMUNITY_TD} max-w-[240px]`}>
                  <MoimSanctionTargetCell row={r} view={view} />
                </td>
                <td className={COMMUNITY_TD}>{t(`admin_moim_level_${r.level}` as MessageKey)}</td>
                <td className={`${COMMUNITY_TD} max-w-[300px]`}>
                  <div>{reasonLabel(r.reason_code)}</div>
                  <div className="whitespace-pre-wrap text-[12px] text-sam-muted [overflow-wrap:anywhere]">{r.reason}</div>
                </td>
                <td className={COMMUNITY_TD}>
                  <MoimAdminTime iso={r.starts_at} /> ~ {r.ends_at ? <MoimAdminTime iso={r.ends_at} /> : t("admin_moim_no_end")}
                </td>
                <td className={COMMUNITY_TD}>
                  {t(moimSanctionStateKey(view))}
                  {r.revoked_at ? (
                    <div className="text-[12px] text-sam-muted">
                      <MoimAdminTime iso={r.revoked_at} /> · {r.revoker?.nickname ?? "—"}
                    </div>
                  ) : null}
                </td>
                <td className={COMMUNITY_TD}>
                  <MoimAdminPersonCell person={r.actor} />
                </td>
                <td className={COMMUNITY_TD}>
                  <MoimSanctionActionCell row={r} view={view} moimId={r.moim_id} onRevoke={() => setRevoke(r)} />
                </td>
              </tr>
            );
          })}
        </CommunityTable>
      </CommunityListBody>
      {revoke ? (
        <MoimSanctionRevokeSheet
          sanction={revoke}
          moimName={revoke.moim?.name ?? revoke.moim_id}
          onClose={() => setRevoke(null)}
          onSettled={(k) => {
            setRevoke(null);
            settle(k);
          }}
        />
      ) : null}
    </CommunityListShell>
  );
}
