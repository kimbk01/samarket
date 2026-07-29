/**
 * Call history peer projection Authority.
 * Storage is one `community_messenger_call_logs` row per `session_id` (unique index):
 *   caller_user_id = initiator
 *   peer_user_id   = recipient (always the other participant — never viewer-relative)
 *
 * Viewer-facing "other participant" for UI uses `resolveCallLogDisplayPeerUserId`.
 * DO NOT pass mapCallSession(...).peerUserId into createCommunityMessengerCallLog —
 * that value is viewer-relative and contaminates reject/missed paths (peer == caller).
 */

export function resolveCanonicalCallLogCallerUserId(input: {
  initiatorUserId: string | null | undefined;
}): string | null {
  const initiator = String(input.initiatorUserId ?? "").trim();
  return initiator || null;
}

/** Canonical stored peer = session recipient (callee). Never equals caller for direct calls. */
export function resolveCanonicalCallLogPeerUserId(input: {
  initiatorUserId: string | null | undefined;
  recipientUserId: string | null | undefined;
}): string | null {
  const initiator = String(input.initiatorUserId ?? "").trim();
  const recipient = String(input.recipientUserId ?? "").trim();
  if (!initiator || !recipient) return recipient || null;
  if (initiator === recipient) return null;
  return recipient;
}

/** Viewer-relative other participant (for dual-row mental model / tests — not DB writer). */
export function resolveViewerCallHistoryPeerUserId(input: {
  viewerUserId: string;
  initiatorUserId: string | null | undefined;
  recipientUserId: string | null | undefined;
}): string | null {
  const viewer = String(input.viewerUserId ?? "").trim();
  const initiator = String(input.initiatorUserId ?? "").trim();
  const recipient = String(input.recipientUserId ?? "").trim();
  if (!viewer || !initiator || !recipient) return null;
  if (viewer === initiator) return recipient;
  if (viewer === recipient) return initiator;
  return null;
}

export function resolveViewerCallHistoryDirection(input: {
  viewerUserId: string;
  initiatorUserId: string | null | undefined;
}): "outgoing" | "incoming" | null {
  const viewer = String(input.viewerUserId ?? "").trim();
  const initiator = String(input.initiatorUserId ?? "").trim();
  if (!viewer || !initiator) return null;
  return viewer === initiator ? "outgoing" : "incoming";
}
