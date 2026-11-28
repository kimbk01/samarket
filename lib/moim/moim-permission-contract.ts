/**
 * 모임(moim) 역할·권한 계약 — 단일 정의 (설계 docs/design/moim/moim-design-v1-2026-11-12.md §5).
 *
 * DB 의 `public.moim_permission_defaults()` · `public.moim_actor_can()` 과 **같은 표**다.
 * 표를 바꾸면 마이그레이션의 `moim_permission_defaults()` 값 목록도 같이 바꾼다
 * (계약 테스트 `lib/moim/__tests__/moim-permission-contract.test.ts` 가 두 곳을 대조한다).
 * 최종 판정은 항상 DB(RPC 안의 moim_actor_can)이며, 이 파일은 화면 표시(버튼 노출)용이다.
 */

export const MOIM_ROLES = ["host", "co_host", "staff", "member"] as const;
export type MoimRole = (typeof MOIM_ROLES)[number];

export const MOIM_MEMBER_STATUSES = ["pending", "active", "left", "kicked", "banned", "rejected", "cancelled"] as const;
export type MoimMemberStatus = (typeof MOIM_MEMBER_STATUSES)[number];

export const MOIM_PLATFORM_STATES = ["normal", "unlisted", "warned", "blocked"] as const;
export type MoimPlatformState = (typeof MOIM_PLATFORM_STATES)[number];

export const MOIM_STATUSES = ["active", "closed", "deleted"] as const;
export type MoimStatus = (typeof MOIM_STATUSES)[number];

export const MOIM_ACTIONS = [
  "edit_info",
  "decide_join",
  "manage_invite_link",
  "send_invite",
  "pin_notice",
  "manage_boards",
  "hide_post",
  "create_schedule",
  "remove_member",
  "ban_member",
  "write_note",
  "set_role",
  "transfer_host",
  "close",
] as const;
export type MoimAction = (typeof MOIM_ACTIONS)[number];

export type MoimPermissionRule = {
  /** 기본 최소 역할 */
  defaultMinRole: MoimRole;
  /** 모임장이 「멤버 권한 관리」에서 바꿀 수 있는가 */
  adjustable: boolean;
  /** 바꿀 때 내려갈 수 있는 가장 낮은 역할 */
  floorRole: MoimRole;
  /**
   * 바꿀 때 올라갈 수 있는 가장 높은 역할 — 설계 §5.2 「(조정)」 칸만 움직인다(R1 A-02).
   * DB `moim_permission_ceiling` 과 같은 값(시험이 대조). 조정 불가 행동은 기본값과 같다.
   */
  ceilingRole: MoimRole;
};

export const MOIM_PERMISSION_DEFAULTS: Readonly<Record<MoimAction, MoimPermissionRule>> = {
  edit_info: { defaultMinRole: "host", adjustable: false, floorRole: "host", ceilingRole: "host" },
  decide_join: { defaultMinRole: "staff", adjustable: true, floorRole: "staff", ceilingRole: "co_host" },
  manage_invite_link: { defaultMinRole: "staff", adjustable: true, floorRole: "staff", ceilingRole: "co_host" },
  send_invite: { defaultMinRole: "member", adjustable: true, floorRole: "member", ceilingRole: "staff" },
  pin_notice: { defaultMinRole: "staff", adjustable: true, floorRole: "staff", ceilingRole: "co_host" },
  manage_boards: { defaultMinRole: "co_host", adjustable: false, floorRole: "co_host", ceilingRole: "co_host" },
  hide_post: { defaultMinRole: "staff", adjustable: false, floorRole: "staff", ceilingRole: "staff" },
  create_schedule: { defaultMinRole: "member", adjustable: true, floorRole: "member", ceilingRole: "staff" },
  /** 설계 §5.2 「멤버 내보내기·차단 O O X X」(조정 없음) · 시안 U7 — 2026-11-27 감사 B6 */
  remove_member: { defaultMinRole: "co_host", adjustable: false, floorRole: "co_host", ceilingRole: "co_host" },
  ban_member: { defaultMinRole: "co_host", adjustable: false, floorRole: "co_host", ceilingRole: "co_host" },
  /** 설계 §5.2 「운영진 메모 O / O(조정) / O(조정)」 — 운영진 기본 허용 */
  write_note: { defaultMinRole: "staff", adjustable: true, floorRole: "staff", ceilingRole: "host" },
  set_role: { defaultMinRole: "host", adjustable: false, floorRole: "host", ceilingRole: "host" },
  transfer_host: { defaultMinRole: "host", adjustable: false, floorRole: "host", ceilingRole: "host" },
  close: { defaultMinRole: "host", adjustable: false, floorRole: "host", ceilingRole: "host" },
};

const ROLE_RANK: Readonly<Record<MoimRole, number>> = { host: 4, co_host: 3, staff: 2, member: 1 };

export function moimRoleRank(role: MoimRole | null | undefined): number {
  return role ? ROLE_RANK[role] ?? 0 : 0;
}

export function isMoimRole(value: unknown): value is MoimRole {
  return typeof value === "string" && (MOIM_ROLES as readonly string[]).includes(value);
}

export type MoimPermissionOverrides = Partial<Record<MoimAction, MoimRole>>;

export type MoimPermissionContext = {
  moimStatus: MoimStatus;
  platformState: MoimPlatformState;
  /** 보는 사람의 활성 멤버 역할 (멤버가 아니면 null) */
  viewerRole: MoimRole | null;
  overrides?: MoimPermissionOverrides;
};

/** DB moim_actor_can 과 같은 규칙 (화면 표시용) */
export function canMoimAction(ctx: MoimPermissionContext, action: MoimAction): boolean {
  if (ctx.moimStatus !== "active") return false;
  if (ctx.platformState === "blocked" && action !== "close") return false;
  if (ctx.platformState === "warned" && action === "transfer_host") return false;
  if (!ctx.viewerRole) return false;
  const rule = MOIM_PERMISSION_DEFAULTS[action];
  const override = rule.adjustable ? ctx.overrides?.[action] : undefined;
  /** 저장값이 상한을 넘으면 상한으로 본다 (DB moim_actor_can 과 같음 · R1 A-02) */
  const minRole =
    override && moimRoleRank(override) > moimRoleRank(rule.ceilingRole) ? rule.ceilingRole : override ?? rule.defaultMinRole;
  return moimRoleRank(ctx.viewerRole) >= moimRoleRank(minRole);
}

/** 모임장이 action 의 최소 역할을 role 로 바꿀 수 있는가 (DB moim_permissions_set 과 같은 규칙) */
export function isAllowedMoimPermissionOverride(action: MoimAction, role: MoimRole): boolean {
  const rule = MOIM_PERMISSION_DEFAULTS[action];
  return rule.adjustable && moimRoleRank(role) >= moimRoleRank(rule.floorRole) && moimRoleRank(role) <= moimRoleRank(rule.ceilingRole);
}

/** 모임 역할 → 메신저 방 역할 (DB moim__cm_role) */
export function moimRoleToMessengerRole(role: MoimRole): "owner" | "admin" | "member" {
  if (role === "host") return "owner";
  if (role === "co_host") return "admin";
  return "member";
}
