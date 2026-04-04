import { NOTIFICATION_SOUND_ASSET_PATH, playNotificationSound, primeNotificationSoundAudio } from "@/lib/notifications/play-notification-sound";

type CallToneMode = "incoming" | "outgoing";

export type CallToneController = {
  stop: () => void;
};

const TONE_INTERVAL_MS: Record<CallToneMode, number> = {
  incoming: 2600,
  outgoing: 3200,
};

export function startCommunityMessengerCallTone(mode: CallToneMode): CallToneController {
  if (typeof window === "undefined") {
    return { stop() {} };
  }

  primeNotificationSoundAudio();

  let stopped = false;
  let intervalId: number | null = null;
  let audio: HTMLAudioElement | null = null;

  const stop = () => {
    stopped = true;
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

  try {
    audio = new Audio(NOTIFICATION_SOUND_ASSET_PATH);
    audio.preload = "auto";
    audio.loop = true;
    audio.volume = mode === "incoming" ? 0.72 : 0.45;
    audio.playbackRate = mode === "incoming" ? 1 : 0.94;
    const result = audio.play();
    if (result && typeof result.catch === "function") {
      void result.catch(() => {
        if (stopped) return;
        audio = null;
        playNotificationSound();
        intervalId = window.setInterval(() => {
          playNotificationSound();
        }, TONE_INTERVAL_MS[mode]);
      });
    }
  } catch {
    playNotificationSound();
    intervalId = window.setInterval(() => {
      playNotificationSound();
    }, TONE_INTERVAL_MS[mode]);
  }

  return { stop };
}
