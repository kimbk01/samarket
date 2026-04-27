"use client";

import { useCallback, useEffect, useState } from "react";
import {
  readPreferredCommunityMessengerDeviceIds,
  refreshPreferredCommunityMessengerDevicesFromEnumerate,
  testCommunityMessengerMediaPipeline,
  writePreferredCommunityMessengerDeviceIds,
} from "@/lib/community-messenger/media-preflight";

export function CommunityMessengerDeviceSettingsSection({
  visible,
  /** 설정 시트의 「통화」 묶음 안에 넣을 때 바깥 제목·섹션 중복 제거 */
  embedded = false,
}: {
  visible: boolean;
  embedded?: boolean;
}) {
  const [audioList, setAudioList] = useState<MediaDeviceInfo[]>([]);
  const [videoList, setVideoList] = useState<MediaDeviceInfo[]>([]);
  const [audioId, setAudioId] = useState("");
  const [videoId, setVideoId] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isSameDeviceList = (prev: MediaDeviceInfo[], next: MediaDeviceInfo[]): boolean => {
    if (prev.length !== next.length) return false;
    for (let i = 0; i < prev.length; i += 1) {
      if (prev[i]?.deviceId !== next[i]?.deviceId || prev[i]?.label !== next[i]?.label) return false;
    }
    return true;
  };

  const loadLists = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const nextAudioList = list.filter((d) => d.kind === "audioinput");
      const nextVideoList = list.filter((d) => d.kind === "videoinput");
      setAudioList((prev) => (isSameDeviceList(prev, nextAudioList) ? prev : nextAudioList));
      setVideoList((prev) => (isSameDeviceList(prev, nextVideoList) ? prev : nextVideoList));
      const cur = readPreferredCommunityMessengerDeviceIds();
      const firstA = list.find((d) => d.kind === "audioinput")?.deviceId ?? "";
      const firstV = list.find((d) => d.kind === "videoinput")?.deviceId ?? "";
      setAudioId(cur.audioDeviceId && list.some((d) => d.deviceId === cur.audioDeviceId) ? cur.audioDeviceId : firstA);
      setVideoId(cur.videoDeviceId && list.some((d) => d.deviceId === cur.videoDeviceId) ? cur.videoDeviceId : firstV);
    } catch {
      setHint("장치 목록을 불러오지 못했습니다.");
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    setHint((prev) => (prev === null ? prev : null));
    void loadLists();
  }, [visible, loadLists]);

  const save = () => {
    writePreferredCommunityMessengerDeviceIds(audioId || null, videoId || null);
    void refreshPreferredCommunityMessengerDevicesFromEnumerate();
    setHint("저장했습니다. 다음 통화부터 이 장치를 사용합니다.");
  };

  const test = async () => {
    setBusy((prev) => (prev ? prev : true));
    setHint((prev) => (prev === null ? prev : null));
    try {
      await testCommunityMessengerMediaPipeline();
      setHint("마이크·카메라 테스트에 성공했습니다.");
    } catch {
      setHint("테스트에 실패했습니다. 브라우저 권한과 장치 연결을 확인해 주세요.");
    } finally {
      setBusy((prev) => (prev ? false : prev));
    }
  };

  if (!visible) return null;

  const body = (
    <>
      {!embedded ? (
        <>
          <p className="mb-2 sam-text-body-secondary font-semibold text-sam-muted">통화 장치</p>
          <p className="mb-3 sam-text-helper leading-snug text-sam-muted">
            메신저에 처음 들어올 때 한 번만 권한을 묻고, 이후에는 여기서 고른 마이크·카메라로 바로 연결합니다.
          </p>
        </>
      ) : (
        <p className="mb-2 sam-text-helper leading-snug text-sam-muted">
          마이크·카메라 기본 장치와 테스트입니다.
        </p>
      )}
      <div className="space-y-3 rounded-ui-rect border border-sam-border-soft bg-sam-app px-3 py-2.5">
        <label className="block">
          <span className="mb-1 block sam-text-helper font-medium text-sam-fg">마이크</span>
          <select
            value={audioId}
            onChange={(e) => setAudioId(e.target.value)}
            className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
          >
            {audioList.map((d) => (
              <option key={d.deviceId || d.label} value={d.deviceId}>
                {d.label || "마이크"}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block sam-text-helper font-medium text-sam-fg">카메라</span>
          <select
            value={videoId}
            onChange={(e) => setVideoId(e.target.value)}
            className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
          >
            {videoList.map((d) => (
              <option key={d.deviceId || d.label} value={d.deviceId}>
                {d.label || "카메라"}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => save()}
            className="rounded-ui-rect bg-sam-ink px-4 py-2 sam-text-body-secondary font-semibold text-white"
          >
            장치 저장
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void test()}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 sam-text-body-secondary font-medium text-sam-fg disabled:opacity-50"
          >
            테스트 통화(미디어)
          </button>
        </div>
        {hint ? <p className="sam-text-helper text-sam-muted">{hint}</p> : null}
      </div>
    </>
  );

  if (embedded) return <div className="py-0.5">{body}</div>;
  return <section>{body}</section>;
}
