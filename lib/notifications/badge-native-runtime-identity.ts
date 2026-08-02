/**
 * Phase 2-4 / Slice 2-6 — Native Runtime Identity (no structure change)
 *
 * Proves wire identity:
 *   MemberAppIconTotal (memberAppIconWebTotal / surface appIconTotal)
 *     → Capawesome Badge.set / Badge.get
 *     → Android Launcher (OEM Cap path)
 *     → FCM badge_count (resolveMemberAppIconTotalForNativeFcm) → Delivery Adapter setNumber
 *     → domain tray children setNumber(0) (no launcher authority)
 *     → APNS aps.badge
 *
 * DO NOT: Projection · Writer · RoomUnread · Bell · Lifecycle · Explain · Heal · Legacy delete · OEM patch
 * DO NOT: B_store / C_store on Member Native/FCM wire
 */

import fs from "node:fs";
import path from "node:path";

export const BADGE_NATIVE_RUNTIME_AUTHORITY = "domain_badge_native_identity_v1" as const;

export type NativeIdentityWireRow = Readonly<{
  surface: string;
  sourceOfTruth: "appIconTotal";
  evidencePath: string;
  mustContain: readonly string[];
  mustNotContain?: readonly string[];
}>;

/** Static product wires — each emitter echoes MemberAppIconTotal absolute only. */
export const BADGE_NATIVE_IDENTITY_WIRES: readonly NativeIdentityWireRow[] = [
  {
    surface: "capawesome_badge",
    sourceOfTruth: "appIconTotal",
    evidencePath: "lib/push/native/sync-native-badge-count.ts",
    mustContain: ["@capawesome/capacitor-badge", "Badge.set", "Badge.clear"],
  },
  {
    surface: "native_badge_sync",
    sourceOfTruth: "appIconTotal",
    evidencePath: "components/push/NativeBadgeSync.tsx",
    mustContain: [
      "getDomainBadgeSurfaceSnapshot",
      "syncNativeBadgeCount",
      "app_icon_projection",
    ],
    mustNotContain: ["bellTotal", "getBellUnread", "notification-bell"],
  },
  {
    surface: "fcm_badge_count",
    sourceOfTruth: "appIconTotal",
    evidencePath: "lib/notifications/pipeline/notify-push-dispatcher.ts",
    mustContain: [
      "fetchDomainBadgeAuthorityPayload",
      "resolveMemberAppIconTotalForNativeFcm",
      "memberAppIconWebTotal",
      "projection?.appIconTotal",
      "badge_count: memberAppIconTotal",
    ],
    mustNotContain: ["badge_count: appIconTotal"],
  },
  {
    surface: "android_tray_setNumber",
    sourceOfTruth: "appIconTotal",
    evidencePath: "android/app/src/main/java/com/dibay/app/DibayAppIconDeliveryAdapter.java",
    mustContain: [
      "SUMMARY_CHANNEL_ID",
      "SUMMARY_NOTIFICATION_ID",
      "setNumber(total)",
      "summary_applied",
      "onDomainNotificationPosted",
    ],
    mustNotContain: [
      "domain_tray_present",
      "cancelSummary(nm);\n      Log.i(TAG, \"apply domain_tray_present",
      "miui",
      "xiaomi",
      "samsung",
      "notificationCount",
      "total /",
    ],
  },
  {
    surface: "android_domain_child_no_badge_number",
    sourceOfTruth: "appIconTotal",
    evidencePath: "android/app/src/main/java/com/dibay/app/DibayFirebaseMessagingService.java",
    mustContain: ["setNumber(0)", "onDomainNotificationPosted", "badgeCount"],
    mustNotContain: ["setNumber(badgeCount)"],
  },
  {
    surface: "apns_badge",
    sourceOfTruth: "appIconTotal",
    evidencePath: "lib/push/dispatch/apns-sender-impl.ts",
    mustContain: ["aps.badge", "badgeCount", "badge_count"],
  },
  {
    surface: "ios_delivery_adapter",
    sourceOfTruth: "appIconTotal",
    evidencePath: "ios/App/App/Plugins/DibayAppIconDeliveryAdapter.swift",
    mustContain: ["setBadgeCount", "applicationIconBadgeNumber", "appIconTotal"],
  },
  {
    surface: "logout_clear",
    sourceOfTruth: "appIconTotal",
    evidencePath: "lib/auth/client-session-wipe.ts",
    mustContain: ["clearNativeBadgeCount"],
  },
] as const;

export function assertBadgeNativeIdentityWires(opts?: {
  root?: string;
}): { ok: boolean; errors: string[]; rows: Array<{ surface: string; ok: boolean; errors: string[] }> } {
  const root = opts?.root ?? process.cwd();
  const rows: Array<{ surface: string; ok: boolean; errors: string[] }> = [];
  const allErrors: string[] = [];

  for (const wire of BADGE_NATIVE_IDENTITY_WIRES) {
    const errors: string[] = [];
    const abs = path.join(root, wire.evidencePath);
    let src = "";
    try {
      src = fs.readFileSync(abs, "utf8");
    } catch {
      errors.push(`missing_file:${wire.evidencePath}`);
    }
    for (const needle of wire.mustContain) {
      if (!src.includes(needle)) errors.push(`missing:${needle}`);
    }
    for (const ban of wire.mustNotContain ?? []) {
      if (src.includes(ban)) errors.push(`forbidden:${ban}`);
    }
    const ok = errors.length === 0;
    rows.push({ surface: wire.surface, ok, errors });
    if (!ok) allErrors.push(...errors.map((e) => `${wire.surface}:${e}`));
  }

  return { ok: allErrors.length === 0, errors: allErrors, rows };
}

export type NativeIdentitySnap = Readonly<{
  projectionAppIcon: number;
  badgeGet: number | null;
  surfaceStoreAppIcon: number | null;
  fcmBadgeCountWire: number | null;
  apnsBadgeWire: number | null;
}>;

/**
 * Identity gate: Projection == Cap Badge.get == (optional) surface store.
 * FCM/APNS wires equal Projection when measured (payload build).
 */
export function assertNativeIdentityEqual(snap: NativeIdentitySnap): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const p = Math.max(0, Math.floor(Number(snap.projectionAppIcon) || 0));
  if (snap.badgeGet == null || !Number.isFinite(snap.badgeGet)) {
    errors.push("badge_get_missing");
  } else if (Math.max(0, Math.floor(snap.badgeGet)) !== p) {
    errors.push(`badge_get!=projection (${snap.badgeGet}!=${p})`);
  }
  if (snap.surfaceStoreAppIcon != null && Math.max(0, Math.floor(snap.surfaceStoreAppIcon)) !== p) {
    errors.push(`surface_store!=projection (${snap.surfaceStoreAppIcon}!=${p})`);
  }
  if (snap.fcmBadgeCountWire != null && Math.max(0, Math.floor(snap.fcmBadgeCountWire)) !== p) {
    errors.push(`fcm_badge_count!=projection (${snap.fcmBadgeCountWire}!=${p})`);
  }
  if (snap.apnsBadgeWire != null && Math.max(0, Math.floor(snap.apnsBadgeWire)) !== p) {
    errors.push(`apns_badge!=projection (${snap.apnsBadgeWire}!=${p})`);
  }
  return { ok: errors.length === 0, errors };
}
