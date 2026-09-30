"use client";

import type { MemberAdminActionDecision } from "@/lib/admin-users/member-admin-action-policy";
import { MEMBER_DETAIL_DANGER_ZONE_TITLE_KO } from "@/lib/admin-users/member-detail-presentation";
import {
  MEMBER_DETAIL_DANGER_EXECUTION_DEFERRED_KO,
  MEMBER_DETAIL_DANGER_GROUP_LABEL_KO,
  MEMBER_DETAIL_DANGER_GROUP_ORDER,
  groupMemberDetailDangerActions,
} from "@/lib/admin-users/member-detail-control-center-ia";
import { memberAdminCtaClass } from "@/lib/admin-users/member-admin-visual-ssot";
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
  if (actions.length === 0) return null;

  const grouped = groupMemberDetailDangerActions(actions);

  return (
    <section
      className={`${ADMIN_USERS_LITE_CARD} space-y-4 border-[color:var(--sam-danger,#fecdca)] p-4`}
      data-member-detail-danger-zone="1"
      aria-labelledby="member-danger-zone-title"
    >
      <div>
        <h2 id="member-danger-zone-title" className="text-sm font-bold text-[color:var(--sam-danger,#b42318)]">
          {MEMBER_DETAIL_DANGER_ZONE_TITLE_KO}
        </h2>
        <p className="mt-1 text-xs text-sam-muted">
          계정 이용을 제한하거나 종료하는 작업입니다. 일반 정보 수정과 분리되어 있습니다.
        </p>
      </div>
      {MEMBER_DETAIL_DANGER_GROUP_ORDER.map((groupId) => {
        const rows = grouped[groupId];
        if (rows.length === 0) return null;
        return (
          <div key={groupId} className="space-y-2" data-danger-group={groupId}>
            <h3 className="text-xs font-semibold text-[color:var(--sam-danger,#912018)]">
              {MEMBER_DETAIL_DANGER_GROUP_LABEL_KO[groupId]}
            </h3>
            <ul className="space-y-2">
              {rows.map((action) => {
                const canRun = Boolean(onAction) && action.enabled;
                return (
                  <li
                    key={action.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-ui-rect border border-[color:var(--sam-danger,#fecdca)] bg-[#fef3f2] px-3 py-2"
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
                      <p className="text-sm font-semibold text-[color:var(--sam-danger,#b42318)]">{action.labelKo}</p>
                      {!action.enabled && action.disabledReasonKo ? (
                        <p className="text-xs text-[color:var(--sam-danger,#912018)]">{action.disabledReasonKo}</p>
                      ) : (
                        <p className="text-xs text-[color:var(--sam-danger,#912018)]">
                          {canRun
                            ? "실행 전 확인이 필요합니다."
                            : "헤더 기본 작업이 아닙니다. 최종 실행은 제재 워크플로에서 처리합니다."}
                        </p>
                      )}
                    </div>
                    {canRun ? (
                      <button
                        type="button"
                        disabled={busy}
                        className={memberAdminCtaClass("danger")}
                        onClick={() => onAction?.(action.id)}
                      >
                        {action.labelKo}
                      </button>
                    ) : (
                      <span
                        className="shrink-0 rounded-ui-rect border border-[color:var(--sam-danger,#fecdca)] px-2 py-1 text-xs font-semibold text-[color:var(--sam-danger,#912018)]"
                        data-danger-status="deferred"
                      >
                        {MEMBER_DETAIL_DANGER_EXECUTION_DEFERRED_KO}
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
