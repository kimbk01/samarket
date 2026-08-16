/**
 * Legacy-app style soft click for main bottom-nav hub transitions.
 * Web Audio only — no remote asset. Skip when reduced-motion or missing AudioContext.
 */

let sharedCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!sharedCtx || sharedCtx.state === "closed") {
    try {
      sharedCtx = new AC();
    } catch {
      return null;
    }
  }
  return sharedCtx;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Soft tick — short descending blip (카톡/레거시 탭 전환 체감). */
export function playMainBottomNavTransitionSound(): void {
  if (typeof window === "undefined") return;
  if (prefersReducedMotion()) return;

  const ctx = getCtx();
  if (!ctx) return;

  const run = () => {
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.06);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.045, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    } catch {
      /* ignore autoplay / closed */
    }
  };

  if (ctx.state === "suspended") {
    void ctx.resume().then(run).catch(() => undefined);
    return;
  }
  run();
}
