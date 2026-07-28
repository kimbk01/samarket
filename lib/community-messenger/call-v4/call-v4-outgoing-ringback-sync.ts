import {
  startOutgoingRingback,
  stopOutgoingRingback,
} from "@/lib/community-messenger/call-outgoing-ringback-controller";
import {
  invalidateWebOutgoingRingbackOwnership,
  startWebOutgoingRingbackIfAllowed,
} from "@/lib/community-messenger/call-outgoing-ringback-ownership";
import type { CallV4Direction, CallV4MediaType, CallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-types";

export const CALL_V4_OUTGOING_RINGBACK_SOURCE = "call_v4_outgoing_screen";

export type SyncCallV4OutgoingRingbackArgs = {
  callId: string;
  phase: CallV4Phase;
  direction?: CallV4Direction;
  mediaType?: CallV4MediaType;
  /** URL `?source=outgoing` — false면 start/stop 모두 no-op */
  outgoingPresentation: boolean;
};

/**
 * V4 Web 발신 화면 — outgoing_ringing 링백 start/stop (legacy controller SSOT).
 * DO NOT: resolver/SSOT 경로 추가 — startOutgoingRingback 내부 read만 사용.
 * DO NOT: native outgoing shell 에서 Web ringback (Android Sync / iOS Async).
 * DO NOT: Async 판정 전 Web start.
 */
export function syncCallV4OutgoingRingback(args: SyncCallV4OutgoingRingbackArgs): void {
  if (args.direction !== "outgoing" || !args.outgoingPresentation) {
    return;
  }
  const callId = args.callId.trim();
  if (!callId) return;

  const kind = args.mediaType === "video" ? "video" : "voice";

  if (args.phase === "outgoing_ringing") {
    startWebOutgoingRingbackIfAllowed({
      kind,
      callId,
      isStillValid: () => true,
      start: () => {
        startOutgoingRingback({
          callId,
          kind,
          source: CALL_V4_OUTGOING_RINGBACK_SOURCE,
        });
      },
    });
    return;
  }

  invalidateWebOutgoingRingbackOwnership(callId);
  stopOutgoingRingback(callId, `call_v4_phase_${args.phase}`);
}
