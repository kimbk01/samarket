/**
 * Member Admin ActionPolicy — single authority for operator-visible/enabled actions (P1).
 * Do not encode this matrix separately in each component.
 */

import { MEMBER_ADMIN_COPY } from "@/lib/admin-users/member-admin-copy-ssot";

export type MemberAdminLifecycleState =
  | "ACTIVE"
  | "SUSPENDED"
  | "BLOCKED"
  | "WITHDRAWN"
  | "PURGED";

export type MemberAdminActionId =
  | "warn"
  | "suspend"
  | "unsuspend"
  | "block"
  | "unblock"
  | "edit_profile"
  | "manage_password"
  | "manage_store"
  | "manage_privilege"
  | "ops_history"
  | "moderation"
  | "withdraw"
  | "purge";

export type MemberAdminActionTone = "default" | "danger";

export type MemberAdminOperatorAuthorization = {
  /** Can apply warn / suspend / block / restore. */
  canModerate: boolean;
  canEditProfile: boolean;
  /** Admin password reset only when account contract supports it. */
  canResetPassword: boolean;
  /** Privilege change — typically super-admin only. */
  canManagePrivilege: boolean;
  canWithdraw: boolean;
  canPurge: boolean;
  /** Operator acting on self — privilege demotion / self-block guards. */
  isSelf: boolean;
  /** Target holds highest privilege — moderation forbidden. */
  targetIsSuperAdmin?: boolean;
  /**
   * R6: target privilege presentation for promote/revoke ActionPolicy.
   * Defaults: super_admin when targetIsSuperAdmin, else member.
   */
  targetPrivilege?: "member" | "admin" | "super_admin";
};

export type MemberAdminActionContext = {
  lifecycle: MemberAdminLifecycleState;
  operator: MemberAdminOperatorAuthorization;
  /** True when a real store ownership relationship exists. */
  hasStoreRelationship: boolean;
  /** True when account origin/provider supports admin password reset. */
  passwordResetSupported: boolean;
};

export type MemberAdminActionDecision = {
  id: MemberAdminActionId;
  visible: boolean;
  enabled: boolean;
  labelKo: string;
  tone: MemberAdminActionTone;
  disabledReasonKo?: string;
};

const LABELS: Record<MemberAdminActionId, string> = {
  warn: MEMBER_ADMIN_COPY.warn,
  suspend: MEMBER_ADMIN_COPY.status_suspended,
  unsuspend: MEMBER_ADMIN_COPY.status_unsuspend,
  block: MEMBER_ADMIN_COPY.status_blocked,
  unblock: MEMBER_ADMIN_COPY.status_unblock,
  edit_profile: MEMBER_ADMIN_COPY.edit_profile,
  manage_password: MEMBER_ADMIN_COPY.password_manage,
  manage_store: MEMBER_ADMIN_COPY.store_ops,
  manage_privilege: MEMBER_ADMIN_COPY.admin_privilege,
  ops_history: MEMBER_ADMIN_COPY.ops_history,
  moderation: MEMBER_ADMIN_COPY.moderation,
  withdraw: "탈퇴 처리",
  purge: "영구 삭제",
};

function decision(
  id: MemberAdminActionId,
  opts: {
    visible: boolean;
    enabled: boolean;
    tone?: MemberAdminActionTone;
    disabledReasonKo?: string;
    labelKo?: string;
  },
): MemberAdminActionDecision {
  return {
    id,
    visible: opts.visible,
    enabled: opts.visible && opts.enabled,
    labelKo: opts.labelKo ?? LABELS[id],
    tone: opts.tone ?? (id === "block" || id === "withdraw" || id === "purge" ? "danger" : "default"),
    disabledReasonKo: opts.enabled ? undefined : opts.disabledReasonKo,
  };
}

/**
 * Normalize display moderation status / lifecycle into ActionPolicy lifecycle.
 * Accepts operator display statuses (normal/warned/suspended/blocked/withdrawn) and
 * P0 lifecycle names (ACTIVE/SUSPENDED/…).
 */
export function normalizeMemberAdminLifecycle(
  raw: string | null | undefined,
): MemberAdminLifecycleState {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "purged" || s === "gone") return "PURGED";
  if (s === "withdrawn" || s === "deleted" || s === "deactivated") return "WITHDRAWN";
  if (s === "blocked" || s === "banned") return "BLOCKED";
  if (s === "suspended") return "SUSPENDED";
  if (s === "active" || s === "normal" || s === "warned" || s === "warning" || s === "needs_review") {
    return "ACTIVE";
  }
  if (s === "active" || s === "") return "ACTIVE";
  // Uppercase lifecycle passthrough
  const u = String(raw ?? "").trim().toUpperCase();
  if (u === "ACTIVE" || u === "SUSPENDED" || u === "BLOCKED" || u === "WITHDRAWN" || u === "PURGED") {
    return u;
  }
  return "ACTIVE";
}

