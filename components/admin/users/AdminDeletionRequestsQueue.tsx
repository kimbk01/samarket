"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
} from "@/components/admin/ui/AdminStateViews";
import { AdminStatusLabel } from "@/components/admin/ui/AdminStatusLabel";
import { AdminTechId } from "@/components/admin/ui/AdminTechId";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
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
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; code: string; httpStatus?: number }
    | { kind: "ok"; items: QueueItem[]; total: number }
  >({ kind: "loading" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: true; message: string } | { ok: false; code: string } | null>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/admin/account-deletion-requests?status=open&limit=30", {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        items?: QueueItem[];
        total?: number;
        error?: string;
      };
      if (!res.ok || data.ok === false) {
        setState({ kind: "error", code: membersOperatorErrorCode(data.error, "load_failed"), httpStatus: res.status });
        return;
      }
      const items = Array.isArray(data.items) ? data.items : [];
      setState({ kind: "ok", items, total: typeof data.total === "number" ? data.total : items.length });
    } catch {
      setState({ kind: "error", code: "network_error" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reject = async (item: QueueItem) => {
    const confirmed = await confirmAdminAction({
      level: "L2",
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
      await load();
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
          {state.kind === "ok" ? (
            <span className="ml-2 font-normal tabular-nums text-sam-muted" data-admin-deletion-total="1">
              {ko ? `총 ${formatAdminNumber(state.total)}건` : `Total ${formatAdminNumber(state.total)}`}
            </span>
          ) : null}
        </h2>
        <AdminActionButton variant="secondary" size="sm" disabled={state.kind === "loading"} onClick={() => void load()}>
          {adminCta("refresh", ko)}
        </AdminActionButton>
      </div>
      <AdminResultBanner ko={ko} result={result} onClose={() => setResult(null)} />
      {state.kind === "loading" ? (
        <AdminLoadingState ko={ko} />
      ) : state.kind === "error" ? (
        <AdminErrorState ko={ko} code={state.code} httpStatus={state.httpStatus} onRetry={() => void load()} />
      ) : state.items.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={safeT("admin_users_deletion_queue_empty", {
            fallbackKo: "대기 중인 삭제 요청이 없습니다.",
            fallbackEn: "No pending deletion requests.",
          })}
        />
      ) : (
        <ul className="divide-y divide-sam-border-soft">
          {state.items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]">
              <div className="min-w-0">
                <p className="font-semibold text-sam-fg">
                  {item.memberNickname || item.memberLoginId}
                  <span className="ml-2 font-mono text-[12px] font-normal text-sam-muted">
                    {item.memberLoginId}
                  </span>
                </p>
                <p className="flex flex-wrap items-center gap-2 tabular-nums text-[12px] text-sam-muted">
                  <span>{formatAdminManilaDateTime(item.requestedAt)} PHT</span>
                  <AdminStatusLabel namespace={MEMBERS_DELETION_REQUEST_NS} code={item.status} ko={ko} />
                  <AdminTechId id={item.id} />
                </p>
                {item.reason ? (
                  <p className="text-[12px] text-sam-muted">
                    {ko ? "요청 사유" : "Reason"}: {item.reason}
                  </p>
                ) : null}
              </div>
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
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
