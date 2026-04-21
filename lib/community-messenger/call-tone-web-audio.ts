/**
 * 통화 벨·링백 — Web Audio 로 생성(외부 음원 파일·타사 앱과 동일 음원 미사용).
 * 음성/영상에 서로 다른 주파수·리듬을 둔다.
 */

export type CallToneWebMode = "incoming" | "outgoing";
export type CallToneWebKind = "voice" | "video";

export type WebAudioCallToneHandle = { stop: () => void };

/**
 * 발신 버튼 등 **동기 사용자 제스처** 안에서만 호출한다.
 * `router` 이동·`await fetch` 뒤에는 자동재생이 막히므로, 그 전에 컨텍스트를 resume 해 둔다.
 */
let gesturePrimedToneContext: AudioContext | null = null;

export function primeWebAudioCallToneContextFromUserGesture(): void {
  if (typeof window === "undefined") return;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  if (!gesturePrimedToneContext || gesturePrimedToneContext.state === "closed") {
    gesturePrimedToneContext = new AC();
  }
  void gesturePrimedToneContext.resume();
}

function connectDualTone(
  ctx: AudioContext,
  destination: AudioNode,
  freqs: [number, number],
  durationSec: number,
  gainValue: number
): void {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(gainValue, ctx.currentTime + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationSec);
  g.connect(destination);

  for (const hz of freqs) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(hz, ctx.currentTime);
    osc.connect(g);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + durationSec + 0.02);
  }
}

/** 수신: 짧은 링 반복 / 발신: 링백(길게 한 번 + 묵음) */
export function startWebAudioCallTone(mode: CallToneWebMode, kind: CallToneWebKind): WebAudioCallToneHandle | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;

  const primed = gesturePrimedToneContext;
  const usePrimed = primed != null && primed.state !== "closed";
  const ctx: AudioContext = usePrimed ? primed : new AC();
  const ownsContext = !usePrimed;
  if (usePrimed) void ctx.resume();

  const master = ctx.createGain();
  const vol = mode === "incoming" ? 0.2 : 0.12;
  master.gain.value = vol;
  master.connect(ctx.destination);

  let stopped = false;
  let intervalId: number | null = null;

  const resume = () => {
    if (ctx.state === "suspended") void ctx.resume();
  };
  if (ownsContext) {
    window.addEventListener("pointerdown", resume, { passive: true });
    window.addEventListener("touchstart", resume, { passive: true });
  }

  const voiceInFreqs: [number, number] = [440, 480];
  const videoInFreqs: [number, number] = [523.25, 659.25];
  const incomingFreqs = kind === "video" ? videoInFreqs : voiceInFreqs;
  const incomingBurst = kind === "video" ? 0.22 : 0.38;
  const incomingGap = kind === "video" ? 1600 : 2200;

  const voiceOutFreqs: [number, number] = [440, 480];
  const videoOutFreqs: [number, number] = [587.33, 783.99];
  const outgoingFreqs = kind === "video" ? videoOutFreqs : voiceOutFreqs;
  const outgoingBurst = kind === "video" ? 0.35 : 1.85;
  const outgoingGap = kind === "video" ? 2800 : 4200;

  const tickIncoming = () => {
    if (stopped) return;
    resume();
    connectDualTone(ctx, master, incomingFreqs, incomingBurst, 0.55);
  };

  const tickOutgoing = () => {
    if (stopped) return;
    resume();
    connectDualTone(ctx, master, outgoingFreqs, outgoingBurst, kind === "video" ? 0.5 : 0.42);
  };

  if (mode === "incoming") {
    tickIncoming();
    intervalId = window.setInterval(tickIncoming, incomingGap);
  } else {
    tickOutgoing();
    intervalId = window.setInterval(tickOutgoing, outgoingGap);
  }

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (ownsContext) {
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("touchstart", resume);
    }
    if (intervalId != null) window.clearInterval(intervalId);
    try {
      master.disconnect();
      if (ownsContext) void ctx.close();
    } catch {
      /* ignore */
    }
  };

  return { stop };
}
