import { NOTIFICATION_SOUND_ASSET_PATH, playNotificationSound, primeNotificationSoundAudio } from "@/lib/notifications/play-notification-sound";
import { primeWebAudioCallToneContextFromUserGesture, startWebAudioCallTone } from "@/lib/community-messenger/call-tone-web-audio";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import {
  fetchMessengerCallSoundConfig,
  getMessengerCallSoundConfigCache,
  resolveMessengerCallEndSoundUrl,
  resolveMessengerCallMissedSoundUrl,
  resolveMessengerCallToneUrl,
} from "@/lib/community-messenger/messenger-call-sound-config-client";

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

/**
 * 통화 발신 직전(세션 POST·라우팅 `await` 전) **동기 제스처**에서 호출한다.
 * 이후 통화 화면 effect 에서 `HTMLAudioElement.play()`·Web Audio 가 막히지 않게 한다.
 */
export function unlockCommunityMessengerCallPlaybackFromUserGesture(): void {
  if (typeof window === "undefined") return;
  primeWebAudioCallToneContextFromUserGesture();
  try {
    const a = new Audio(NOTIFICATION_SOUND_ASSET_PATH);
    a.preload = "auto";
    a.muted = true;
    a.volume = 0;
    void a.play().then(() => {
      a.pause();
      a.currentTime = 0;
    });
  } catch {
    /* ignore */
  }
}

export type StartCallToneOptions = {
  /** 음성/영상에 따라 다른 주파수·간격(동종 메신저처럼 구분). 기본 `voice`. */
  callKind?: CommunityMessengerCallKind;
};

/**
 * 수신/발신 통화 톤. Web Audio 합성을 우선 사용하고, 실패 시 기존 알림 루프로 폴백.
 * 관리자 설정 URL은 fetch 완료 후 적용되도록 비동기로 로드한다.
 */
export async function startCommunityMessengerCallTone(
  mode: CallToneMode,
  options?: StartCallToneOptions
): Promise<CallToneController> {
  if (typeof window === "undefined") {
    return { stop() {} };
  }

  activeToneStopper?.();

  primeNotificationSoundAudio();
  /** 수발신 벨 시작마다 최신 관리자 설정을 쓴다(다른 탭에서 저장한 뒤에도 동일 탭에서 반영). */
  await fetchMessengerCallSoundConfig({ force: true });

  const cfg = getMessengerCallSoundConfigCache();
  const callKind: CommunityMessengerCallKind = options?.callKind === "video" ? "video" : "voice";
  const volCfg = cfg?.incoming_ringtone_volume;
  const vIn =
    typeof volCfg === "number" && Number.isFinite(volCfg) ? Math.min(1, Math.max(0, volCfg)) : 0.72;
  const vOut = Math.min(1, vIn * 0.625);
  const adminUrl = resolveMessengerCallToneUrl(cfg, mode, callKind);
  if (adminUrl) {
    let audio: HTMLAudioElement | null = null;
    const clear = () => {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
        audio = null;
      }
    };
    primeNotificationSoundAudio();
    for (const useCrossOrigin of [true, false] as const) {
      try {
        const next = new Audio(adminUrl);
        if (useCrossOrigin) next.crossOrigin = "anonymous";
        next.preload = "auto";
        next.loop = true;
        next.volume = mode === "incoming" ? vIn : vOut;
        await next.play();
        audio = next;
        const stop = () => {
          clear();
          if (activeToneStopper === stop) activeToneStopper = null;
        };
        activeToneStopper = stop;
        return { stop };
      } catch {
        clear();
      }
    }
  }

  const web = startWebAudioCallTone(mode, callKind);
  if (web) {
    const stop = () => {
      web.stop();
      if (activeToneStopper === stop) activeToneStopper = null;
    };
    activeToneStopper = stop;
    return { stop };
  }

  let stopped = false;
  let intervalId: number | null = null;
  let audio: HTMLAudioElement | null = null;

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
      next.volume = mode === "incoming" ? vIn : vOut;
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

export type CallSignalSoundKind = "missed" | "call_end";

const recentSignalPlays = new Map<string, number>();
const SIGNAL_DEDUP_MS = 3500;

export type PlayCallSignalSoundOptions = {
  /** 동일 세션에서 전역 배너·통화 화면 등 중복 재생 방지 */
  dedupeSessionId?: string;
};

/** 부재·통화 종료 등 짧은 원샷(루프 아님). URL 없거나 재생 실패 시 짧은 기본 알림음으로 폴백. */
export async function playCommunityMessengerCallSignalSound(
  kind: CallSignalSoundKind,
  options?: PlayCallSignalSoundOptions
): Promise<void> {
  if (typeof window === "undefined") return;
  const dk = options?.dedupeSessionId ? `${options.dedupeSessionId}:${kind}` : null;
  if (dk) {
    const now = Date.now();
    const last = recentSignalPlays.get(dk) ?? 0;
    if (now - last < SIGNAL_DEDUP_MS) return;
    recentSignalPlays.set(dk, now);
    if (recentSignalPlays.size > 80) {
      const cutoff = now - SIGNAL_DEDUP_MS * 4;
      for (const [k, t] of recentSignalPlays) {
        if (t < cutoff) recentSignalPlays.delete(k);
      }
    }
  }
  await fetchMessengerCallSoundConfig({ force: true });
  const cfg = getMessengerCallSoundConfigCache();
  const url =
    kind === "missed" ? resolveMessengerCallMissedSoundUrl(cfg) : resolveMessengerCallEndSoundUrl(cfg);
  primeNotificationSoundAudio();
  if (url) {
    try {
      const audio = new Audio(url);
      audio.crossOrigin = "anonymous";
      audio.volume = kind === "missed" ? 0.68 : 0.42;
      void audio.play().catch(() => playNotificationSound());
    } catch {
      playNotificationSound();
    }
    return;
  }
  playNotificationSound();
}
