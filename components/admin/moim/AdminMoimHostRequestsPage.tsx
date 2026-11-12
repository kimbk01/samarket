"use client";

/**
 * 모임장 변경 요청 큐 (설계 moim §6 P8 · §8) — 미접속 위임 요청: 모임장 마지막 접속 · 요청자 · 후보 → 승인(지정) / 거절 (사유 필수).
 * 승인 시 서버가 모임장 최근 7일 접속을 다시 확인한다(접속했으면 거부). 승인 → 전체 멤버 알림 · 요청자에게 결과 알림.
 */
import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  COMMUNITY_TD,
  CommunityActionSheet,
  CommunityListBody,
  CommunityListPagination,
  CommunityListShell,
  CommunityTable,
  CommunityTabs,
  useCommunityListQuery,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { useCommunityAdminJson } from "@/components/admin/community/members/use-community-admin-data";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { MOIM_ADMIN_HOST_REQUEST_STATUSES, type MoimAdminPerson } from "@/lib/admin/moim/moim-admin-contract";
import {
  MOIM_ADMIN_REASON,
  MoimAdminPersonCell,
  MoimAdminTime,
  moimAdminSend,
  moimRoleKey,
  useMoimSettleBanner,
} from "@/components/admin/moim/admin-moim-shared";

type MemberRef = { nickname: string; role: string; status: string } | null;
type Row = {
  id: string;
  moim_id: string;
  status: string;
  reason: string | null;
  created_at: string;
  decided_at: string | null;
  moim: { name: string; status: string; platformState: string } | null;
  host: MoimAdminPerson | null;
  hostMember: MemberRef;
  candidate: MoimAdminPerson | null;
  candidateMember: MemberRef;
  requester: MoimAdminPerson | null;
  requesterMember: MemberRef;
};
type ListResponse = { ok?: boolean; error?: string; total?: number; rows?: Row[] };

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.now() - Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 86_400_000) : null;
}

export function AdminMoimHostRequestsPage() {
  const { t } = useI18n();
  const q = useCommunityListQuery({ statuses: MOIM_ADMIN_HOST_REQUEST_STATUSES, defaults: { status: "requested" }, keepOnReset: { status: true } });
  const status = q.query.status || "requested";
  const { state, reload } = useCommunityAdminJson<ListResponse>(`/api/admin/moim/host-requests?${q.apiParams({ period: false }).toString()}`);
  const rows = state.data?.rows ?? [];
  const total = state.status === "ok" ? Number(state.data.total ?? 0) : null;
  const [decide, setDecide] = useState<{ row: Row; approve: boolean } | null>(null);
  const { settle, node } = useMoimSettleBanner(reload);

  const memberLabel = (p: MoimAdminPerson | null, m: MemberRef) => (
    <div>
      <MoimAdminPersonCell person={p} moimNickname={m?.nickname ?? null} />
      {m ? <div className="text-[12px] text-sam-muted">{t(moimRoleKey(m.role))}</div> : null}
    </div>
  );

  return (
    <CommunityListShell
      title={t("admin_moim_host_requests_title")}
      description={t("admin_moim_host_requests_desc")}
      banner={node}
      tabs={
        <CommunityTabs
          value={status}
          onChange={q.setStatus}
          tabs={MOIM_ADMIN_HOST_REQUEST_STATUSES.map((s) => ({ value: s, label: t(`admin_moim_host_request_status_${s}` as MessageKey) }))}
        />
      }
      footer={<CommunityListPagination lq={q} total={total} disabled={state.status === "loading"} />}
    >
      <CommunityListBody state={state} empty={rows.length === 0} lq={q} onRetry={reload} emptyMessage={t("admin_moim_host_requests_empty")}>
        <CommunityTable
          head={[
            t("admin_moim_col_name"),
            t("admin_moim_col_host"),
            t("admin_moim_col_host_last_login"),
            t("admin_moim_col_requester"),
            t("admin_moim_col_candidate"),
            t("admin_moim_col_requested_at"),
            t("admin_moim_col_actions"),
          ]}
        >
          {rows.map((r) => {
            const days = daysSince(r.host?.lastLoginAt);
            return (
              <tr key={r.id} className="border-b border-sam-border-soft align-top">
                <td className={COMMUNITY_TD}>
                  <Link href={`/admin/community/moims/${encodeURIComponent(r.moim_id)}`} className="font-medium text-sam-info hover:underline">
                    {r.moim?.name ?? r.moim_id}
                  </Link>
                  {r.reason ? <div className="whitespace-pre-wrap text-[12px] text-sam-muted [overflow-wrap:anywhere]">{r.reason}</div> : null}
                </td>
                <td className={COMMUNITY_TD}>{memberLabel(r.host, r.hostMember)}</td>
                <td className={COMMUNITY_TD}>
                  {r.host?.lastLoginAt ? (
                    <>
                      <MoimAdminTime iso={r.host.lastLoginAt} />
                      {days != null ? (
                        <div className={`text-[12px] ${days < 7 ? "text-sam-danger" : "text-sam-muted"}`}>{t("admin_moim_days_ago", { n: days })}</div>
                      ) : null}
                    </>
                  ) : (
                    t("admin_moim_never_logged_in")
                  )}
                </td>
                <td className={COMMUNITY_TD}>{memberLabel(r.requester, r.requesterMember)}</td>
                <td className={COMMUNITY_TD}>{memberLabel(r.candidate, r.candidateMember)}</td>
                <td className={COMMUNITY_TD}>
                  <MoimAdminTime iso={r.created_at} />
                  {r.status !== "requested" ? (
                    <div className="text-[12px] text-sam-muted">
                      {t(`admin_moim_host_request_status_${r.status}` as MessageKey)} · <MoimAdminTime iso={r.decided_at} />
                    </div>
                  ) : null}
                </td>
                <td className={COMMUNITY_TD}>
                  {r.status === "requested" ? (
                    <div className="flex flex-wrap gap-1">
                      <AdminActionButton size="sm" variant="primary" onClick={() => setDecide({ row: r, approve: true })}>
                        {t("admin_moim_host_request_approve")}
                      </AdminActionButton>
                      <AdminActionButton size="sm" variant="secondary" onClick={() => setDecide({ row: r, approve: false })}>
                        {t("admin_moim_host_request_decline")}
                      </AdminActionButton>
                    </div>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </CommunityTable>
      </CommunityListBody>
      {decide ? (
        <CommunityActionSheet
          title={t(decide.approve ? "admin_moim_host_request_approve" : "admin_moim_host_request_decline")}
          rows={[
            { label: t("admin_moim_col_name"), value: decide.row.moim?.name ?? decide.row.moim_id },
            { label: t("admin_moim_col_host"), value: decide.row.hostMember?.nickname ?? decide.row.host?.nickname ?? "—" },
            { label: t("admin_moim_col_candidate"), value: decide.row.candidateMember?.nickname ?? decide.row.candidate?.nickname ?? "—" },
          ]}
          notice={t(decide.approve ? "admin_moim_host_request_approve_notice" : "admin_moim_host_request_decline_notice")}
          reason={MOIM_ADMIN_REASON}
          confirmLabel={t(decide.approve ? "admin_moim_host_request_approve" : "admin_moim_host_request_decline")}
          onSubmit={(reason) => moimAdminSend(`/api/admin/moim/host-requests/${encodeURIComponent(decide.row.id)}`, { approve: decide.approve, reason }, t)}
          onClose={() => setDecide(null)}
          onSettled={(k) => {
            setDecide(null);
            settle(k);
          }}
        />
      ) : null}
    </CommunityListShell>
  );
}
