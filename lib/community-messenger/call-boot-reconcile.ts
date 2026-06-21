"use client";

import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import {
  isCallActionLockHeld,
  readCallActionLockSnapshot,
  releaseCallActionLock,
} from "@/lib/call/call-action-lock";
import { releaseLocalCallSession } from "@/lib/call/active-call-session";
import { runCallEndGuard } from "@/lib/call/actions/call-end-guard";
import {
  endNativeCallServiceLocalOnly,
  readNativeActiveCallId,
  readNativeActiveCallSnapshot,
} from "@/lib/call/native/native-call-service";
import {
  isTerminalCallRecoveryStatus,
  writeTerminalCallRecoverySuppress,
} from "@/lib/community-messenger/call-active-session-recovery";
import { clearDibayCallPendingRoute } from "@/lib/community-messenger/dibay-fcm-call-bridge";
import { logDibayCall } from "@/lib/community-messenger/call-orchestrator";
import {
  markCallConsumed,
  type CallConsumedReason,
} from "@/lib/community-messenger/incoming-call-state";
import {
  incomingRingTimeoutMsFromConfig,
  DEFAULT_INCOMING_RING_TIMEOUT_SECONDS,
} from "@/lib/community-messenger/messenger-call-ring-timeout";
import { fetchMessengerCallSoundConfig } from "@/lib/community-messenger/messenger-call-sound-config-client";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import {
  clearNativePersistedCallPendingRoute,
  getNativeIncomingCallPlugin,
} from "@/lib/push/native/push-route-native-bridge";

let bootReconcilePromise: Promise<void> | null = null;

function mapBootConsumedReason(terminalKind: string): CallConsumedReason {
  switch (terminalKind.trim().toLowerCase()) {
    case "rejected":
      return "declined";
    case "missed":
      return "missed";
    case "ended":
      return "ended";
    case "cancelled":
    case "canceled":
      return "cancelled";
    default:
      return "ended";
  }
}

async function fetchSessionForBootReconcile(sessionId: string): Promise<CommunityMessengerCallSession | null> {
  const sid = sessionId.trim();
  if (!sid) return null;
  const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sid)}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    session?: CommunityMessengerCallSession | null;
  };
  if (!json.ok || !json.session?.id) return null;
  return json.session;
}

async function finalizeNativeCallTerminal(
  sessionId: string,
  terminalKind: string,
  source: string
): Promise<void> {
  const sid = sessionId.trim();
  if (!sid) return;
  const consumedReason = mapBootConsumedReason(terminalKind);
  markCallConsumed(sid, consumedReason);
  writeTerminalCallRecoverySuppress(sid);
  const plugin = await getNativeIncomingCallPlugin();
  if (plugin?.notifyCallTerminal) {
    try {
      await plugin.notifyCallTerminal({ sessionId: sid, terminalKind, source });
    } catch {
      if (plugin.markCallConsumed) {
        await plugin.markCallConsumed({ sessionId: sid, reason: consumedReason }).catch(() => {});
      }
    }
  } else if (plugin?.markCallConsumed) {
    await plugin.markCallConsumed({ sessionId: sid, reason: consumedReason }).catch(() => {});
  }
  await endNativeCallServiceLocalOnly(sid, source).catch(() => {});
  await releaseLocalCallSession(sid, terminalKind);
}

async function cancelStaleOutgoingRinging(session: CommunityMessengerCallSession, source: string): Promise<void> {
  const sid = session.id.trim();
  if (!sid) return;
  logDibayCall("boot_stale_outgoing_cancel", { sessionId: sid, callId: sid, source });
  await finalizeNativeCallTerminal(sid, "cancelled", source);
  await runCallEndGuard({ sessionId: sid, action: "cancel", reason: source });
}

async function collectBootReconcileCandidateIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  const plugin = await getNativeIncomingCallPlugin();
  if (plugin) {
    try {
      const fg = await plugin.getForegroundIncomingCallId();
      const fgId = fg?.callId?.trim();
      if (fgId) ids.add(fgId);
    } catch {
      /* ignore */
    }
    if (plugin.getNativeIncomingStoreCallId) {
      try {
        const store = await plugin.getNativeIncomingStoreCallId();
        const storeId = store?.callId?.trim();
        if (storeId) ids.add(storeId);
      } catch {
        /* ignore */
      }
    }
  }
  const nativeActive = (await readNativeActiveCallId())?.trim();
  if (nativeActive) ids.add(nativeActive);
  const nativeSnap = await readNativeActiveCallSnapshot();
  const snapId = nativeSnap?.callId?.trim();
  if (snapId) ids.add(snapId);
  return ids;
}

