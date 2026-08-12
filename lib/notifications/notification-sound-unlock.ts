/**
 * Silent notification audio unlock — NOT alert playback.
 *
 * HARD LOCK:
 * - UNLOCK != ALERT PLAYBACK
 * - No alert asset resolver, no notification occurrence, no GATE 2
 * - Route-independent; app-lifetime gesture unlock
 */

export const SOUND_UNLOCK_LOG = "[sound-unlock]";

/** Minimal silent WAV for HTMLAudioElement gesture unlock (iOS WebKit). */
const SILENT_WAV_DATA_URI =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

let unlocked = false;
let sharedUnlockCtx: AudioContext | null = null;

function logUnlock(detail: Record<string, unknown>): void {
  console.info(`${SOUND_UNLOCK_LOG} ${JSON.stringify({ source: "unlock", ...detail })}`);
}

function getUnlockAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AC =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!sharedUnlockCtx || sharedUnlockCtx.state === "closed") {
      sharedUnlockCtx = new AC();
    }
    return sharedUnlockCtx;
  } catch {
    return null;
  }
}

async function resumeAudioContextIfNeeded(): Promise<void> {
  const ctx = getUnlockAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
      logUnlock({ stage: "audio_context_resume", state: ctx.state });
    } catch (err) {
      logUnlock({
        stage: "audio_context_resume_failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }
  logUnlock({ stage: "audio_context_ready", state: ctx.state });
}

/**
 * Play dedicated silent HTMLAudioElement once, then discard.
 * muted=true, volume=0 — no unmute, no volume restore, no alert asset.
 */
function unlockHtmlAudioElementSilent(): void {
  try {
    const a = new Audio(SILENT_WAV_DATA_URI);
    a.muted = true;
    a.volume = 0;
    void a
      .play()
      .then(() => {
        try {
          a.pause();
          a.currentTime = 0;
          a.removeAttribute("src");
          a.load();
        } catch {
          /* discard best-effort */
        }
        logUnlock({ stage: "html_audio_silent", ok: true, asset: "silent" });
      })
      .catch((err: unknown) => {
        logUnlock({
          stage: "html_audio_silent",
          ok: false,
          asset: "silent",
          error: err instanceof Error ? err.message : String(err),
        });
      });
  } catch (err) {
    logUnlock({
      stage: "html_audio_silent_throw",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function isNotificationSoundUnlocked(): boolean {
  return unlocked;
}

/** App-lifetime silent unlock on user gesture. Idempotent per WebView session. */
export function unlockNotificationSoundAudio(): void {
  if (typeof window === "undefined" || unlocked) return;
  unlocked = true;
  logUnlock({ stage: "enter", asset: "silent" });
  void resumeAudioContextIfNeeded();
  unlockHtmlAudioElementSilent();
}

/** @internal test hook */
export function resetNotificationSoundUnlockForTests(): void {
  unlocked = false;
  try {
    if (sharedUnlockCtx && sharedUnlockCtx.state !== "closed") {
      void sharedUnlockCtx.close();
    }
  } catch {
    /* ignore */
  }
  sharedUnlockCtx = null;
}
