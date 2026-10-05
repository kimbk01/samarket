"use client";

import { useRef, useState } from "react";
import { dibayAlert, dibayConfirm, dibayPrompt } from "@/components/ui/dibay-overlay";
import {
  executeMemberManagementActionsBulk,
  summarizeBulkResults,
  type MemberManagementActionId,
  type MemberManagementActionResult,
} from "@/lib/admin-users/member-management-actions-client";
import type { AdminUser } from "@/lib/types/admin-user";
import { displayNameForAdminUser, publicIdForAdminUser } from "./admin-user-lite-display";

const ACTIONS: { id: MemberManagementActionId; label: string; destructive?: boolean }[] = [
  { id: "suspend", label: "정지", destructive: true },
  { id: "block", label: "차단", destructive: true },
  { id: "unsuspend", label: "제재 해제" },
  { id: "unblock", label: "차단 해제" },
  { id: "withdraw", label: "탈퇴 처리", destructive: true },
  { id: "purge", label: "영구 삭제", destructive: true },
];

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
  const [busy, setBusy] = useState(false);
  const [lastResults, setLastResults] = useState<MemberManagementActionResult[] | null>(null);
  const inFlight = useRef(false);

  if (selectedIds.length === 0 && !lastResults) return null;
  if (selectedIds.length === 0 && lastResults) {
    return (
      <div className="border-b border-[#e4e7ec] bg-[#f8fafc] px-3 py-2" data-member-list-bulk-results="1">
        <p className="text-[12px] font-semibold text-[#344054]">최근 일괄 결과</p>
        <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap text-[11px] text-[#475467]">
          {summarizeBulkResults(lastResults)}
        </pre>
        <button
          type="button"
          className="mt-1 text-[11px] font-semibold text-[#667085] underline"
          onClick={() => setLastResults(null)}
        >
          결과 닫기
        </button>
      </div>
    );
  }

  const selectedUsers = users.filter((u) => selectedIds.includes(u.id));
  const protectedSelected = selectedUsers.filter(isProtectedMember);
  const actionable = selectedUsers.filter((u) => !isProtectedMember(u));
  const preview = selectedUsers
    .slice(0, 8)
    .map((u) => `${displayNameForAdminUser(u)} (${publicIdForAdminUser(u) || u.id.slice(0, 8)})`)
    .join(", ");
  const more = selectedUsers.length > 8 ? ` 외 ${selectedUsers.length - 8}명` : "";

  const run = async (action: MemberManagementActionId) => {
    if (inFlight.current || busy) return;
    const meta = ACTIONS.find((a) => a.id === action);
    if (actionable.length === 0) {
      await dibayAlert({
        title: "선택한 회원 중 실행 가능한 대상이 없습니다. 관리자·최고관리자는 보호됩니다.",
      });
      return;
    }

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
          const label = displayNameForAdminUser(u);
          if (!res.ok || !data.ok) {
            impactLines.push(`${label}: 영향 조회 실패`);
          } else if (data.protectedTarget) {
            impactLines.push(`${label}: 보호 대상`);
          } else if (!data.purgeAllowed) {
            impactLines.push(`${label}: 차단 ${ (data.blockers ?? []).join(",") || "unknown" }`);
          } else {
            impactLines.push(`${label}: 삭제 가능`);
          }
        } catch {
          impactLines.push(`${displayNameForAdminUser(u)}: 영향 조회 오류`);
        }
      }
      const confirmed = await dibayConfirm({
        title: [
          `선택한 ${actionable.length}명을 영구 삭제할까요? 되돌릴 수 없습니다.`,
          protectedSelected.length ? `보호로 제외 ${protectedSelected.length}명` : "",
          "영향 미리보기:",
          ...impactLines,
        ]
          .filter(Boolean)
          .join("\n"),
        confirmTone: "destructive",
      });
      if (!confirmed) return;
    } else {
      const confirmed = await dibayConfirm({
        title: [
          `선택한 ${actionable.length}명에 「${meta?.label ?? action}」을(를) 실행할까요?`,
          protectedSelected.length ? `보호로 제외 ${protectedSelected.length}명` : "",
          `대상: ${preview}${more}`,
        ]
          .filter(Boolean)
          .join("\n"),
        confirmTone: meta?.destructive ? "destructive" : "primary",
      });
      if (!confirmed) return;
    }

    let reason = `${action}_bulk_by_admin`;
    if (action === "purge") reason = "admin_permanent_delete";
    else if (action === "withdraw") reason = "admin_withdraw";
    else {
      const prompted = await dibayPrompt({
        title: "처리 사유를 입력해 주세요.",
        required: true,
      });
      if (!prompted?.trim()) return;
      reason = prompted.trim();
    }

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
      await dibayAlert({ title: summarizeBulkResults(results) });
      if (bulk.successCount > 0) {
        onClear();
        onCompleted?.();
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="space-y-0" data-member-list-bulk-root="1">
      <div
        className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-[#e4e7ec] bg-white px-3 py-2"
        data-member-list-bulk-bar="1"
        data-member-list-select-scope="current_page"
        data-member-list-bulk-busy={busy ? "1" : "0"}
      >
        <span className="text-[13px] font-semibold text-[#101828]">선택 {selectedIds.length}명</span>
        {protectedSelected.length > 0 ? (
          <span className="text-[11px] font-semibold text-[#b42318]">
            보호 제외 예정 {protectedSelected.length}
          </span>
        ) : null}
        <span className="max-w-[420px] truncate text-[11px] text-[#667085]" title={`${preview}${more}`}>
          {preview}
          {more}
        </span>
        {ACTIONS.map((a) => (
          <button
            key={a.id}
            type="button"
            disabled={busy}
            onClick={() => void run(a.id)}
            className={
              a.destructive
                ? "rounded-md border border-[#fecdca] bg-[#fef3f2] px-2.5 py-1.5 text-[12px] font-semibold text-[#b42318] disabled:opacity-50"
                : "rounded-md border border-[#d0d5dd] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#344054] disabled:opacity-50"
            }
            data-member-bulk-action={a.id}
          >
            {a.label}
          </button>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={onClear}
          className="rounded-md px-2.5 py-1.5 text-[12px] font-semibold text-[#667085] hover:bg-[#f2f4f7]"
          data-member-bulk-clear="1"
        >
          선택 해제
        </button>
      </div>
      {lastResults ? (
        <div className="border-b border-[#e4e7ec] bg-[#f8fafc] px-3 py-2" data-member-list-bulk-results="1">
          <p className="text-[12px] font-semibold text-[#344054]">최근 일괄 결과 (회원별)</p>
          <ul className="mt-1 max-h-32 space-y-0.5 overflow-auto text-[11px] text-[#475467]">
            {lastResults.map((r) => (
              <li key={`${r.userId}-${r.action}`} data-member-bulk-result={r.ok ? "ok" : "fail"}>
                {r.userId.slice(0, 8)}… · {r.action} · {r.ok ? "성공" : r.message ?? r.error ?? "실패"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
