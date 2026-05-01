"use client";

import { useCallback, useEffect, useState } from "react";
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

function labelForBrowserState(s: BrowserPermissionState): string {
  if (s === "granted") return "허용됨";
  if (s === "denied") return "차단됨";
  if (s === "prompt") return "확인 필요";
  return "알 수 없음";
}

function labelSpeakerState(s: BrowserPermissionState): string {
  if (s === "unknown") return "테스트 전";
  if (s === "granted") return "테스트 성공";
  if (s === "denied") return "재생 실패·차단됨";
  return labelForBrowserState(s);
}

export function DevicePermissionsSettingsContent() {
  const [locState, setLocState] = useState<BrowserPermissionState>("unknown");
  const [micState, setMicState] = useState<BrowserPermissionState>("unknown");
  const [spkState, setSpkState] = useState<BrowserPermissionState>("unknown");
  const [busy, setBusy] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [sinkId, setSinkId] = useState<string>("");

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
        setHint("브라우저·기기 설정에서 위치 권한을 허용해 주세요.");
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
        setHint("브라우저·기기 설정에서 마이크 권한을 허용해 주세요.");
      } else if (!res.ok && res.reason === "deferred") {
        setHint("「앱 안내 상태 초기화」 후 다시 시도하거나, 브라우저에서 마이크를 허용해 주세요.");
      } else if (!res.ok && res.reason === "later") {
        setHint(null);
      } else if (!res.ok && res.reason === "insecure") {
        setHint("HTTPS 또는 localhost 에서만 마이크를 사용할 수 있습니다.");
      } else if (!res.ok && res.reason === "no_api") {
        setHint("이 브라우저에서는 마이크 API를 쓸 수 없습니다.");
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
        setHint("소리 재생이 막혔습니다. 화면을 한 번 터치한 뒤 다시 시도해 주세요.");
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
    setHint("앱 안내 모달 기준이 초기화되었습니다. 기능 사용 시 필요하면 다시 안내됩니다.");
  };

  const applySink = (id: string) => {
    setSinkId(id);
    writePreferredSpeakerSinkId(id.trim() || null);
  };

  return (
    <div className="space-y-6">
      <p className={`${Sam.text.bodySecondary} text-sam-muted`}>
        위치·마이크는 브라우저 권한과 연결됩니다. 로그아웃해도 기기 권한은 유지됩니다.
      </p>

      {hint ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body-secondary text-sam-fg">
          {hint}
        </div>
      ) : null}

      <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h3 className={`${Sam.text.cardTitle} text-sam-fg`}>위치</h3>
        <p className={`${Sam.text.bodySecondary} text-sam-muted`}>상태: {labelForBrowserState(locState)}</p>
        {locState === "denied" ? (
          <PermissionRequiredBanner message="브라우저 또는 기기 설정에서 이 사이트의 위치 접근을 허용해 주세요." />
        ) : null}
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void onRetryLocation()}
          className={`${Sam.btn.secondaryCombo} ${Sam.btn.sm}`}
        >
          {busy === "loc" ? "확인 중…" : "위치 권한 다시 확인"}
        </button>
      </section>

      <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h3 className={`${Sam.text.cardTitle} text-sam-fg`}>마이크</h3>
        <p className={`${Sam.text.bodySecondary} text-sam-muted`}>상태: {labelForBrowserState(micState)}</p>
        {micState === "denied" ? (
          <PermissionRequiredBanner message="브라우저 또는 기기 설정에서 마이크를 허용해 주세요." />
        ) : null}
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void onRetryMic()}
          className={`${Sam.btn.secondaryCombo} ${Sam.btn.sm}`}
        >
          {busy === "mic" ? "확인 중…" : "마이크 권한 다시 확인"}
        </button>
      </section>

      <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h3 className={`${Sam.text.cardTitle} text-sam-fg`}>스피커 · 출력</h3>
        <p className={`${Sam.text.bodySecondary} text-sam-muted`}>마지막 테스트: {labelSpeakerState(spkState)}</p>
        <p className={`${Sam.text.helper} text-sam-muted`}>
          선택한 출력은 통화(스피커 모드)·알림·통화 톤 재생에 적용됩니다. 브라우저가 막으면 기본 출력으로 들립니다.
        </p>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void onSpeakerTest()}
          className={`${Sam.btn.secondaryCombo} ${Sam.btn.sm}`}
        >
          {busy === "spk" ? "재생 중…" : "소리 테스트"}
        </button>
        {canSetSink && outputs.length > 0 ? (
          <div className="pt-2">
            <label className={`mb-1 block ${Sam.text.helper} text-sam-muted`}>출력 장치</label>
            <select
              className={`${Sam.input.base} w-full`}
              value={sinkId}
              onChange={(e) => void applySink(e.target.value)}
            >
              <option value="">기본 출력</option>
              {outputs.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || "출력 장치"}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className={`${Sam.text.helper} text-sam-muted`}>이 브라우저는 출력 장치 선택을 지원하지 않습니다.</p>
        )}
      </section>

      <section className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app p-4">
        <p className={`mb-3 ${Sam.text.bodySecondary} text-sam-muted`}>
          「나중에」를 눌러 건너뛴 앱 안내를 다시 받으려면 아래를 누르세요. 브라우저 권한 자체는 바뀌지 않습니다.
        </p>
        <button type="button" onClick={onResetGuides} className={`${Sam.btn.ghostCombo} ${Sam.btn.sm}`}>
          앱 안내 상태 초기화
        </button>
      </section>
    </div>
  );
}
