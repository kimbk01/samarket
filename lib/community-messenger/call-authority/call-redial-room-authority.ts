/**
 * Call history redial room Authority (server).
 *
 * A call log keeps the room the call happened in. That room can stop being callable for the
 * viewer (left / removed participant, readonly, blocked, quarantined, domain-less legacy row).
 * `startCommunityMessengerCallSession` then rejects the dial (room_not_found,
 * call_room_quarantined, room_domain_required, room_unavailable).
 *
 * Contract:
 *   - Historic room is kept only when it is still callable by the viewer → preserves
 *     trade / store_order / group domain rooms.
 *   - Otherwise 1:1 redial uses the canonical general direct room for the peer
 *     (`ensureGeneralFriendDirectRoom` — creates / re-admits; hidden room revived).
 *   - Never pick "some other call log row's room" on the client.
 */

export type HistoricRedialRoomRow = {
  room_type?: string | null;
  room_status?: string | null;
  is_readonly?: boolean | null;
  deleted_at?: string | null;
};

export type HistoricRedialParticipantRow = {
  user_id?: string | null;
  left_at?: string | null;
};

export type HistoricRedialRoomRejectReason =
  | "room_not_found"
  | "room_deleted"
  | "call_room_quarantined"
  | "room_domain_required"
  | "room_unavailable"
  | "viewer_not_participant"
  | "peer_not_participant";

export type HistoricRedialRoomVerdict =
  | { callable: true }
  | { callable: false; reason: HistoricRedialRoomRejectReason };

function isActiveParticipant(
  rows: ReadonlyArray<HistoricRedialParticipantRow>,
  userId: string
): boolean {
  const uid = userId.trim();
  if (!uid) return false;
  return rows.some((row) => {
    if (String(row.user_id ?? "").trim() !== uid) return false;
    return row.left_at == null || String(row.left_at).trim() === "";
  });
}

export function evaluateHistoricRedialRoom(input: {
  viewerUserId: string;
  peerUserId: string | null;
  room: HistoricRedialRoomRow | null;
  isGroupRoom: boolean;
  quarantined: boolean;
  domainEnvelopePresent: boolean;
  participants: ReadonlyArray<HistoricRedialParticipantRow>;
}): HistoricRedialRoomVerdict {
  if (!input.room) return { callable: false, reason: "room_not_found" };
  if (String(input.room.deleted_at ?? "").trim()) return { callable: false, reason: "room_deleted" };
  if (input.quarantined) return { callable: false, reason: "call_room_quarantined" };
  if (!input.domainEnvelopePresent) return { callable: false, reason: "room_domain_required" };
  const status = String(input.room.room_status ?? "active").trim() || "active";
  if (status !== "active" || input.room.is_readonly === true) {
    return { callable: false, reason: "room_unavailable" };
  }
  if (!isActiveParticipant(input.participants, input.viewerUserId)) {
    return { callable: false, reason: "viewer_not_participant" };
  }
  const peer = String(input.peerUserId ?? "").trim();
  if (!input.isGroupRoom && peer && !isActiveParticipant(input.participants, peer)) {
    return { callable: false, reason: "peer_not_participant" };
  }
  return { callable: true };
}

export type RedialRoomResolveResult =
  | {
      ok: true;
      roomId: string;
      source: "historic_room" | "canonical_direct";
      historicRejectReason?: HistoricRedialRoomRejectReason;
    }
  | { ok: false; error: string };
