"use client";

import { useCallback, useEffect, useState } from "react";
import {
  readPreferredCommunityMessengerDeviceIds,
  refreshPreferredCommunityMessengerDevicesFromEnumerate,
  testCommunityMessengerMediaPipeline,
  writePreferredCommunityMessengerDeviceIds,
} from "@/lib/community-messenger/media-preflight";

export function CommunityMessengerDeviceSettingsSection({ visible }: { visible: boolean }) {
  const [audioList, setAudioList] = useState<MediaDeviceInfo[]>([]);
  const [videoList, setVideoList] = useState<MediaDeviceInfo[]>([]);
  const [audioId, setAudioId] = useState("");
  const [videoId, setVideoId] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadLists = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setAudioList(list.filter((d) => d.kind === "audioinput"));
      setVideoList(list.filter((d) => d.kind === "videoinput"));
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
    setHint(null);
    void loadLists();
  }, [visible, loadLists]);

  const save = () => {
    writePreferredCommunityMessengerDeviceIds(audioId || null, videoId || null);
    void refreshPreferredCommunityMessengerDevicesFromEnumerate();
    setHint("저장했습니다. 다음 통화부터 이 장치를 사용합니다.");
  };

  const test = async () => {
    setBusy(true);
    setHint(null);
    try {
      await testCommunityMessengerMediaPipeline();
      setHint("마이크·카메라 테스트에 성공했습니다.");
    } catch {
      setHint("테스트에 실패했습니다. 브라우저 권한과 장치 연결을 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  return (
    <section>
      <p className="mb-2 text-[13px] font-semibold text-gray-500">통화 장치</p>
      <p className="mb-3 text-[12px] leading-snug text-gray-500">
        메신저에 처음 들어올 때 한 번만 권한을 묻고, 이후에는 여기서 고른 마이크·카메라로 바로 연결합니다.
      </p>
      <div className="space-y-3 rounded-ui-rect border border-gray-100 bg-gray-50 px-4 py-3">
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-gray-700">마이크</span>
          <select
            value={audioId}
            onChange={(e) => setAudioId(e.target.value)}
            className="w-full rounded-ui-rect border border-gray-200 bg-white px-3 py-2 text-[14px] text-gray-900"
          >
            {audioList.map((d) => (
              <option key={d.deviceId || d.label} value={d.deviceId}>
                {d.label || "마이크"}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-gray-700">카메라</span>
          <select
            value={videoId}
            onChange={(e) => setVideoId(e.target.value)}
            className="w-full rounded-ui-rect border border-gray-200 bg-white px-3 py-2 text-[14px] text-gray-900"
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
            className="rounded-ui-rect bg-gray-900 px-4 py-2 text-[13px] font-semibold text-white"
          >
            장치 저장
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void test()}
            className="rounded-ui-rect border border-gray-200 bg-white px-4 py-2 text-[13px] font-medium text-gray-800 disabled:opacity-50"
          >
            테스트 통화(미디어)
          </button>
        </div>
        {hint ? <p className="text-[12px] text-gray-600">{hint}</p> : null}
      </div>
    </section>
  );
}
