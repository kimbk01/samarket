"use client";

import type { MemberAdminActionDecision } from "@/lib/admin-users/member-admin-action-policy";
import { MEMBER_DETAIL_DANGER_ZONE_TITLE_KO } from "@/lib/admin-users/member-detail-presentation";
import { ADMIN_USERS_LITE_CARD } from "@/lib/ui/admin-users-lite-styles";

/**
 * P3 Danger Zone — structural separation only.
 * Visibility from P1 ActionPolicy. Destructive execution is not offered as primary header CTA.
 * P7 owns final moderation workflows; existing legacy handlers may be wired here later without
 * inventing new backends in P3.
 */
export function AdminMemberDangerZone({
  actions,
  onAction,
  busy = false,
}: {
  actions: readonly MemberAdminActionDecision[];
  /** Optional: only call for actions that remain supported by existing APIs and policy.enabled */
  onAction?: (id: MemberAdminActionDecision["id"]) => void;
  busy?: boolean;
}) {
  if (actions.length === 0) return null;

  return (
    <section
      className={`${ADMIN_USERS_LITE_CARD} space-y-3 border-[#fecdca] p-4`}
      data-member-detail-danger-zone="1"
      aria-labelledby="member-danger-zone-title"
    >
      <div>
        <h2 id="member-danger-zone-title" className="text-sm font-bold text-[#b42318]">
          {MEMBER_DETAIL_DANGER_ZONE_TITLE_KO}
        </h2>
        <p className="mt-1 text-[12px] text-[#667085]">
          계정 이용을 제한하거나 종료하는 작업입니다. 일반 정보 수정과 분리되어 있습니다.
        </p>
      </div>
      <ul className="space-y-2">
        {actions.map((action) => {
          const canRun = Boolean(onAction) && action.enabled;
          return (
            <li
              key={action.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#fecdca] bg-[#fef3f2] px-3 py-2"
              data-danger-action={action.id}
              data-danger-enabled={action.enabled ? "1" : "0"}
            >
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[#b42318]">{action.labelKo}</p>
                {!action.enabled && action.disabledReasonKo ? (
                  <p className="text-[11px] text-[#912018]">{action.disabledReasonKo}</p>
                ) : (
                  <p className="text-[11px] text-[#912018]">
                    {canRun
                      ? "실행 전 확인이 필요합니다."
                      : "제재·종료 워크플로에서 처리합니다. 목록/헤더 기본 작업이 아닙니다."}
                  </p>
                )}
              </div>
              {canRun ? (
                <button
                  type="button"
                  disabled={busy}
                  className="shrink-0 rounded-md border border-[#f04438] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#b42318] hover:bg-[#fff1f0] disabled:opacity-50"
                  onClick={() => onAction?.(action.id)}
                >
                  {action.labelKo}
                </button>
              ) : (
                <span className="shrink-0 rounded-md border border-[#fecdca] px-2 py-1 text-[11px] font-semibold text-[#912018]">
                  표시만
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
