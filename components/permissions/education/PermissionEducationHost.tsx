"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { App } from "@capacitor/app";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import { getNotificationGuidePending } from "@/lib/permissions/permission-manager/notification-permission-ui-bridge";
import {
  subscribeNotificationPermissionSnapshot,
  syncNotificationState,
} from "@/lib/permissions/permission-manager/notification-permission-manager";
import { isCallMediaPermissionBlockedUiMessage } from "@/lib/community-messenger/call-media-permission-preflight";
import { useMessengerSnackbarStore } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { translate } from "@/lib/i18n/messages";
import {
  clearPermissionEducationSuccessToast,
  closePermissionDiagnosticSheet,
  getPermissionEducationPending,
  getPermissionEducationSuccessToast,
  isPermissionDiagnosticOpen,
  openPermissionEducationSheet,
  settlePermissionEducationSheet,
  subscribePermissionEducationBridge,
} from "@/lib/permissions/education/permission-education-bridge";
import {
  resyncAfterSettingsReturn,
  runLockScreenEducationIfNeeded,
} from "@/lib/permissions/education/permission-education-orchestrator";
import {
  supportsLockScreenIncomingEducation,
  supportsPermissionEducationContext,
} from "@/lib/permissions/education/permission-education-platform";
import { PermissionEducationSheet } from "@/components/permissions/education/PermissionEducationSheet";
import { PermissionDiagnosticSheet } from "@/components/permissions/education/PermissionDiagnosticSheet";
import { PermissionSuccessToast } from "@/components/permissions/education/PermissionSuccessToast";

function inferCallKindFromSnackbarMessage(message: string): "voice" | "video" {
  const lang = getRuntimeAppLanguage();
  if (translate(lang, "cm_ui_call_permission_settings_video") === message) return "video";
  if (translate(lang, "cm_ui_call_failed_permission_detail_video") === message) return "video";
  return "voice";
}

export function PermissionEducationHost() {
  const [, bump] = useReducer((x) => x + 1, 0);
  const lockTierCheckedRef = useRef(false);
  const settingsReturnResyncRef = useRef(false);

  useEffect(() => subscribePermissionEducationBridge(bump), []);

  useEffect(() => {
    if (!supportsLockScreenIncomingEducation()) return;
    const unsub = subscribeNotificationPermissionSnapshot((snapshot) => {
      if (snapshot.receiveReady && !snapshot.lockScreenIncomingReady && !getNotificationGuidePending()) {
        void runLockScreenEducationIfNeeded();
      }
    });
    void syncNotificationState().then((snapshot) => {
      if (snapshot.receiveReady && !snapshot.lockScreenIncomingReady && !getNotificationGuidePending()) {
        void runLockScreenEducationIfNeeded();
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!supportsLockScreenIncomingEducation()) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (settingsReturnResyncRef.current) {
        settingsReturnResyncRef.current = false;
        void resyncAfterSettingsReturn();
      }
      if (!lockTierCheckedRef.current) {
        lockTierCheckedRef.current = true;
      }
      void syncNotificationState({ force: true }).then((snapshot) => {
        if (snapshot.receiveReady && !snapshot.lockScreenIncomingReady && !getNotificationGuidePending()) {
          void runLockScreenEducationIfNeeded();
        }
      });
    };
    document.addEventListener("visibilitychange", onVisible);
    let removeApp: (() => void) | undefined;
    if (isCapacitorNativePlatform()) {
      void App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) onVisible();
      }).then((h) => {
        removeApp = () => void h.remove();
      });
    }
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      removeApp?.();
    };
  }, []);

  useEffect(() => {
    return useMessengerSnackbarStore.subscribe((state, prev) => {
      const entry = state.current;
      if (!entry || entry.variant !== "error") return;
      if (prev.current?.id === entry.id) return;
      if (!isCallMediaPermissionBlockedUiMessage(entry.message)) return;
      if (getPermissionEducationPending() || getNotificationGuidePending()) return;
      const kind = inferCallKindFromSnackbarMessage(entry.message);
      void openPermissionEducationSheet({
        tier: kind === "video" ? "call_video" : "call_voice",
        flow: "incoming",
        kind,
      });
    });
  }, []);

  const handleSettingsOpened = useCallback(() => {
    settingsReturnResyncRef.current = true;
    settlePermissionEducationSheet("settings");
  }, []);

  const educationPending = getPermissionEducationPending();
  const diagnosticOpen = isPermissionDiagnosticOpen();
  const successToast = getPermissionEducationSuccessToast();
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
          summary={educationPending.summary}
          onAllow={() => settlePermissionEducationSheet("allow")}
          onLater={() => settlePermissionEducationSheet("later")}
          onSettingsOpened={handleSettingsOpened}
        />
      ) : null}
      {diagnosticOpen ? <PermissionDiagnosticSheet onClose={closePermissionDiagnosticSheet} /> : null}
      {successToast ? (
        <PermissionSuccessToast message={successToast} onDismiss={clearPermissionEducationSuccessToast} />
      ) : null}
    </>
  );
}
