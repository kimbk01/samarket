"use client";

/**
 * Perfect Negotiation helpers (MDN pattern) for glare-safe offer/answer handling.
 *
 * This module is intentionally small and UI-agnostic:
 * - caller/callee role 결정은 상위에서(politeness) 주입
 * - signaling 전송/저장은 상위에서 수행
 */

export type PerfectNegotiationState = {
  makingOffer: boolean;
  ignoreOffer: boolean;
  isSettingRemoteAnswerPending: boolean;
};

export function createPerfectNegotiationState(): PerfectNegotiationState {
  return { makingOffer: false, ignoreOffer: false, isSettingRemoteAnswerPending: false };
}

export function isStableForOffer(pc: RTCPeerConnection, st: PerfectNegotiationState): boolean {
  return pc.signalingState === "stable" || st.isSettingRemoteAnswerPending;
}

/**
 * Offer collision(glare) 판단: 상대 offer가 왔는데
 * - 내가 offer 만들고 있거나
 * - signalingState가 stable이 아닌 경우
 */
export function isOfferCollision(pc: RTCPeerConnection, st: PerfectNegotiationState): boolean {
  return st.makingOffer || !isStableForOffer(pc, st);
}

/**
 * Remote offer 적용. polite=false이고 glare면 ignore로 처리.
 * polite=true인 경우 rollback(필요 시) 후 remote offer 적용.
 */
export async function applyRemoteOfferWithPerfectNegotiation(args: {
  pc: RTCPeerConnection;
  st: PerfectNegotiationState;
  offer: RTCSessionDescriptionInit;
  polite: boolean;
}): Promise<{ ok: true } | { ok: false; ignored: boolean; error: string }> {
  const { pc, st, offer, polite } = args;
  const collision = isOfferCollision(pc, st);
  st.ignoreOffer = !polite && collision;
  if (st.ignoreOffer) {
    return { ok: false, ignored: true, error: "glare_ignored" };
  }
  try {
    st.isSettingRemoteAnswerPending = offer.type === "answer";
    if (collision) {
      // polite side: rollback local offer to accept remote offer
      await pc.setLocalDescription({ type: "rollback" });
    }
    await pc.setRemoteDescription(offer);
    st.isSettingRemoteAnswerPending = false;
    return { ok: true };
  } catch (e) {
    st.isSettingRemoteAnswerPending = false;
    const msg = typeof e === "object" && e && "message" in e ? String((e as { message?: unknown }).message) : "set_remote_failed";
    return { ok: false, ignored: false, error: msg };
  }
}