function moderationAllowed(op: MemberAdminOperatorAuthorization): { ok: boolean; reason?: string } {
  if (!op.canModerate) return { ok: false, reason: "권한이 없습니다" };
  if (op.targetIsSuperAdmin) return { ok: false, reason: "최고 관리자는 제재할 수 없습니다" };
  if (op.isSelf) return { ok: false, reason: "본인 계정에는 적용할 수 없습니다" };
  return { ok: true };
}

/**
 * Resolve the full operator action matrix for one member.
 * Consumers must filter by visible/enabled — never invent parallel matrices.
 */
export function resolveMemberAdminActionPolicy(
  ctx: MemberAdminActionContext,
): MemberAdminActionDecision[] {
  const { lifecycle, operator, hasStoreRelationship, passwordResetSupported } = ctx;
  const mod = moderationAllowed(operator);

  const terminal = lifecycle === "WITHDRAWN" || lifecycle === "PURGED";

  const warnVisible =
    lifecycle === "ACTIVE" || lifecycle === "SUSPENDED";
  const suspendVisible = lifecycle === "ACTIVE";
  const unsuspendVisible = lifecycle === "SUSPENDED";
  const blockVisible = lifecycle === "ACTIVE" || lifecycle === "SUSPENDED";
  const unblockVisible = lifecycle === "BLOCKED";

  const out: MemberAdminActionDecision[] = [
    decision("edit_profile", {
      visible: !terminal,
      enabled: operator.canEditProfile && lifecycle !== "BLOCKED",
      disabledReasonKo: !operator.canEditProfile
        ? "권한이 없습니다"
        : lifecycle === "BLOCKED"
          ? "차단된 회원은 정보 수정을 할 수 없습니다"
          : undefined,
    }),
    // Member S16: general members always.
    // Super Admin targets: SA actor + self only (other SA passwords remain protected).
    // General admin targets: staff EditAdminForm (G9), not this CTA.
    (() => {
      const targetPrivilege =
        operator.targetPrivilege ??
        (operator.targetIsSuperAdmin ? "super_admin" : "member");
      const memberPathOk = targetPrivilege === "member";
      const saSelfPathOk =
        targetPrivilege === "super_admin" && operator.canManagePrivilege && operator.isSelf;
      const passwordPathOk = memberPathOk || saSelfPathOk;
      // SA self must not hide behind auth-eligibility probe races (passwordResetSupported).
      // Members still require passwordResetSupported.
      const pwVisible =
        !terminal &&
        passwordPathOk &&
        (saSelfPathOk || passwordResetSupported);
      const pwEnabled =
        pwVisible && operator.canResetPassword && lifecycle !== "BLOCKED";
      let disabledReasonKo: string | undefined;
      if (targetPrivilege === "super_admin" && operator.canManagePrivilege && !operator.isSelf) {
        disabledReasonKo = "다른 최고 관리자 비밀번호는 변경할 수 없습니다";
      } else if (!passwordPathOk) {
        disabledReasonKo =
          targetPrivilege === "admin"
            ? "일반 관리자 비밀번호는 관리자 설정에서 변경합니다"
            : "최고 관리자 본인만 이 계정의 비밀번호를 변경할 수 있습니다";
      } else if (!operator.canResetPassword) {
        disabledReasonKo = "권한이 없습니다";
      } else if (lifecycle === "BLOCKED") {
        disabledReasonKo = "차단된 회원은 비밀번호 관리를 할 수 없습니다";
      }
      return decision("manage_password", {
        visible: pwVisible,
        enabled: pwEnabled,
        disabledReasonKo,
      });
    })(),
    decision("manage_store", {
      visible: hasStoreRelationship && !terminal,
      enabled: hasStoreRelationship && !terminal,
    }),
    (() => {
      const targetPrivilege =
        operator.targetPrivilege ??
        (operator.targetIsSuperAdmin ? "super_admin" : "member");
      const privilegeEnabled =
        operator.canManagePrivilege &&
        !operator.isSelf &&
        targetPrivilege !== "super_admin";
      const privilegeLabel =
        targetPrivilege === "admin" ? "관리자 권한 해제" : "관리자 권한 부여";
      const privilegeDisabledReason = !operator.canManagePrivilege
        ? "권한이 없습니다"
        : operator.isSelf
          ? "자신의 권한은 변경할 수 없습니다"
          : targetPrivilege === "super_admin"
            ? "권한을 변경할 수 없습니다"
            : undefined;
      return decision("manage_privilege", {
        visible: !terminal && operator.canManagePrivilege,
        enabled: privilegeEnabled,
        labelKo: targetPrivilege === "super_admin" ? LABELS.manage_privilege : privilegeLabel,
        disabledReasonKo: privilegeDisabledReason,
        tone: targetPrivilege === "admin" ? "danger" : "default",
      });
    })(),
    decision("ops_history", {
      visible: true,
      enabled: true,
    }),
    decision("moderation", {
      visible: !terminal,
      enabled: mod.ok,
      disabledReasonKo: mod.reason,
    }),
    decision("warn", {
      visible: warnVisible,
      enabled: warnVisible && mod.ok,
      disabledReasonKo: mod.reason,
    }),
    decision("suspend", {
      visible: suspendVisible,
      enabled: suspendVisible && mod.ok,
      disabledReasonKo: mod.reason,
      tone: "danger",
    }),
    decision("unsuspend", {
      visible: unsuspendVisible,
      enabled: unsuspendVisible && mod.ok,
      disabledReasonKo: mod.reason,
    }),
    decision("block", {
      visible: blockVisible,
      enabled: blockVisible && mod.ok,
      disabledReasonKo: mod.reason,
      tone: "danger",
    }),
    decision("unblock", {
      visible: unblockVisible,
      enabled: unblockVisible && mod.ok,
      disabledReasonKo: mod.reason,
    }),
    decision("withdraw", {
      visible: lifecycle === "ACTIVE" || lifecycle === "SUSPENDED" || lifecycle === "BLOCKED",
      enabled: operator.canWithdraw && mod.ok,
      disabledReasonKo: !operator.canWithdraw ? "권한이 없습니다" : mod.reason,
      tone: "danger",
    }),
    decision("purge", {
      visible: lifecycle === "WITHDRAWN",
      enabled: operator.canPurge,
      disabledReasonKo: !operator.canPurge ? "권한이 없습니다" : undefined,
      tone: "danger",
    }),
  ];

  return out;
}

