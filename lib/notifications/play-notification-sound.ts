/**
 * 인앱 알림용 짧은 소리 — SSOT resolver 경유 (event playback only).
 * Audio unlock 은 `notification-sound-unlock.ts` — alert asset 사용 금지.
 */

import { NOTIFICATION_SOUND_ASSET_PATH } from "@/lib/notifications/notification-sound-asset-path";
import { applyPreferredSinkToHtmlAudioElement } from "@/lib/permissions/speaker-output-preference";
import { resolveNotificationSound } from "@/lib/notifications/notification-sound-resolver";
import { unlockNotificationSoundAudio } from "@/lib/notifications/notification-sound-unlock";

export { NOTIFICATION_SOUND_ASSET_PATH };
export {
  unlockNotificationSoundAudio,
  isNotificationSoundUnlocked,
  SOUND_UNLOCK_LOG,
} from "@/lib/notifications/notification-sound-unlock";

/** @deprecated 같은 파일 경로; 호환용. */
export const NOTIFICATION_SOUND_MP3_PATH = NOTIFICATION_SOUND_ASSET_PATH;

let sharedAudioCtx: AudioContext | null = null;

function getOrCreateAudioContext(): AudioContext | null {
  try {
    const AC =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
      sharedAudioCtx = new AC();
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

function playSoftBeepFallback(): void {
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;

    const run = (): void => {
      try {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.type = "sine";
        o.frequency.value = 780;
        g.gain.setValueAtTime(0.045, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
        o.start(ctx.currentTime);
        o.stop(ctx.currentTime + 0.08);
      } catch {
        /* ignore */
      }
    };

    if (ctx.state === "suspended") {
      void ctx.resume().then(run);
    } else {
      run();
    }
  } catch {
    /* ignore */
  }
}

async function playSsotOneShot(eventKey: string): Promise<void> {
  const resolved = resolveNotificationSound(eventKey, { platform: "web" });
  if (!resolved.enabled || resolved.kind === "silent" || !resolved.webUrl) return;
  try {
    const audio = new Audio(resolved.webUrl);
    audio.volume = Math.max(0, Math.min(1, resolved.volume));
    await applyPreferredSinkToHtmlAudioElement(audio);
    void audio.play().catch(() => playSoftBeepFallback());
  } catch {
    playSoftBeepFallback();
  }
}

/**
 * @deprecated Use `unlockNotificationSoundAudio()` — silent unlock only, no alert asset.
 */
export function primeNotificationSoundAudio(): void {
  unlockNotificationSoundAudio();
}

/** 통화 종료 정리 후 로깅용 */
export function getSharedNotificationAudioContextState(): string | null {
  return sharedAudioCtx?.state ?? null;
}

/** 알림용 공유 AudioContext 가 재생 중이면 일시 정지 — 통화 세션 잔류 완화 */
export function suspendSharedNotificationAudioContextBestEffort(): void {
  if (typeof window === "undefined") return;
  try {
    if (sharedAudioCtx && sharedAudioCtx.state === "running") {
      void sharedAudioCtx.suspend();
    }
  } catch {
    /* ignore */
  }
}

/**
 * @deprecated Phase 2-1 — `playEventNotificationSound(eventKey)` 사용.
 * 호환 shim: `system_default` SSOT eventKey.
 */
export function playNotificationSound(): void {
  if (typeof window === "undefined") return;
  void playSsotOneShot("system_default");
}
