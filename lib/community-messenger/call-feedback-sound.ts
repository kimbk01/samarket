import { NOTIFICATION_SOUND_ASSET_PATH, playNotificationSound, primeNotificationSoundAudio } from "@/lib/notifications/play-notification-sound";

type CallToneMode = "incoming" | "outgoing";

export type CallToneController = {
  stop: () => void;
};

const TONE_INTERVAL_MS: Record<CallToneMode, number> = {
  incoming: 2600,
  outgoing: 3200,
};

let activeToneStopper: (() => void) | null = null;

/** 어디서든 호출 가능 — 통화 연결·종료·화면 전환 직후 벨이 남지 않게 한다 */
export function stopCommunityMessengerCallFeedback(): void {
  if (typeof window === "undefined") return;
  activeToneStopper?.();
}

export function startCommunityMessengerCallTone(mode: CallToneMode): CallToneController {
  if (typeof window === "undefined") {
    return { stop() {} };
  }

  let stopped = false;
  let intervalId: number | null = null;
  let audio: HTMLAudioElement | null = null;

  activeToneStopper?.();

  const clearLoopAudio = () => {
    if (intervalId) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio = null;
    }
  };

  const tryStart = () => {
    if (stopped) return;
    clearLoopAudio();
    primeNotificationSoundAudio();
    try {
      const next = new Audio(NOTIFICATION_SOUND_ASSET_PATH);
      next.preload = "auto";
      next.loop = true;
      next.volume = mode === "incoming" ? 0.72 : 0.45;
      next.playbackRate = mode === "incoming" ? 1 : 0.94;
      audio = next;
      const result = next.play();
      if (result && typeof result.catch === "function") {
        void result.catch(() => {
          if (stopped) return;
          audio = null;
          playNotificationSound();
          intervalId = window.setInterval(() => {
            if (stopped) {
              if (intervalId != null) window.clearInterval(intervalId);
              intervalId = null;
              return;
            }
            playNotificationSound();
          }, TONE_INTERVAL_MS[mode]);
        });
      }
    } catch {
      playNotificationSound();
      intervalId = window.setInterval(() => {
        if (stopped) {
          if (intervalId != null) window.clearInterval(intervalId);
          intervalId = null;
          return;
        }
        playNotificationSound();
      }, TONE_INTERVAL_MS[mode]);
    }
  };

  const onFirstGesture = () => {
    window.removeEventListener("pointerdown", onFirstGesture);
    window.removeEventListener("touchstart", onFirstGesture);
    if (stopped) return;
    /* 수신은 fetch 이후에 시작되어 자동재생이 막히는 경우가 많음 — 첫 터치 후 다시 시도 */
    tryStart();
  };

  window.addEventListener("pointerdown", onFirstGesture, { passive: true });
  window.addEventListener("touchstart", onFirstGesture, { passive: true });

  tryStart();

  const stop = () => {
    stopped = true;
    window.removeEventListener("pointerdown", onFirstGesture);
    window.removeEventListener("touchstart", onFirstGesture);
    clearLoopAudio();
    if (activeToneStopper === stop) {
      activeToneStopper = null;
    }
  };

  activeToneStopper = stop;

  return { stop };
}