export function listVisibleMemberAdminActions(
  ctx: MemberAdminActionContext,
): MemberAdminActionDecision[] {
  return resolveMemberAdminActionPolicy(ctx).filter((a) => a.visible);
}

export function listEnabledMemberAdminActions(
  ctx: MemberAdminActionContext,
): MemberAdminActionDecision[] {
  return resolveMemberAdminActionPolicy(ctx).filter((a) => a.visible && a.enabled);
}

/**
 * Moderation CTA ids compatible with legacy `member-moderation-cta` consumers.
 * Policy is the authority; this is a projection only.
 * - ban = block
 * - restore = unsuspend | unblock (context-dependent)
 */
export function memberModerationActionIdsFromPolicy(
  lifecycleOrStatus: string | null | undefined,
  operator: Pick<MemberAdminOperatorAuthorization, "canModerate" | "isSelf" | "targetIsSuperAdmin"> = {
    canModerate: true,
    isSelf: false,
  },
): Array<"warn" | "suspend" | "ban" | "restore"> {
  const lifecycle = normalizeMemberAdminLifecycle(lifecycleOrStatus);
  const decisions = resolveMemberAdminActionPolicy({
    lifecycle,
    operator: {
      canModerate: operator.canModerate,
      canEditProfile: true,
      canResetPassword: false,
      canManagePrivilege: false,
      canWithdraw: false,
      canPurge: false,
      isSelf: operator.isSelf,
      targetIsSuperAdmin: operator.targetIsSuperAdmin,
    },
    hasStoreRelationship: false,
    passwordResetSupported: false,
  });
  const enabled = new Set(decisions.filter((d) => d.enabled).map((d) => d.id));
  const out: Array<"warn" | "suspend" | "ban" | "restore"> = [];
  // Legacy CTA matrix: warn only on ACTIVE; order restore before ban (Control Center contract).
  if (enabled.has("warn") && lifecycle === "ACTIVE") out.push("warn");
  if (enabled.has("suspend")) out.push("suspend");
  if (enabled.has("unsuspend") || enabled.has("unblock")) out.push("restore");
  if (enabled.has("block")) out.push("ban");
  return out;
}
