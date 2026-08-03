/**
 * Slice 2-6 / Gate 3 Step 6 — Native / FCM Member App Icon authority (pure).
 *
 * Native and FCM must NOT compute badge.
 * They echo Member App Icon Authority `appIconTotal` as an absolute value.
 *
 * MemberAppIconTotal = Canonical A + Canonical Conversation B rooms
 *   (orphan missed ∈ A only — never re-added)
 *
 * FORBIDDEN on Native / FCM wire:
 *   B_store, C_store, Bell-only invent, local +1/-1, increment/decrement,
 *   Cap prefs arithmetic, resume invent, A/B recompute
 *
 * DO NOT import Android/iOS/Capacitor runtime here.
 */

export const NATIVE_FCM_MEMBER_APP_ICON_AUTHORITY =
  "native_fcm_member_app_icon_authority_v1" as const;

export const NATIVE_FCM_ONE_LINER =
  "Native/FCM echo MemberAppIconTotal absolute; never compute; never B_store/C_store" as const;

/** Wire field names Native/FCM may read (absolute). */
export const NATIVE_FCM_BADGE_WIRE_FIELDS = [
  "memberAppIconWebTotal",
  "appIconTotal",
  "badge_count",
  "badgeCount",
  "aps.badge",
] as const;

export type MemberAppIconNativeFcmSource = {
  /** Gate 3 Step 6 snapshot total (highest preference). */
  memberAppIconAuthority?: { appIconTotal?: number | null } | null;
  /** Canonical Member web total. */
  memberAppIconWebTotal?: number | null;
  /** Runtime surface / projection alias. */
  appIconTotal?: number | null;
};

/**
 * Resolve absolute Member App Icon total for Native / FCM.
 * Prefers memberAppIconAuthority.appIconTotal → memberAppIconWebTotal → appIconTotal.
 * Never invents from Bell / B_store / C_store / Cap prefs.
 */
export function resolveMemberAppIconTotalForNativeFcm(
  source: MemberAppIconNativeFcmSource | null | undefined
): number {
  const fromSnap = source?.memberAppIconAuthority?.appIconTotal;
  if (fromSnap != null && Number.isFinite(Number(fromSnap))) {
    return floorNonNeg(fromSnap);
  }
  const web = floorNonNeg(source?.memberAppIconWebTotal);
  const app = floorNonNeg(source?.appIconTotal);
  if (source?.memberAppIconWebTotal != null && Number.isFinite(Number(source.memberAppIconWebTotal))) {
    return web;
  }
  return app;
}

function floorNonNeg(v: unknown): number {
  return Math.max(0, Math.floor(Number(v) || 0));
}

/** Local ±1 / increment / decrement are forbidden as Native/FCM authority. */
export const NATIVE_FCM_FORBIDDEN_OPS = [
  "NATIVE_PLUS_ONE",
  "NATIVE_MINUS_ONE",
  "FCM_PLUS_ONE",
  "FCM_MINUS_ONE",
  "INCREMENT",
  "DECREMENT",
  "LOCAL_ACCUMULATE",
  "LAUNCHER_OWN_COUNT",
] as const;

export function isForbiddenNativeFcmBadgeOp(op: string): boolean {
  return (NATIVE_FCM_FORBIDDEN_OPS as readonly string[]).includes(op);
}

/** Axes that must never enter Member App Icon Native/FCM wire. */
export const NATIVE_FCM_EXCLUDED_AXES = ["B_store", "C_store"] as const;

export function nativeFcmAllowsStoreAxis(axis: string): false | true {
  if (axis === "B_store" || axis === "C_store") return false;
  return true;
}

/**
 * FCM/APNS must always carry badge (including 0) so clear is absolute.
 * Returning the clamped total for encoding — callers must not omit on zero.
 */
export function encodeAbsoluteBadgeCountForPush(total: number): {
  badgeCount: string;
  badge_count: number;
  alwaysSend: true;
} {
  const n = floorNonNeg(total);
  return { badgeCount: String(n), badge_count: n, alwaysSend: true };
}

/** Contract: Native setBadge is absolute replace, never relative. */
export function nativeBadgeSetMode(): "absolute_replace" {
  return "absolute_replace";
}
