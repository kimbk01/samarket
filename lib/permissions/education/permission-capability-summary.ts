"use client";

import { callPermissionGate } from "@/lib/call/permissions/call-permission-gate";
import {
  getCachedNotificationReceiveSnapshot,
  syncNotificationState,
} from "@/lib/permissions/permission-manager/notification-permission-manager";
import { checkAndroidCallReceiveSettings } from "@/lib/permissions/native-device-permissions-plugin";
import { filterCapabilityItemsForPlatform } from "@/lib/permissions/education/permission-education-platform";
import type {
  PermissionCapabilityItem,
  PermissionCapabilitySummary,
} from "@/lib/permissions/education/permission-education-types";

function buildItems(input: {
  receiveReady: boolean;
  lockScreenIncomingReady: boolean;
  fullScreenIntentEnabled: boolean;
  batteryRestricted: boolean;
  canVoice: boolean;
  canVideo: boolean;
}): PermissionCapabilityItem[] {
  return [
    {
      id: "notifications",
      pass: input.receiveReady,
      labelKey: "perm_edu_check_notifications",
      detailKey: "perm_edu_check_notifications_detail",
    },
    {
      id: "lock_screen_incoming",
      pass: input.lockScreenIncomingReady,
      labelKey: "perm_edu_check_lock_screen",
      detailKey: "perm_edu_check_lock_screen_detail",
    },
    {
      id: "full_screen_intent",
      pass: input.fullScreenIntentEnabled,
      labelKey: "perm_edu_check_fsi",
      detailKey: "perm_edu_check_fsi_detail",
    },
    {
      id: "battery",
      pass: !input.batteryRestricted,
      labelKey: "perm_edu_check_battery",
      detailKey: "perm_edu_check_battery_detail",
    },
    {
      id: "microphone",
      pass: input.canVoice,
      labelKey: "perm_edu_check_microphone",
      detailKey: "perm_edu_check_microphone_detail",
    },
    {
      id: "camera",
      pass: input.canVideo,
      labelKey: "perm_edu_check_camera",
      detailKey: "perm_edu_check_camera_detail",
    },
  ];
}

/** Read-only aggregator — SSOT writers untouched. */
export async function buildPermissionCapabilitySummary(
  opts?: { forceSync?: boolean },
): Promise<PermissionCapabilitySummary> {
  const [snapshot, callCheck, androidReceive] = await Promise.all([
    opts?.forceSync
      ? syncNotificationState({ force: true })
      : (getCachedNotificationReceiveSnapshot() ?? syncNotificationState()),
    callPermissionGate.check("video"),
    checkAndroidCallReceiveSettings(),
  ]);

  const receiveReady = androidReceive?.receiveReady ?? snapshot.receiveReady;
  const lockScreenIncomingReady =
    androidReceive?.lockScreenIncomingReady ?? snapshot.lockScreenIncomingReady;
  const fullScreenIntentEnabled =
    androidReceive?.fullScreenIntentAllowed ?? snapshot.fullScreenIntentEnabled;
  const batteryRestricted =
    snapshot.batteryUnrestrictedOrUnknown === "restricted" ||
    androidReceive?.lockScreenBlockReason === "battery_restricted";
  const lockScreenBlockReason =
    androidReceive?.lockScreenBlockReason ?? snapshot.blockReason ?? null;
  const manufacturer = androidReceive?.manufacturer ?? snapshot.manufacturer ?? null;

  const items = filterCapabilityItemsForPlatform(
    buildItems({
      receiveReady,
      lockScreenIncomingReady,
      fullScreenIntentEnabled,
      batteryRestricted,
      canVoice: callCheck.canVoice,
      canVideo: callCheck.canVideo,
    }),
  );

  const overallReady = items.every((item) => item.pass);

  return {
    items,
    overallReady,
    receiveReady,
    lockScreenIncomingReady,
    lockScreenBlockReason,
    manufacturer,
    syncedAt: snapshot.syncedAt,
  };
}
