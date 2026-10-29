"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminResultBanner } from "@/components/admin/ui/AdminStateViews";
import { MemberOpsListBody } from "@/components/admin/member-ops/MemberOpsListBody";
import { useMemberOpsPagedFetch } from "@/lib/admin/member-ops-list/use-member-ops-paged-fetch";
import { ADMIN_LIST_QUERY_DEFAULT_SIZE, type AdminListPageSize } from "@/lib/admin/list-query/admin-list-query";
import { AdminStatusLabel } from "@/components/admin/ui/AdminStatusLabel";
import { AdminTechId } from "@/components/admin/ui/AdminTechId";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import {
  MEMBERS_DELETION_REQUEST_NS,
  membersOperatorErrorCode,
} from "@/lib/admin/status-labels/members-status-labels";
import { ADMIN_USERS_LITE_CARD } from "@/lib/ui/admin-users-lite-styles";

type QueueItem = {
  id: string;
  userId: string;
  status: string;
  reason: string | null;
  requestedAt: string;
  memberLoginId: string;
  memberNickname: string | null;
};

export function AdminDeletionRequestsQueue() {
  const { safeT, language } = useI18n();
  const ko = language !== "en";
  /** R7 — 서버 페이지(20/50/100 + 총 건수). 예전 30건 고정 조회(31건째부터 안 보임) 제거. 필터가 없어 쪽·크기만 화면 상태. */
  const [page, setPage] = useState(1);
  const [size, setSize] = useState<AdminListPageSize>(ADMIN_LIST_QUERY_DEFAULT_SIZE);
  const list = useMemberOpsPagedFetch<QueueItem>(
    `/api/admin/account-deletion-requests?status=open&limit=${size}&offset=${(page - 1) * size}`,
    "items"
  );
  const listError = list.error
    ? { code: membersOperatorErrorCode(list.error.code, "load_failed"), httpStatus: list.error.httpStatus }
    : null;
  const load = list.reload;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: true; message: string } | { ok: false; code: string } | null>(null);

  const reject = async (item: QueueItem) => {
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("reject"),
      ko,
      title: ko ? "삭제 요청 반려" : "Reject deletion request",
      description: ko
        ? `${item.memberNickname || item.memberLoginId} 회원의 삭제 요청을 반려합니다. 회원 계정은 유지됩니다.`
        : `Rejects the deletion request of ${item.memberNickname || item.memberLoginId}. The account stays active.`,
      confirmLabel: adminCta("reject", ko),
      reasonPlaceholder: ko ? "반려 사유" : "Reject reason",
    });
    if (!confirmed.ok) return;
    setBusyId(item.id);
    setResult(null);
    try {
      const res = await fetch("/api/admin/account-deletion-requests", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: item.id,
          action: "reject",
          adminNote: confirmed.reason?.trim() || "admin_rejected",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || data.ok === false) {
        setResult({ ok: false, code: membersOperatorErrorCode(data.error) });
        return;
      }
      setResult({ ok: true, message: ko ? "삭제 요청을 반려했습니다." : "Deletion request rejected." });
      load();
    } catch {
      setResult({ ok: false, code: "network_error" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className={`${ADMIN_USERS_LITE_CARD} space-y-2 p-4`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-sam-fg">
          {safeT("admin_users_deletion_queue_title", {
            fallbackKo: "회원 삭제 요청 대기",
            fallbackEn: "Pending deletion requests",
          })}
          {list.loaded ? (
            <span className="ml-2 font-normal tabular-nums text-sam-muted" data-admin-deletion-total="1">
              {ko ? `총 ${formatAdminNumber(list.total)}건` : `Total ${formatAdminNumber(list.total)}`}
            </span>
          ) : null}
        </h2>
        <AdminActionButton variant="secondary" size="sm" disabled={list.loading} onClick={load}>
          {adminCta("refresh", ko)}
        </AdminActionButton>
      </div>
      <AdminResultBanner ko={ko} result={result} onClose={() => setResult(null)} />
      <MemberOpsListBody
        ko={ko}
        loading={list.loading}
        loaded={list.loaded}
        error={listError}
        onRetry={load}
        rowCount={list.rows.length}
        total={list.total}
        page={page}
        size={size}
        onPageChange={setPage}
        onSizeChange={(n) => {
          setSize(n);
          setPage(1);
        }}
        showTotal={false}
        emptyMessage={safeT("admin_users_deletion_queue_empty", {
          fallbackKo: "대기 중인 삭제 요청이 없습니다.",
          fallbackEn: "No pending deletion requests.",
        })}
      >
        {/* 표준 표 — 회원 · 요청 일시 · 상태 · 요청 사유 · 처리 (행 안 CTA 2개) */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-left sam-text-body-secondary">
            <thead>
              <tr className="border-b border-sam-border text-left sam-text-xxs text-sam-muted">
                <th className="py-2 pr-2 font-medium">{ko ? "회원" : "Member"}</th>
                <th className="py-2 pr-2 font-medium">{ko ? "요청 일시" : "Requested"}</th>
                <th className="py-2 pr-2 font-medium">{ko ? "상태" : "Status"}</th>
                <th className="py-2 pr-2 font-medium">{ko ? "요청 사유" : "Reason"}</th>
                <th className="py-2 pr-2 font-medium">{ko ? "처리" : "Actions"}</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((item) => (
                <tr key={item.id} className="border-b border-sam-border/70 align-top text-[13px]">
                  <td className="py-2 pr-2">
                    <p className="font-semibold text-sam-fg">{item.memberNickname || item.memberLoginId}</p>
                    <p className="font-mono text-[12px] text-sam-muted">{item.memberLoginId}</p>
                    <AdminTechId id={item.id} />
                  </td>
                  <td className="whitespace-nowrap py-2 pr-2 tabular-nums text-[12px] text-sam-muted">
                    {formatAdminManilaDateTime(item.requestedAt)} PHT
                  </td>
                  <td className="py-2 pr-2">
                    <AdminStatusLabel namespace={MEMBERS_DELETION_REQUEST_NS} code={item.status} ko={ko} />
                  </td>
                  <td className="max-w-[16rem] break-words py-2 pr-2 text-[12px] text-sam-muted">{item.reason || "—"}</td>
                  <td className="py-2 pr-2">
                    <div className="flex flex-wrap gap-2">
                      <AdminActionLink
                        href={`/admin/users/${encodeURIComponent(item.userId)}?tab=ops`}
                        variant="ghost"
                        size="sm"
                      >
                        {safeT("admin_users_deletion_open_detail", {
                          fallbackKo: "상세에서 처리",
                          fallbackEn: "Process in detail",
                        })}
                      </AdminActionLink>
                      <AdminActionButton
                        variant="ghost"
                        size="sm"
                        disabled={busyId === item.id}
                        onClick={() => void reject(item)}
                      >
                        {adminCta("reject", ko)}
                      </AdminActionButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </MemberOpsListBody>
    </section>
  );
}
