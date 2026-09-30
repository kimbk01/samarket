/** Admin member list query helpers — R2 independent filter axes. No leading-wildcard index claim; UUID uses eq(id). */

import type { AdminUserStatusCategory } from "@/lib/types/admin-user";

export const ADMIN_MEMBER_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ADMIN_MEMBER_STORE_NAME_MATCH_LIMIT = 200;

export type AdminMemberVerifyFilter = "verified" | "unverified";
export type AdminMemberStoreFilter = "has_store" | "no_store";
/** OD-03: `admin` includes 최고관리자; cell badge differentiates. */
export type AdminMemberPrivilegeFilter = "admin" | "member";
/** R0 origin axis — UI Korean; URL uses these canonical tokens. */
export type AdminMemberOriginFilter = "email" | "manual" | "kakao" | "other";

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
  const extra = uniqueAdminMemberIds(opts?.extraIds ?? []);
  if (isAdminMemberUuidSearch(search)) {
    // Profile id match, optionally union store-owner ids when search equals a store id.
    if (extra.length === 0) {
      return [{ type: "eq", column: "id", value: search }];
    }
    return [
      {
        type: "or",
        value: `id.eq.${search},id.in.(${extra.join(",")})`,
      },
    ];
  }
  return [
    {
      type: "or",
      value: buildProfileTextSearchOr(search, opts),
    },
  ];
}

/**
 * Account-state axis only — must NOT require phone_verified (verification is independent).
 * BLOCKED ≠ SUSPENDED — never union blocked into suspended filter.
 */
export function adminMemberStatusFilterOps(status: AdminUserStatusCategory): ProfileFilterOp[] {
  if (status === "deleted") {
    return [
      {
        type: "or",
        value: "deleted_at.not.is.null,status.eq.deleted,status.eq.withdrawn,status.eq.deactivated",
      },
    ];
  }
  if (status === "blocked") {
    return [
      { type: "is", column: "deleted_at", value: null },
      { type: "not_in", column: "status", value: "(deleted,withdrawn,deactivated)" },
      {
        type: "or",
        value: "status.eq.blocked,status.eq.banned",
      },
    ];
  }
  if (status === "suspended") {
    return [
      { type: "is", column: "deleted_at", value: null },
      { type: "not_in", column: "status", value: "(deleted,withdrawn,deactivated,blocked,banned)" },
      {
        type: "or",
        value: "status.eq.suspended,member_status.eq.suspended",
      },
    ];
  }
  if (status === "needs_review") {
    // Optional bucket: member_status review only — never phone verification.
    return [
      { type: "is", column: "deleted_at", value: null },
      { type: "not_in", column: "status", value: "(deleted,withdrawn,deactivated,suspended,blocked,banned)" },
      {
        type: "or",
        value: "member_status.eq.pending,member_status.eq.review",
      },
    ];
  }
  // active / 정상 이용 — lifecycle only
  return [
    { type: "is", column: "deleted_at", value: null },
    { type: "not_in", column: "status", value: "(deleted,withdrawn,deactivated,suspended,blocked,banned)" },
    {
      type: "or",
      value: "member_status.is.null,member_status.not.in.(pending,review,suspended,banned)",
    },
  ];
}

/** OD-02 binary verification filter — server authoritative. */
export function adminMemberVerificationFilterOps(
  verify: AdminMemberVerifyFilter | null | undefined,
): ProfileFilterOp[] {
  if (!verify) return [];
  if (verify === "verified") {
    return [{ type: "eq", column: "phone_verified", value: true }];
  }
  return [
    {
      type: "or",
      value: "phone_verified.is.null,phone_verified.eq.false",
    },
  ];
}

export function adminMemberStoreFilterPlan(
  store: AdminMemberStoreFilter | null | undefined,
  ownerIds: readonly string[],
): { empty: boolean; ops: ProfileFilterOp[] } {
  if (!store) return { empty: false, ops: [] };
  const owners = uniqueAdminMemberIds(ownerIds);
  if (store === "has_store") {
    return owners.length === 0
      ? { empty: true, ops: [] }
      : { empty: false, ops: [{ type: "in", column: "id", value: owners }] };
  }
  if (owners.length === 0) return { empty: false, ops: [] };
  return { empty: false, ops: [{ type: "not_in", column: "id", value: postgrestInFilter(owners) }] };
}

export function adminMemberPrivilegeFilterPlan(
  privilege: AdminMemberPrivilegeFilter | null | undefined,
  adminIds: readonly string[],
): { empty: boolean; ops: ProfileFilterOp[] } {
  if (!privilege) return { empty: false, ops: [] };
  const admins = uniqueAdminMemberIds(adminIds);
  if (privilege === "admin") {
    return admins.length === 0
      ? { empty: true, ops: [] }
      : { empty: false, ops: [{ type: "in", column: "id", value: admins }] };
  }
  if (admins.length === 0) return { empty: false, ops: [] };
  return { empty: false, ops: [{ type: "not_in", column: "id", value: postgrestInFilter(admins) }] };
}

const MANUAL_PROVIDER_IN =
  "manual,manual_admin,manual_admin_backfill,admin_manual";
const OTHER_PROVIDER_IN = "google,apple,naver,facebook";

/** Signup/origin axis — human labels in UI; tokens stay in URL/query. */
export function adminMemberOriginFilterOps(
  origin: AdminMemberOriginFilter | null | undefined,
): ProfileFilterOp[] {
  if (!origin) return [];
  if (origin === "manual") {
    return [
      {
        type: "or",
        value: `auth_provider.in.(${MANUAL_PROVIDER_IN}),provider.in.(${MANUAL_PROVIDER_IN})`,
      },
    ];
  }
  if (origin === "kakao") {
    return [
      {
        type: "or",
        value: "auth_provider.eq.kakao,provider.eq.kakao",
      },
    ];
  }
  if (origin === "other") {
    return [
      {
        type: "or",
        value: `auth_provider.in.(${OTHER_PROVIDER_IN}),provider.in.(${OTHER_PROVIDER_IN})`,
      },
    ];
  }
  // 일반 가입 (email) — include null/empty provider as email-class signup
  return [
    {
      type: "or",
      value:
        "auth_provider.eq.email,provider.eq.email,and(auth_provider.is.null,provider.is.null)",
    },
  ];
}
