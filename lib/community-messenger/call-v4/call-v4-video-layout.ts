import { computeCallPipDimensions } from "@/lib/community-messenger/call-pip-metrics";

export { isCallV4DedicatedSessionPath } from "@/lib/community-messenger/call-v4/call-v4-session-path";

/** V4 self view — 9:16 portrait (Telegram-style vertical PiP). */
export function computeCallV4SelfViewDimensions(viewportWidth: number, expanded = false): {
  width: number;
  height: number;
} {
  const base = computeCallPipDimensions(viewportWidth, expanded);
  const width = base.width;
  const height = Math.round((width * 16) / 9);
  return { width, height };
}
