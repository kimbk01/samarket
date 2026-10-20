"use client";

import { useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  executeMemberManagementActionsBulk,
  summarizeBulkResults,
  type MemberManagementActionId,
  type MemberManagementActionResult,
} from "@/lib/admin-users/member-management-actions-client";
import type { AdminUser } from "@/lib/types/admin-user";
import { displayNameForAdminUser, publicIdForAdminUser } from "./admin-user-lite-display";
import { AdminTechId, formatAdminShortId } from "@/components/admin/ui/AdminTechId";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import { membersOperatorErrorCode } from "@/lib/admin/status-labels/members-status-labels";

const ACTIONS: { id: MemberManagementActionId; label: string; destructive?: boolean }[] = [
  { id: "suspend", label: "정지", destructive: true },
  { id: "block", label: "차단", destructive: true },
  { id: "unsuspend", label: "제재 해제" },
  { id: "unblock", label: "차단 해제" },
  { id: "withdraw", label: "탈퇴 처리", destructive: true },
  { id: "purge", label: "영구 삭제", destructive: true },
];

function actionLabel(action: MemberManagementActionId): string {
  return ACTIONS.find((a) => a.id === action)?.label ?? action;
}

function resultLine(r: MemberManagementActionResult, ko: boolean): string {
  if (r.ok) return ko ? "성공" : "Done";
  if (r.message) return r.message;
  return adminOperatorErrorMessage(membersOperatorErrorCode(r.error, "action_failed"), ko);
}

function isProtectedMember(user: AdminUser): boolean {
  return Boolean(user.isSuperAdmin || user.hasAdminMembership);
}

