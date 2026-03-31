/** 브라우저에서만 호출. 모임 오픈채팅 새 메시지 알림용 짧은 고각 비파음 2회. */

export function playLoudOpenChatPing(): void {
  if (typeof window === "undefined") return;
  try {
    const AC = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const schedulePulse = (start: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "square";
      osc.frequency.value = 1120;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.42, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
      osc.start(start);
      osc.stop(start + 0.14);
    };
    const t0 = ctx.currentTime;
    schedulePulse(t0);
    schedulePulse(t0 + 0.14);
    window.setTimeout(() => {
      void ctx.close();
    }, 400);
  } catch {
    /* ignore */
  }
}
