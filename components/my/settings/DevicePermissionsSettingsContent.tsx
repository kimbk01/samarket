"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { PermissionRequiredBanner } from "@/components/permissions/PermissionRequiredBanner";
import type { MessageKey } from "@/lib/i18n/messages";
import type { DevicePermissionKind } from "@/lib/permissions/device-permission-kind";
import type { BrowserPermissionState } from "@/lib/permissions/device-permission-manager";
import {
  isGuideSeen,
  refreshPermissionState,
  refreshSpeakerOutputState,
  requestPermission,
  resetPermissionGuideTracking,
  runSpeakerTestWithOptionalGuide,
} from "@/lib/permissions/device-permission-manager";
import {
  readPreferredSpeakerSinkId,
  writePreferredSpeakerSinkId,
} from "@/lib/permissions/speaker-output-preference";
import { Sam } from "@/lib/ui/sam-component-classes";

const PERMISSION_KINDS: readonly DevicePermissionKind[] = [
  "location",
  "microphone",
  "camera",
  "notification",
] as const;

const PERMISSION_LABEL_KEYS: Record<DevicePermissionKind, MessageKey> = {
  location: "settings_device_location",
  microphone: "settings_device_mic",
  camera: "settings_device_camera",
  notification: "settings_device_notification",
};

const PERMISSION_DESC_KEYS: Record<DevicePermissionKind, MessageKey> = {
  location: "settings_device_location_desc",
  microphone: "settings_device_mic_desc",
  camera: "settings_device_camera_desc",
  notification: "settings_device_notification_desc",
};

const PERMISSION_KIND_KEYS: Record<DevicePermissionKind, MessageKey> = {
  location: "settings_device_perm_kind_location",
  microphone: "settings_device_perm_kind_mic",
  camera: "settings_device_perm_kind_camera",
  notification: "settings_device_perm_kind_notification",
};

const DENIED_HINT_KEYS: Record<DevicePermissionKind, MessageKey> = {
  location: "settings_device_hint_location_denied",
  microphone: "settings_device_hint_mic_denied",
  camera: "settings_device_hint_camera_denied",
  notification: "settings_device_hint_notification_denied",
};

function initialPermissionStates(): Record<DevicePermissionKind, BrowserPermissionState> {
  return {
    location: "unknown",
    microphone: "unknown",
    camera: "unknown",
    notification: "unknown",
  };
}