export function AdminMemberListBulkBar({
  selectedIds,
  users,
  onClear,
  onCompleted,
}: {
  selectedIds: readonly string[];
  users: readonly AdminUser[];
  onClear: () => void;
  onCompleted?: () => void;
}) {
  const { language } = useI18n();
  const ko = language !== "en";
  const [busy, setBusy] = useState(false);
  const [lastResults, setLastResults] = useState<MemberManagementActionResult[] | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const inFlight = useRef(false);

  const noticeBanner = notice ? (
    <div
      data-admin-result={notice.ok ? "success" : "error"}
      role={notice.ok ? "status" : "alert"}
      className={`flex items-start justify-between gap-3 border-b px-3 py-2 text-[13px] text-sam-fg ${
        notice.ok ? "border-sam-success bg-sam-success-soft" : "border-sam-danger bg-sam-danger-soft"
      }`}
    >
      <span className="whitespace-pre-wrap">{notice.text}</span>
      <AdminActionButton variant="quiet" size="sm" className="shrink-0" onClick={() => setNotice(null)}>
        {adminCta("close", ko)}
      </AdminActionButton>
    </div>
  ) : null;

  if (selectedIds.length === 0 && !lastResults) return noticeBanner;
  if (selectedIds.length === 0 && lastResults) {
    return (
      <div data-member-list-bulk-root="1">
        {noticeBanner}
        <div className="border-b border-sam-border bg-sam-surface-muted px-3 py-2" data-member-list-bulk-results="1">
          <p className="text-[12px] font-semibold text-sam-fg">최근 일괄 결과</p>
          <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap text-[12px] text-sam-muted">
            {summarizeBulkResults(lastResults)}
          </pre>
          <AdminActionButton variant="quiet" size="sm" className="mt-1" onClick={() => setLastResults(null)}>
            결과 닫기
          </AdminActionButton>
        </div>
      </div>
    );
  }

  const selectedUsers = users.filter((u) => selectedIds.includes(u.id));
  const protectedSelected = selectedUsers.filter(isProtectedMember);
  const actionable = selectedUsers.filter((u) => !isProtectedMember(u));
  const preview = selectedUsers
    .slice(0, 8)
    .map((u) => `${displayNameForAdminUser(u)} (${publicIdForAdminUser(u) || formatAdminShortId(u.id)})`)
    .join(", ");
  const more = selectedUsers.length > 8 ? ` 외 ${formatAdminNumber(selectedUsers.length - 8)}명` : "";

  const run = async (action: MemberManagementActionId) => {
    if (inFlight.current || busy) return;
    const meta = ACTIONS.find((a) => a.id === action);
    setNotice(null);
    if (actionable.length === 0) {
      setNotice({
        ok: false,
        text: "선택한 회원 중 실행 가능한 대상이 없습니다. 관리자·최고관리자는 보호됩니다.",
      });
      return;
    }

    const label = meta?.label ?? action;
    const retype = `${formatAdminNumber(actionable.length)}명 ${label}`;
    let descriptionLines: string[];
    if (action === "purge") {
      const impactLines: string[] = [];
      for (const u of actionable.slice(0, 10)) {
        try {
          const res = await fetch(`/api/admin/users/${encodeURIComponent(u.id)}/purge-preview`, {
            credentials: "include",
            cache: "no-store",
          });
          const data = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            purgeAllowed?: boolean;
            blockers?: string[];
            protectedTarget?: boolean;
          };
          const name = displayNameForAdminUser(u);
          if (!res.ok || !data.ok) {
            impactLines.push(`${name}: 영향 조회 실패`);
          } else if (data.protectedTarget) {
            impactLines.push(`${name}: 보호 대상`);
          } else if (!data.purgeAllowed) {
            impactLines.push(`${name}: 차단 ${(data.blockers ?? []).join(",") || "unknown"}`);
          } else {
            impactLines.push(`${name}: 삭제 가능`);
          }
        } catch {
          impactLines.push(`${displayNameForAdminUser(u)}: 영향 조회 오류`);
        }
      }
      descriptionLines = [
        `선택한 ${formatAdminNumber(actionable.length)}명을 영구 삭제합니다. 되돌릴 수 없습니다.`,
        protectedSelected.length ? `보호로 제외 ${formatAdminNumber(protectedSelected.length)}명` : "",
        "영향 미리보기:",
        ...impactLines,
      ];
    } else {
      descriptionLines = [
        `선택한 ${formatAdminNumber(actionable.length)}명에 「${label}」을(를) 실행합니다.`,
        protectedSelected.length ? `보호로 제외 ${formatAdminNumber(protectedSelected.length)}명` : "",
        `대상: ${preview}${more}`,
      ];
    }

    /** 일괄 처리 = L3 (사유 + 대상 재입력). */
    const confirmed = await confirmAdminAction({
      level: "L3",
      ko,
      title: `회원 일괄 ${label}`,
      description: descriptionLines.filter(Boolean).join("\n"),
      confirmLabel: label,
      destructive: Boolean(meta?.destructive),
      retypeValue: retype,
    });
    if (!confirmed.ok) return;

    let reason = `${action}_bulk_by_admin`;
    if (action === "purge") reason = "admin_permanent_delete";
    else if (action === "withdraw") reason = "admin_withdraw";
    else reason = confirmed.reason?.trim() || reason;

    inFlight.current = true;
    setBusy(true);
    try {
      const skipped: MemberManagementActionResult[] = protectedSelected.map((u) => ({
        userId: u.id,
        action,
        ok: false,
        error: "protected_admin_target",
        message: "관리자·최고관리자 보호로 제외",
      }));
      const bulk = await executeMemberManagementActionsBulk({
        userIds: actionable.map((u) => u.id),
        action,
        reason,
      });
      const results = [...bulk.results, ...skipped];
      setLastResults(results);
      setNotice({ ok: bulk.failureCount === 0 && skipped.length === 0, text: summarizeBulkResults(results) });
      if (bulk.successCount > 0) {
        onClear();
        onCompleted?.();
      }
    } catch {
      setNotice({ ok: false, text: adminOperatorErrorMessage("network_error", ko) });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="space-y-0" data-member-list-bulk-root="1">
      {noticeBanner}
      <div
        className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-sam-border bg-sam-surface px-3 py-2"
        data-member-list-bulk-bar="1"
        data-member-list-select-scope="current_page"
        data-member-list-bulk-busy={busy ? "1" : "0"}
      >
        <span className="text-[13px] font-semibold text-sam-fg">
          선택 {formatAdminNumber(selectedIds.length)}명
        </span>
        {protectedSelected.length > 0 ? (
          <span className="text-[12px] font-semibold text-sam-danger">
            보호 제외 예정 {formatAdminNumber(protectedSelected.length)}
          </span>
        ) : null}
        <span className="max-w-[420px] truncate text-[12px] text-sam-muted" title={`${preview}${more}`}>
          {preview}
          {more}
        </span>
        {ACTIONS.map((a) => (
          <AdminActionButton
            key={a.id}
            variant={a.id === "purge" ? "danger" : "secondary"}
            size="sm"
            disabled={busy}
            onClick={() => void run(a.id)}
            className={a.destructive && a.id !== "purge" ? "text-sam-danger" : undefined}
            data-member-bulk-action={a.id}
          >
            {a.label}
          </AdminActionButton>
        ))}
        <AdminActionButton variant="quiet" size="sm" disabled={busy} onClick={onClear} data-member-bulk-clear="1">
          선택 해제
        </AdminActionButton>
      </div>
      {lastResults ? (
        <div className="border-b border-sam-border bg-sam-surface-muted px-3 py-2" data-member-list-bulk-results="1">
          <p className="text-[12px] font-semibold text-sam-fg">최근 일괄 결과 (회원별)</p>
          <ul className="mt-1 max-h-32 space-y-0.5 overflow-auto text-[12px] text-sam-muted">
            {lastResults.map((r) => (
              <li key={`${r.userId}-${r.action}`} data-member-bulk-result={r.ok ? "ok" : "fail"}>
                <AdminTechId id={r.userId} /> · {actionLabel(r.action)} · {resultLine(r, ko)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