async function reconcileOrphanCallActionLock(): Promise<void> {
  if (!isCallActionLockHeld()) return;
  const snap = readCallActionLockSnapshot();
  const boundId = snap?.callId?.trim() ?? "";
  if (!boundId) {
    releaseCallActionLock("boot_orphan_lock");
    return;
  }
  const session = await fetchSessionForBootReconcile(boundId);
  const status = session?.status?.trim().toLowerCase() ?? "";
  if (!session || isTerminalCallRecoveryStatus(status) || (status === "ringing" && session.isMineInitiator)) {
    releaseCallActionLock("boot_stale_lock");
  }
}

/**
 * APK cold start — native store·pending route·서버 stale ringing 과 로컬 lock 을 단일 reconcile.
 * FCM route replay·active recovery 전에 1회 실행한다.
 */
export async function reconcileCallsOnAppBoot(): Promise<void> {
  if (!isCapacitorNativePlatform()) return;
  const userId = (await getCurrentUserIdForDb())?.trim();
  if (!userId) return;

  clearDibayCallPendingRoute();
  await clearNativePersistedCallPendingRoute();

  const soundCfg = await fetchMessengerCallSoundConfig().catch(() => null);
  const ringTimeoutMs = incomingRingTimeoutMsFromConfig(soundCfg);
  const ringTimeoutSec = soundCfg?.incoming_ring_timeout_seconds ?? DEFAULT_INCOMING_RING_TIMEOUT_SECONDS;

  const incomingRes = await fetch("/api/community-messenger/calls/sessions/incoming?directOnly=1", {
    credentials: "include",
    cache: "no-store",
  });
  const incomingJson = (await incomingRes.json().catch(() => ({}))) as {
    ok?: boolean;
    sessions?: CommunityMessengerCallSession[];
  };
  const incomingList = incomingRes.ok && incomingJson.ok ? incomingJson.sessions ?? [] : [];

  for (const session of incomingList) {
    if (session.isMineInitiator && session.status === "ringing") {
      await cancelStaleOutgoingRinging(session, "boot_stale_outgoing_incoming_list");
    }
  }

  const candidateIds = await collectBootReconcileCandidateIds();
  for (const session of incomingList) {
    if (session.id?.trim()) candidateIds.add(session.id.trim());
  }

  for (const sid of candidateIds) {
    const session = await fetchSessionForBootReconcile(sid);
    if (!session) {
      await finalizeNativeCallTerminal(sid, "cancelled", "boot_session_missing");
      continue;
    }
    const status = session.status?.trim().toLowerCase() ?? "";
    if (isTerminalCallRecoveryStatus(status)) {
      await finalizeNativeCallTerminal(sid, status, `boot_terminal_${status}`);
      continue;
    }
    if (status === "ringing" && session.isMineInitiator) {
      await cancelStaleOutgoingRinging(session, "boot_stale_outgoing_native_candidate");
      continue;
    }
    if (status === "ringing" && !session.isMineInitiator) {
      const startedMs = Date.parse(session.startedAt);
      const ageMs = Number.isFinite(startedMs) ? Date.now() - startedMs : 0;
      if (ageMs > ringTimeoutMs) {
        logDibayCall("boot_stale_incoming_missed", {
          sessionId: sid,
          callId: sid,
          ageMs,
          ringTimeoutSec,
        });
        await finalizeNativeCallTerminal(sid, "missed", "boot_stale_incoming_ringing");
        await runCallEndGuard({ sessionId: sid, action: "missed", reason: "boot_stale_incoming_ringing" });
      }
      continue;
    }
    if (status === "active") {
      const nativeSnap = await readNativeActiveCallSnapshot();
      const nativeConnected = nativeSnap?.connected === true && nativeSnap.callId?.trim() === sid;
      if (!nativeConnected) {
        logDibayCall("boot_orphan_active_end", { sessionId: sid, callId: sid });
        await finalizeNativeCallTerminal(sid, "ended", "boot_orphan_active");
        await runCallEndGuard({ sessionId: sid, action: "end", reason: "boot_orphan_active" });
      }
    }
  }

  await reconcileOrphanCallActionLock();
}

/** single-flight — route replay·recovery 가 동일 reconcile 을 공유 */
export function ensureCallBootReconcile(): Promise<void> {
  if (!isCapacitorNativePlatform()) return Promise.resolve();
  if (!bootReconcilePromise) {
    bootReconcilePromise = reconcileCallsOnAppBoot().catch((error) => {
      bootReconcilePromise = null;
      console.info("[DIBAY_CALL] boot_reconcile_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    });
  }
  return bootReconcilePromise;
}

/** 테스트·계정 전환 후 재실행 */
export function resetCallBootReconcileForTests(): void {
  bootReconcilePromise = null;
}
