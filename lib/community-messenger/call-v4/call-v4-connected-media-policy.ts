import type { CallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-types";

/** Video publish/subscribe and remote attach — connected only. */
export function canAttachCallV4VideoMedia(phase: CallV4Phase): boolean {
  return phase === "connected";
}

/** OS PiP and Call Dock — connected only. */
export function canEnterCallV4PipOrDock(phase: CallV4Phase): boolean {
  return phase === "connected";
}
