"use client";

/**
 * 모임 제재 이력 (설계 moim §8 「제재 이력」) — 진행 중 · 7일 안 만료 · 만료 · 해제 · 전체. 진행 중 제재 해제(사유 필수).
 */
import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  COMMUNITY_TD,
  CommunityListBody,
  CommunityListPagination,
  CommunityListShell,
  CommunityTable,
  CommunityTabs,
  useCommunityListQuery,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { useCommunityAdminJson } from "@/components/admin/community/members/use-community-admin-data";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { MOIM_ADMIN_SANCTION_FILTERS, type MoimAdminPerson } from "@/lib/admin/moim/moim-admin-contract";
import { MoimAdminPersonCell, MoimAdminTime, moimReasonCodeLabel, useMoimSettleBanner } from "@/components/admin/moim/admin-moim-shared";
import { MoimSanctionRevokeSheet, sanctionStateKey } from "@/components/admin/moim/AdminMoimDetailPage";

type Row = {
  id: string;
  moim_id: string;
  level: string;
  reason_code: string;
  reason: string;
  starts_at: string;
  ends_at: string | null;
  revoked_at: string | null;
  created_at: string;
  moim: { name: string } | null;
  actor: MoimAdminPerson | null;
  revoker: MoimAdminPerson | null;
};
type ListResponse = { ok?: boolean; error?: string; total?: number; rows?: Row[] };

const EXTRAS = ["filter"] as const;

export function AdminMoimSanctionsPage() {
  const { t } = useI18n();
  const q = useCommunityListQuery({ extras: EXTRAS });
  const filter = q.query.extras.filter || "active";
  const { state, reload } = useCommunityAdminJson<ListResponse>(`/api/admin/moim/sanctions?${q.apiParams({ period: false }).toString()}`);
  const rows = state.data?.rows ?? [];
  const total = state.status === "ok" ? Number(state.data.total ?? 0) : null;
  const [revoke, setRevoke] = useState<Row | null>(null);
  const { settle, node } = useMoimSettleBanner(reload);

  return (
    <CommunityListShell
      title={t("admin_moim_sanctions_title")}
      description={t("admin_moim_sanctions_desc")}
      banner={node}
      tabs={
        <CommunityTabs
          value={filter}
          onChange={(v) => q.setExtra("filter", v === "active" ? "" : v)}
          tabs={MOIM_ADMIN_SANCTION_FILTERS.map((f) => ({ value: f, label: t(`admin_moim_sanction_filter_${f}` as MessageKey) }))}
        />
      }
      footer={<CommunityListPagination lq={q} total={total} disabled={state.status === "loading"} />}
    >
      <CommunityListBody state={state} empty={rows.length === 0} lq={q} onRetry={reload} emptyMessage={t("admin_moim_sanctions_empty")}>
        <CommunityTable
          head={[
            t("admin_moim_col_name"),
            t("admin_moim_col_level"),
            t("admin_moim_col_reason"),
            t("admin_moim_col_period"),
            t("admin_moim_col_status"),
            t("admin_moim_col_actor"),
            t("admin_moim_col_actions"),
          ]}
        >
          {rows.map((r) => {
            const stateKey = sanctionStateKey(r);
            return (
              <tr key={r.id} className="border-b border-sam-border-soft align-top">
                <td className={COMMUNITY_TD}>
                  <Link href={`/admin/community/moims/${encodeURIComponent(r.moim_id)}?tab=sanctions`} className="font-medium text-sam-info hover:underline">
                    {r.moim?.name ?? r.moim_id}
                  </Link>
                </td>
                <td className={COMMUNITY_TD}>{t(`admin_moim_level_${r.level}` as MessageKey)}</td>
                <td className={`${COMMUNITY_TD} max-w-[300px]`}>
                  <div>{moimReasonCodeLabel(t, r.reason_code)}</div>
                  <div className="whitespace-pre-wrap text-[12px] text-sam-muted [overflow-wrap:anywhere]">{r.reason}</div>
                </td>
                <td className={COMMUNITY_TD}>
                  <MoimAdminTime iso={r.starts_at} /> ~ {r.ends_at ? <MoimAdminTime iso={r.ends_at} /> : t("admin_moim_no_end")}
                </td>
                <td className={COMMUNITY_TD}>
                  {t(stateKey)}
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
                  {stateKey === "admin_moim_sanction_state_active" ? (
                    <AdminActionButton size="sm" variant="secondary" onClick={() => setRevoke(r)}>
                      {t("admin_moim_sanction_revoke")}
                    </AdminActionButton>
                  ) : null}
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
