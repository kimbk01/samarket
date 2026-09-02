/**
 * CUT 2 — call priority adapters (reuse Call V4 + active-call session).
 * Do not invent a second call-presence system.
 */

import {
  getActiveCallSessionCallId,
  readActiveCallSessionSnapshot,
  subscribeActiveCallSession,
} from "@/lib/call/active-call-session";
import {
  readCallV4Phase,
  useCallV4Store,
} from "@/lib/community-messenger/call-v4/call-v4-store";
import type { CallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-types";
import {
  getMessengerCallMainBottomNavSuppressed,
  subscribeMessengerCallMainBottomNavSuppressed,
} from "@/lib/layout/messenger-call-main-bottom-nav-suppress";

const INCOMING_PHASES = new Set<CallV4Phase>(["incoming_ringing"]);
const ACTIVE_PHASES = new Set<CallV4Phase>([
  "outgoing_ringing",
  "creating",
  "accepting",
  "joining",
  "connected",
]);
const NATIVE_TRANSITION_PHASES = new Set<CallV4Phase>(["accepting", "joining", "creating"]);

export type PlatformPopupCallRuntimeSnapshot = {
  incomingCall: boolean;
  activeCall: boolean;
  nativeCallTransition: boolean;
};

export function readPlatformPopupCallRuntimeSnapshot(): PlatformPopupCallRuntimeSnapshot {
  const phase = readCallV4Phase();
  const session = readActiveCallSessionSnapshot();
  const sessionLive =
    Boolean(getActiveCallSessionCallId()) &&
    session != null &&
    (session.phase === "dialing" ||
      session.phase === "ringing" ||
      session.phase === "connecting" ||
      session.phase === "active" ||
      session.phase === "ending");

  const incomingCall = INCOMING_PHASES.has(phase) || session?.phase === "ringing";
  const activeCall =
    ACTIVE_PHASES.has(phase) ||
    sessionLive ||
    getMessengerCallMainBottomNavSuppressed();
  const nativeCallTransition =
    NATIVE_TRANSITION_PHASES.has(phase) || session?.phase === "connecting";

  return {
    incomingCall: Boolean(incomingCall),
    activeCall: Boolean(activeCall),
    nativeCallTransition: Boolean(nativeCallTransition),
  };
}

/** Event-driven call gate — no campaign polling; zustand + session + chrome suppress. */
export function subscribePlatformPopupCallRuntime(onStore: () => void): () => void {
  const unsubV4 = useCallV4Store.subscribe(() => onStore());
  const unsubSession = subscribeActiveCallSession(onStore);
  const unsubChrome = subscribeMessengerCallMainBottomNavSuppressed(onStore);
  return () => {
    unsubV4();
    unsubSession();
    unsubChrome();
  };
}
