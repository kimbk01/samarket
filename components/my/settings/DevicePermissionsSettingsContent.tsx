"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/sam-component-classes";
import { PermissionRequiredBanner } from "@/components/permissions/PermissionRequiredBanner";
import type { BrowserPermissionState } from "@/lib/permissions/device-permission-manager";
import {
  isGuideSeen,
  probeMicrophoneWithGetUserMedia,
  refreshPermissionState,
  requestLocationWithDiBaYGate,
  resetPermissionGuideTracking,
  runSpeakerTestWithOptionalGuide,
} from "@/lib/permissions/device-permission-manager";
import {
  readPreferredSpeakerSinkId,
  writePreferredSpeakerSinkId,
} from "@/lib/permissions/speaker-output-preference";

export function DevicePermissionsSettingsContent() {
  const { t } = useI18n();
  const [locState, setLocState] = useState<BrowserPermissionState>("unknown");
  const [micState, setMicState] = useState<BrowserPermissionState>("unknown");
  const [spkState, setSpkState] = useState<BrowserPermissionState>("unknown");
  const [busy, setBusy] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [sinkId, setSinkId] = useState<string>("");

  const labelForBrowserState = useCallback(
    (s: BrowserPermissionState): string => {
      if (s === "granted") return t("settings_device_perm_granted");
      if (s === "denied") return t("settings_device_perm_denied");
      if (s === "prompt") return t("settings_device_perm_prompt");
      return t("settings_device_perm_unknown");
    },
    [t]
  );

  const labelSpeakerState = useCallback(
    (s: BrowserPermissionState): string => {
      if (s === "unknown") return t("settings_device_speaker_unknown");
      if (s === "granted") return t("settings_device_speaker_ok");
      if (s === "denied") return t("settings_device_speaker_fail");
      return labelForBrowserState(s);
    },
    [labelForBrowserState, t]
  );

  const canSetSink =
    typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;

  const reloadLabels = useCallback(async () => {
    const [l, m, s] = await Promise.all([
      refreshPermissionState("location"),
      refreshPermissionState("microphone"),
      refreshPermissionState("speaker"),
    ]);
    setLocState(l);
    setMicState(m);
    setSpkState(s);
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

  const onRetryLocation = async () => {
    setBusy("loc");
    setHint(null);
    try {
      const res = await requestLocationWithDiBaYGate({ explicitRetry: true });
      await reloadLabels();
      if (!res.ok && res.reason === "denied") {
        setHint(t("settings_device_hint_location_denied"));
      } else if (!res.ok && res.message) {
        setHint(res.message);
      }
    } finally {
      setBusy(null);
    }
  };

  const onRetryMic = async () => {
    setBusy("mic");
    setHint(null);
    try {
      const res = await probeMicrophoneWithGetUserMedia({ explicitRetry: true });
      await reloadLabels();
      if (!res.ok && res.reason === "denied") {
        setHint(t("settings_device_hint_mic_denied"));
      } else if (!res.ok && res.reason === "deferred") {
        setHint(t("settings_device_hint_mic_retry"));
      } else if (!res.ok && res.reason === "later") {
        setHint(null);
      } else if (!res.ok && res.reason === "insecure") {
        setHint(t("settings_device_hint_https"));
      } else if (!res.ok && res.reason === "no_api") {
        setHint(t("settings_device_hint_no_mic_api"));
      }
    } finally {
      setBusy(null);
    }
  };

  const onSpeakerTest = async () => {
    setBusy("spk");
    setHint(null);
    try {
      const firstGuide = !isGuideSeen("speaker");
      const r = await runSpeakerTestWithOptionalGuide({ showFirstGuide: firstGuide });
      await reloadLabels();
      if (!r.ok && r.error && r.error !== "later") {
        setHint(t("settings_device_hint_sound_blocked"));
      }
    } finally {
      setBusy(null);
    }
  };

  const onResetGuides = () => {
    resetPermissionGuideTracking("location");
    resetPermissionGuideTracking("microphone");
    resetPermissionGuideTracking("speaker");
    void reloadLabels();
    setHint(t("settings_device_onboarding_reset_done"));
  };

  const applySink = (id: string) => {
    setSinkId(id);
    writePreferredSpeakerSinkId(id.trim() || null);
  };

  return (
    <div className="space-y-6">
      <p className={`${Sam.text.bodySecondary} text-sam-muted`}>{t("settings_device_intro")}</p>

      {hint ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body-secondary text-sam-fg">
          {hint}
        </div>
      ) : null}

      <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h3 className={`${Sam.text.cardTitle} text-sam-fg`}>{t("settings_device_location")}</h3>
        <p className={`${Sam.text.bodySecondary} text-sam-muted`}>
          {t("settings_device_status", { label: labelForBrowserState(locState) })}
        </p>
        {locState === "denied" ? (
          <PermissionRequiredBanner
            message={t("settings_device_perm_banner", { kind: t("settings_device_perm_kind_location") })}
          />
        ) : null}
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void onRetryLocation()}
          className={`${Sam.btn.secondaryCombo} ${Sam.btn.sm}`}
        >
          {busy === "loc" ? t("settings_device_checking") : t("settings_device_recheck_location")}
        </button>
      </section>

      <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h3 className={`${Sam.text.cardTitle} text-sam-fg`}>{t("settings_device_mic")}</h3>
        <p className={`${Sam.text.bodySecondary} text-sam-muted`}>
          {t("settings_device_status", { label: labelForBrowserState(micState) })}
        </p>
        {micState === "denied" ? (
          <PermissionRequiredBanner message={t("settings_device_perm_banner_mic")} />
        ) : null}
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void onRetryMic()}
          className={`${Sam.btn.secondaryCombo} ${Sam.btn.sm}`}
        >
          {busy === "mic" ? t("settings_device_checking") : t("settings_device_recheck_mic")}
        </button>
      </section>

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