export function DevicePermissionsSettingsContent() {
  const { t } = useI18n();
  const [permissionStates, setPermissionStates] = useState<Record<DevicePermissionKind, BrowserPermissionState>>(
    initialPermissionStates,
  );
  const [spkState, setSpkState] = useState<BrowserPermissionState>("unknown");
  const [busy, setBusy] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [sinkId, setSinkId] = useState<string>("");

  const canSetSink =
    typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;

  const labelForBrowserState = useCallback(
    (s: BrowserPermissionState): string => {
      if (s === "granted") return t("settings_device_perm_granted");
      if (s === "denied") return t("settings_device_perm_denied");
      return t("settings_device_perm_prompt");
    },
    [t],
  );

  const labelSpeakerState = useCallback(
    (s: BrowserPermissionState): string => {
      if (s === "unknown") return t("settings_device_speaker_unknown");
      if (s === "granted") return t("settings_device_speaker_ok");
      if (s === "denied") return t("settings_device_speaker_fail");
      return labelForBrowserState(s);
    },
    [labelForBrowserState, t],
  );

  const reloadLabels = useCallback(async () => {
    const entries = await Promise.all(
      PERMISSION_KINDS.map(async (kind) => [kind, await refreshPermissionState(kind)] as const),
    );
    setPermissionStates(Object.fromEntries(entries) as Record<DevicePermissionKind, BrowserPermissionState>);
    setSpkState(refreshSpeakerOutputState());
  }, []);

  useEffect(() => {
    void reloadLabels();
  }, [reloadLabels]);

  useEffect(() => {
    if (!canSetSink || typeof window === "undefined") return;
    const saved = readPreferredSpeakerSinkId();
    if (saved) setSinkId(saved);
    void navigator.mediaDevices?.enumerateDevices?.().then((list) => {
      setOutputs(list.filter((d) => d.kind === "audiooutput"));
    });
  }, [canSetSink]);

  const setPermissionHint = useCallback(
    (kind: DevicePermissionKind, state: BrowserPermissionState) => {
      if (state === "denied") {
        setHint(t(DENIED_HINT_KEYS[kind]));
      }
    },
    [t],
  );

  const onAllowPermission = useCallback(
    async (kind: DevicePermissionKind) => {
      setBusy(`${kind}:allow`);
      setHint(null);
      try {
        const res = await requestPermission(kind, { explicitRetry: true });
        await reloadLabels();
        if (!res.result.ok) {
          if ("reason" in res.result && res.result.reason === "denied") {
            setHint(t(DENIED_HINT_KEYS[kind]));
          } else if ("reason" in res.result && res.result.reason === "no_api") {
            setHint(t("settings_device_hint_no_permission_api"));
          }
        }
      } finally {
        setBusy(null);
      }
    },
    [reloadLabels, t],
  );

  const onRecheckPermission = useCallback(
    async (kind: DevicePermissionKind) => {
      setBusy(`${kind}:check`);
      setHint(null);
      try {
        const state = await refreshPermissionState(kind);
        setPermissionStates((prev) => ({ ...prev, [kind]: state }));
        setPermissionHint(kind, state);
      } finally {
        setBusy(null);
      }
    },
    [setPermissionHint],
  );

  const onShowGuide = useCallback(
    async (kind: DevicePermissionKind) => {
      setBusy(`${kind}:guide`);
      setHint(null);
      try {
        resetPermissionGuideTracking(kind);
        const res = await requestPermission(kind);
        await reloadLabels();
        if (!res.result.ok && "reason" in res.result && res.result.reason === "denied") {
          setHint(t(DENIED_HINT_KEYS[kind]));
        }
      } finally {
        setBusy(null);
      }
    },
    [reloadLabels, t],
  );

  const onSpeakerTest = async () => {
    setBusy("spk");
    setHint(null);
    try {
      const firstGuide = !isGuideSeen("speaker");
      const r = await runSpeakerTestWithOptionalGuide({ showFirstGuide: firstGuide });
      setSpkState(refreshSpeakerOutputState());
      if (!r.ok && r.error && r.error !== "later") {
        setHint(t("settings_device_hint_sound_blocked"));
      }
    } finally {
      setBusy(null);
    }
  };

  const onResetGuides = () => {
    for (const kind of PERMISSION_KINDS) resetPermissionGuideTracking(kind);
    resetPermissionGuideTracking("speaker");
    void reloadLabels();
    setHint(t("settings_device_onboarding_reset_done"));
  };

  const applySink = (id: string) => {
    setSinkId(id);
    writePreferredSpeakerSinkId(id.trim() || null);
  };

  const permissionCards = useMemo(
    () =>
      PERMISSION_KINDS.map((kind) => {
        const state = permissionStates[kind];
        const isBusy = busy?.startsWith(`${kind}:`) ?? false;
        return (
          <section key={kind} className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <h3 className={`${Sam.text.cardTitle} text-sam-fg`}>{t(PERMISSION_LABEL_KEYS[kind])}</h3>
            <p className={`${Sam.text.bodySecondary} text-sam-muted`}>{t(PERMISSION_DESC_KEYS[kind])}</p>
            <p className={`${Sam.text.bodySecondary} text-sam-muted`}>
              {t("settings_device_status", { label: labelForBrowserState(state) })}
            </p>
            {state === "denied" ? (
              <PermissionRequiredBanner
                message={t("settings_device_perm_banner", { kind: t(PERMISSION_KIND_KEYS[kind]) })}
              />
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void onAllowPermission(kind)}
                className={`${Sam.btn.secondaryCombo} ${Sam.btn.sm}`}
              >
                {isBusy && busy === `${kind}:allow`
                  ? t("settings_device_checking")
                  : t("settings_device_allow_check")}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void onRecheckPermission(kind)}
                className={`${Sam.btn.ghostCombo} ${Sam.btn.sm}`}
              >
                {isBusy && busy === `${kind}:check`
                  ? t("settings_device_checking")
                  : t("settings_device_recheck")}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void onShowGuide(kind)}
                className={`${Sam.btn.ghostCombo} ${Sam.btn.sm}`}
              >
                {isBusy && busy === `${kind}:guide`
                  ? t("settings_device_checking")
                  : t("settings_device_show_guide")}
              </button>
            </div>
          </section>
        );
      }),
    [
      busy,
      labelForBrowserState,
      onAllowPermission,
      onRecheckPermission,
      onShowGuide,
      permissionStates,
      t,
    ],
  );

  return (
    <div className="space-y-6">
      <p className={`${Sam.text.bodySecondary} text-sam-muted`}>{t("settings_device_intro")}</p>

      {hint ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body-secondary text-sam-fg">
          {hint}
        </div>
      ) : null}

      <div className="space-y-3">{permissionCards}</div>

      <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h3 className={`${Sam.text.cardTitle} text-sam-fg`}>{t("settings_device_speaker")}</h3>
        <p className={`${Sam.text.bodySecondary} text-sam-muted`}>
          {t("settings_device_last_test", { label: labelSpeakerState(spkState) })}
        </p>
        <p className={`${Sam.text.helper} text-sam-muted`}>{t("settings_device_speaker_hint")}</p>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void onSpeakerTest()}
          className={`${Sam.btn.secondaryCombo} ${Sam.btn.sm}`}
        >
          {busy === "spk" ? t("settings_device_testing_sound") : t("settings_device_test_sound")}
        </button>
        {canSetSink && outputs.length > 0 ? (
          <div className="pt-2">
            <label className={`mb-1 block ${Sam.text.helper} text-sam-muted`}>{t("settings_device_output_device")}</label>
            <select
              className={`${Sam.input.base} w-full`}
              value={sinkId}
              onChange={(e) => void applySink(e.target.value)}
            >
              <option value="">{t("settings_device_default_output")}</option>
              {outputs.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || t("settings_device_output_unnamed")}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className={`${Sam.text.helper} text-sam-muted`}>{t("settings_device_output_unsupported")}</p>
        )}
      </section>

      <section className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app p-4">
        <p className={`mb-3 ${Sam.text.bodySecondary} text-sam-muted`}>{t("settings_device_onboarding_reset_hint")}</p>
        <button type="button" onClick={onResetGuides} className={`${Sam.btn.ghostCombo} ${Sam.btn.sm}`}>
          {t("settings_device_onboarding_reset")}
        </button>
      </section>
    </div>
  );
}
