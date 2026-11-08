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
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import { membersOperatorErrorCode } from "@/lib/admin/status-labels/members-status-labels";
import type { MessageKey } from "@/lib/i18n/messages";
import { translateBy } from "@/lib/i18n/translate-by";

const ACTIONS: { id: MemberManagementActionId; labelKey: MessageKey; destructive?: boolean }[] = [
  { id: "suspend", labelKey: "admin_users_member_bulk_suspend", destructive: true },
  { id: "block", labelKey: "admin_users_member_bulk_block", destructive: true },
  { id: "unsuspend", labelKey: "admin_users_member_bulk_unsuspend" },
  { id: "unblock", labelKey: "admin_users_member_bulk_unblock" },
  { id: "withdraw", labelKey: "admin_users_member_bulk_withdraw", destructive: true },
  { id: "purge", labelKey: "admin_users_member_bulk_purge", destructive: true },
];

function actionLabel(t: (key: MessageKey) => string, action: MemberManagementActionId): string {
  const key = ACTIONS.find((a) => a.id === action)?.labelKey;
  return key ? t(key) : action;
}

function resultLine(r: MemberManagementActionResult, ko: boolean): string {
  if (r.ok) return translateBy(ko ? "ko" : "en", "admin_users_done");
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
  const { t, language } = useI18n();
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
          <p className="text-[12px] font-semibold text-sam-fg">{t("admin_users_bulk_recent_results")}</p>
          <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap text-[12px] text-sam-muted">
            {summarizeBulkResults(lastResults)}
          </pre>
          <AdminActionButton variant="quiet" size="sm" className="mt-1" onClick={() => setLastResults(null)}>
            {t("admin_users_bulk_close_results")}
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
  const more =
    selectedUsers.length > 8 ? t("admin_users_member_bulk_more_members", { n: formatAdminNumber(selectedUsers.length - 8) }) : "";

  const run = async (action: MemberManagementActionId) => {
    if (inFlight.current || busy) return;
    const meta = ACTIONS.find((a) => a.id === action);
    setNotice(null);
    if (actionable.length === 0) {
      setNotice({
        ok: false,
        text: t("admin_users_member_bulk_no_actionable"),
      });
      return;
    }

    const label = meta ? t(meta.labelKey) : action;
    const retype = t("admin_users_member_bulk_retype", { n: formatAdminNumber(actionable.length), label });
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
            impactLines.push(t("admin_users_member_bulk_impact_lookup_failed", { name }));
          } else if (data.protectedTarget) {
            impactLines.push(t("admin_users_member_bulk_impact_protected", { name }));
          } else if (!data.purgeAllowed) {
            impactLines.push(t("admin_users_member_bulk_impact_blocked", { name, blockers: (data.blockers ?? []).join(",") || "unknown" }));
          } else {
            impactLines.push(t("admin_users_member_bulk_impact_deletable", { name }));
          }
        } catch {
          impactLines.push(t("admin_users_member_bulk_impact_lookup_error", { name: displayNameForAdminUser(u) }));
        }
      }
      descriptionLines = [
        t("admin_users_member_bulk_purge_description", { n: formatAdminNumber(actionable.length) }),
        protectedSelected.length ? t("admin_users_member_bulk_protected_excluded", { n: formatAdminNumber(protectedSelected.length) }) : "",
        t("admin_users_member_bulk_impact_preview"),
        ...impactLines,
      ];
    } else {
      descriptionLines = [
        t("admin_users_member_bulk_action_description", { n: formatAdminNumber(actionable.length), label }),
        protectedSelected.length ? t("admin_users_member_bulk_protected_excluded", { n: formatAdminNumber(protectedSelected.length) }) : "",
        t("admin_users_member_bulk_targets", { preview, more }),
      ];
    }

    /** 일괄 처리 = bulk(L3: 사유 + 대상 재입력). 사유는 모든 동작(탈퇴·영구 삭제 포함)의 API 본문 `reason` 으로 보낸다. */
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("bulk"),
      ko,
      title: t("admin_users_member_bulk_confirm_title", { label }),
      description: descriptionLines.filter(Boolean).join("\n"),
      confirmLabel: label,
      destructive: Boolean(meta?.destructive),
      retypeValue: retype,
    });
    if (!confirmed.ok) return;
    const reason = (confirmed.reason ?? "").trim();
    if (!reason) return;

    inFlight.current = true;
    setBusy(true);
    try {
      const skipped: MemberManagementActionResult[] = protectedSelected.map((u) => ({
        userId: u.id,
        action,
        ok: false,
        error: "protected_admin_target",
        message: t("admin_users_member_bulk_protected_skipped"),
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
            {t(a.labelKey)}
          </AdminActionButton>
        ))}
        <AdminActionButton variant="quiet" size="sm" disabled={busy} onClick={onClear} data-member-bulk-clear="1">
          {t("admin_users_bulk_clear_selection")}
        </AdminActionButton>
      </div>
      {lastResults ? (
        <div className="border-b border-sam-border bg-sam-surface-muted px-3 py-2" data-member-list-bulk-results="1">
          <p className="text-[12px] font-semibold text-sam-fg">{t("admin_users_bulk_recent_results_per_member")}</p>
          <ul className="mt-1 max-h-32 space-y-0.5 overflow-auto text-[12px] text-sam-muted">
            {lastResults.map((r) => (
              <li key={`${r.userId}-${r.action}`} data-member-bulk-result={r.ok ? "ok" : "fail"}>
                <AdminTechId id={r.userId} /> · {actionLabel(t, r.action)} · {resultLine(r, ko)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
