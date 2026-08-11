/** Admin member list query helpers — Slice 2. No leading-wildcard index claim; UUID uses eq(id). */

import type { AdminMemberRelationFilter } from "@/lib/admin-users/member-role-badges";
import type { AdminUserStatusCategory } from "@/lib/types/admin-user";

export const ADMIN_MEMBER_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ADMIN_MEMBER_STORE_NAME_MATCH_LIMIT = 200;

export function isAdminMemberUuidSearch(raw: string): boolean {
  return ADMIN_MEMBER_UUID_RE.test(raw.trim());
}

export function parseAdminMemberListPage(
  rawPage: string | null,
  rawSize: string | null,
): { page: number; pageSize: number; from: number; to: number } {
  const page = Math.max(1, Math.trunc(Number(rawPage) || 1));
  const pageSize = Math.min(50, Math.max(1, Math.trunc(Number(rawSize) || 10)));
  const from = (page - 1) * pageSize;
  return { page, pageSize, from, to: from + pageSize - 1 };
}

export function normalizeAdminMemberSearchToken(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.startsWith("@") ? trimmed.slice(1).trim() : trimmed;
}

export function uniqueAdminMemberIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function buildProfileTextSearchOr(
  search: string,
  opts?: { includeAuthLoginEmail?: boolean; extraIds?: string[] },
): string {
  const pattern = `%${search}%`;
  const parts = [
    `nickname.ilike.${pattern}`,
    `display_name.ilike.${pattern}`,
    `dibay_id.ilike.${pattern}`,
    `username.ilike.${pattern}`,
    `email.ilike.${pattern}`,
    `phone.ilike.${pattern}`,
  ];
  if (opts?.includeAuthLoginEmail !== false) {
    parts.push(`auth_login_email.ilike.${pattern}`);
  }
  const extra = uniqueAdminMemberIds(opts?.extraIds ?? []);
  if (extra.length > 0) {
    parts.push(`id.in.(${extra.join(",")})`);
  }
  return parts.join(",");
}

export function postgrestInFilter(ids: readonly string[]): string {
  return `(${uniqueAdminMemberIds(ids).join(",")})`;
}

export type ProfileFilterOp =
  | { type: "eq"; column: string; value: string | boolean }
  | { type: "is"; column: string; value: null }
  | { type: "or"; value: string }
  | { type: "in"; column: string; value: string[] }
  | { type: "not_in"; column: string; value: string };

export type FilterableQuery<T> = {
  eq: (column: string, value: string | boolean) => T;
  is: (column: string, value: null) => T;
  or: (value: string) => T;
  in: (column: string, values: readonly string[]) => T;
  not: (column: string, operator: string, value: string) => T;
};

export function applyProfileFilterOps<T>(q: T, ops: readonly ProfileFilterOp[]): T {
  let next = q as T & FilterableQuery<T>;
  for (const op of ops) {
    if (op.type === "eq") next = next.eq(op.column, op.value) as typeof next;
    else if (op.type === "is") next = next.is(op.column, op.value) as typeof next;
    else if (op.type === "or") next = next.or(op.value) as typeof next;
    else if (op.type === "in") next = next.in(op.column, op.value) as typeof next;
    else next = next.not(op.column, "in", op.value) as typeof next;
  }
  return next;
}

export function adminMemberSearchFilterOps(
  search: string,
  opts?: { includeAuthLoginEmail?: boolean; extraIds?: string[] },
): ProfileFilterOp[] {
  if (!search) return [];
  if (isAdminMemberUuidSearch(search)) {
    return [{ type: "eq", column: "id", value: search }];
  }
  return [
    {
      type: "or",
      value: buildProfileTextSearchOr(search, opts),
    },
  ];
}

export function adminMemberStatusFilterOps(status: AdminUserStatusCategory): ProfileFilterOp[] {
  if (status === "deleted") {
    return [
      {
        type: "or",
        value: "deleted_at.not.is.null,status.eq.deleted,status.eq.withdrawn,status.eq.deactivated",
      },
    ];
  }
  if (status === "suspended") {
    return [
      { type: "is", column: "deleted_at", value: null },
      { type: "not_in", column: "status", value: "(deleted,withdrawn,deactivated)" },
      {
        type: "or",
        value: "status.eq.suspended,status.eq.banned,member_status.eq.suspended,member_status.eq.banned",
      },
    ];
  }
  if (status === "needs_review") {
    return [
      { type: "is", column: "deleted_at", value: null },
      { type: "not_in", column: "status", value: "(deleted,withdrawn,deactivated,suspended,banned)" },
      {
        type: "or",
        value: "member_status.is.null,member_status.not.in.(suspended,banned)",
      },
      {
        type: "or",
        value:
          "phone_verified.is.null,phone_verified.eq.false,member_status.eq.pending,member_status.eq.review,phone_verification_status.eq.pending,phone_verification_status.eq.rejected",
      },
    ];
  }
  return [
    { type: "is", column: "deleted_at", value: null },
    { type: "not_in", column: "status", value: "(deleted,withdrawn,deactivated,suspended,banned)" },
    {
      type: "or",
      value: "member_status.is.null,member_status.not.in.(pending,review,suspended,banned)",
    },
    { type: "eq", column: "phone_verified", value: true },
    {
      type: "or",
      value: "phone_verification_status.is.null,phone_verification_status.not.in.(pending,rejected)",
    },
  ];
}

export function adminMemberRelationFilterPlan(
  relation: AdminMemberRelationFilter | null,
  ownerIds: readonly string[],
  adminIds: readonly string[],
): { empty: boolean; ops: ProfileFilterOp[] } {
  const owners = uniqueAdminMemberIds(ownerIds);
  const admins = uniqueAdminMemberIds(adminIds);
  if (!relation || relation === "all") {
    return { empty: false, ops: [] };
  }
  if (relation === "store_owner") {
    return owners.length === 0
      ? { empty: true, ops: [] }
      : { empty: false, ops: [{ type: "in", column: "id", value: owners }] };
  }
  if (relation === "admin") {
    return admins.length === 0
      ? { empty: true, ops: [] }
      : { empty: false, ops: [{ type: "in", column: "id", value: admins }] };
  }
  const excluded = uniqueAdminMemberIds([...owners, ...admins]);
  if (excluded.length === 0) return { empty: false, ops: [] };
  return { empty: false, ops: [{ type: "not_in", column: "id", value: postgrestInFilter(excluded) }] };
}
