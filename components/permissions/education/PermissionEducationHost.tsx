"use client";

import { useCallback, useEffect, useReducer } from "react";
import { getNotificationGuidePending } from "@/lib/permissions/permission-manager/notification-permission-ui-bridge";
import {
  getPermissionEducationPending,
  settlePermissionEducationSheet,
  subscribePermissionEducationBridge,
} from "@/lib/permissions/education/permission-education-bridge";
import { supportsPermissionEducationContext } from "@/lib/permissions/education/permission-education-platform";
import { PermissionEducationSheet } from "@/components/permissions/education/PermissionEducationSheet";

export function PermissionEducationHost() {
  const [, bump] = useReducer((x) => x + 1, 0);

  useEffect(() => subscribePermissionEducationBridge(bump), []);

  const handleSettingsOpened = useCallback(() => {
    settlePermissionEducationSheet("settings");
  }, []);

  const educationPending = getPermissionEducationPending();
  const showEducationSheet = Boolean(
    educationPending &&
      !getNotificationGuidePending() &&
      supportsPermissionEducationContext(educationPending.context),
  );

  return (
    <>
      {showEducationSheet && educationPending ? (
        <PermissionEducationSheet
          context={educationPending.context}
          onLater={() => settlePermissionEducationSheet("later")}
          onSettingsOpened={handleSettingsOpened}
        />
      ) : null}
    </>
  );
}
