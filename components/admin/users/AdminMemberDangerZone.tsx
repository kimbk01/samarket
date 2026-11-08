"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MemberAdminActionDecision } from "@/lib/admin-users/member-admin-action-policy";
import { MEMBER_DETAIL_DANGER_ZONE_TITLE_KEY } from "@/lib/admin-users/member-detail-presentation";
import {
  MEMBER_DETAIL_DANGER_EXECUTION_DEFERRED_KO,
  MEMBER_DETAIL_DANGER_GROUP_LABEL_KO,
  MEMBER_DETAIL_DANGER_GROUP_ORDER,
  groupMemberDetailDangerActions,
} from "@/lib/admin-users/member-detail-control-center-ia";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { ADMIN_USERS_LITE_CARD } from "@/lib/ui/admin-users-lite-styles";

/**
 * R3 Danger Zone — FINAL structure / eligibility shell.
 * ActionPolicy drives visibility. Executable moderation/delete = R7.
 * Never placeholder-only chrome. Never fake clickable when execution is deferred.
 */
export function AdminMemberDangerZone({
  actions,
  onAction,
  busy = false,
}: {
  actions: readonly MemberAdminActionDecision[];
  /** Optional: only when a safe existing API remains wired and policy.enabled */
  onAction?: (id: MemberAdminActionDecision["id"]) => void;
  busy?: boolean;
}) {
  const { t } = useI18n();
  if (actions.length === 0) return null;

  const grouped = groupMemberDetailDangerActions(actions);

  return (
    <section
      className={`${ADMIN_USERS_LITE_CARD} space-y-4 border-sam-danger/30 p-4`}
      data-member-detail-danger-zone="1"
      aria-labelledby="member-danger-zone-title"
    >
      <div>
        <h2 id="member-danger-zone-title" className="text-sm font-bold text-sam-danger">
          {t(MEMBER_DETAIL_DANGER_ZONE_TITLE_KEY)}
        </h2>
        <p className="mt-1 text-xs text-sam-muted">
          {t("admin_users_danger_zone_desc")}
        </p>
      </div>
      {MEMBER_DETAIL_DANGER_GROUP_ORDER.map((groupId) => {
        const rows = grouped[groupId];
        if (rows.length === 0) return null;
        return (
          <div key={groupId} className="space-y-2" data-danger-group={groupId}>
            <h3 className="text-xs font-semibold text-sam-danger">
              {MEMBER_DETAIL_DANGER_GROUP_LABEL_KO[groupId]}
            </h3>
            <ul className="space-y-2">
              {rows.map((action) => {
                const canRun = Boolean(onAction) && action.enabled;
                return (
                  <li
                    key={action.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-ui-rect border border-sam-danger/30 bg-sam-danger-soft px-3 py-2"
                    data-danger-action={action.id}
                    data-danger-enabled={action.enabled ? "1" : "0"}
                    data-danger-execution={canRun ? "live" : "deferred-r7"}
                    data-member-cta-cap={
                      action.id === "suspend"
                        ? "CAP-SUSPEND"
                        : action.id === "unsuspend"
                          ? "CAP-UNSUSPEND"
                          : action.id === "block"
                            ? "CAP-BLOCK"
                            : action.id === "unblock"
                              ? "CAP-UNBLOCK"
                              : action.id === "withdraw"
                                ? "CAP-WITHDRAW"
                                : action.id === "purge"
                                  ? "CAP-PURGE"
                                  : undefined
                    }
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-sam-danger">{action.labelKo}</p>
                      {!action.enabled ? (
                        <p className="text-xs text-sam-danger">
                          {action.disabledReasonKo || t("admin_users_member_danger_not_runnable")}
                        </p>
                      ) : (
                        <p className="text-xs text-sam-danger">
                          {canRun
                            ? t("admin_users_member_danger_confirm_required")
                            : t("admin_users_member_danger_not_header_action")}
                        </p>
                      )}
                    </div>
                    {canRun ? (
                      <AdminActionButton
                        variant="danger"
                        size="sm"
                        disabled={busy}
                        onClick={() => onAction?.(action.id)}
                      >
                        {action.labelKo}
                      </AdminActionButton>
                    ) : action.enabled ? (
                      <span
                        className="shrink-0 rounded-ui-rect border border-sam-danger/30 px-2 py-1 text-xs font-semibold text-sam-danger"
                        data-danger-status="deferred"
                      >
                        {MEMBER_DETAIL_DANGER_EXECUTION_DEFERRED_KO}
                      </span>
                    ) : (
                      <span
                        className="shrink-0 rounded-ui-rect border border-sam-border bg-sam-surface-muted px-2 py-1 text-xs font-semibold text-sam-muted"
                        data-danger-status="blocked"
                      >
                        {t("admin_users_danger_zone_unavailable")}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
