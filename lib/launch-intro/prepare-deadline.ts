/**
 * DIBAY Intro — PREPARING deadline (광고 감사: 「준비 단계 시간 제한」).
 *
 * PREPARING awaits native plugin calls (launch intent), the DeviceClass read and the local Cache
 * Storage reads/decodes. Any of them can stay unsettled (plugin proxy, storage stall); without a bound
 * the OS start screen stays because only the Intro owns the release. When the deadline passes first,
 * the caller hands the launch to COMMUNITY (abortLaunchIntroToCommunity) — Community then releases the
 * OS on its own first frame as usual. This is not a splash hide timer: it never dismisses anything.
 *
 * Bound = LAUNCH_INTRO_TOTAL_MAX_MS (Owner 2026-10-02 「인트로 최대 5초」): the start screen is never
 * held by a stalled PREPARING longer than the longest Intro the Owner allows. No separate value in the
 * Intro contract docs (13th SSOT, Lifecycle SSOT).
 */
import { LAUNCH_INTRO_TOTAL_MAX_MS } from "@/lib/launch-intro/document";

export const LAUNCH_INTRO_PREPARE_TIMEOUT_MS = LAUNCH_INTRO_TOTAL_MAX_MS;

export type LaunchIntroPrepareDeadline = {
  /** true once the deadline fired (the caller must stop — the launch already went to COMMUNITY). */
  readonly expired: boolean;
  /** PREPARING finished (success or its own abort). false when the deadline already fired. Clears the timer. */
  settle(): boolean;
  /** Unmount: clears the timer without firing. */
  cancel(): void;
};

export function startLaunchIntroPrepareDeadline(
  onTimeout: () => void,
  ms: number = LAUNCH_INTRO_PREPARE_TIMEOUT_MS
): LaunchIntroPrepareDeadline {
  let expired = false;
  let done = false;
  let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    timer = null;
    if (done) return;
    done = true;
    expired = true;
    onTimeout();
  }, ms);
  const clear = () => {
    if (timer != null) clearTimeout(timer);
    timer = null;
  };
  return {
    get expired() {
      return expired;
    },
    settle() {
      if (expired) return false;
      done = true;
      clear();
      return true;
    },
    cancel() {
      done = true;
      clear();
    },
  };
}
