/**
 * Call stub (chat timeline `call_stub`) sender Authority.
 *
 * `dibay_append_room_message_atomic` requires the sender to be an *active* participant
 * (`not_member` / `participant_left` otherwise). The terminal actor (who hung up / rejected)
 * may have left the room — e.g. a general_direct room where one side is no longer a participant.
 * Using that actor as sender made the stub INSERT fail while `community_messenger_call_logs`
 * was already written → call history and chat list diverged.
 *
 * Contract:
 *   - Sender = first *active* member among [preferred actor, terminal actor, initiator, recipient].
 *   - Active = left_at IS NULL and blocked_hidden_at IS NULL (no membership heal / re-admit).
 *   - Projection semantics (label, resolvedEvent, terminalActorUserId metadata) never change —
 *     only the row's sender_id falls back.
 *   - No active candidate → explicit `no_active_stub_sender` failure (never a silent drop).
 *   - Call stub projection must not mutate participants (no left_at / blocked_hidden_at clear).
 */

export const CALL_STUB_NO_ACTIVE_SENDER_ERROR = "no_active_stub_sender" as const;

export function resolveCallStubSenderCandidates(input: {
  preferredUserId: string | null | undefined;
  terminalActorUserId?: string | null;
  initiatorUserId?: string | null;
  recipientUserId?: string | null;
}): string[] {
  const out: string[] = [];
  for (const raw of [
    input.preferredUserId,
    input.terminalActorUserId,
    input.initiatorUserId,
    input.recipientUserId,
  ]) {
    const id = String(raw ?? "").trim();
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

export function pickActiveCallStubSender(
  candidates: readonly string[],
  participantRows: ReadonlyArray<{
    user_id?: string | null;
    left_at?: string | null;
    blocked_hidden_at?: string | null;
  }>
): string | null {
  const active = new Set<string>();
  for (const row of participantRows) {
    const id = String(row.user_id ?? "").trim();
    if (!id) continue;
    if (row.left_at != null && String(row.left_at).trim() !== "") continue;
    if (row.blocked_hidden_at != null && String(row.blocked_hidden_at).trim() !== "") continue;
    active.add(id);
  }
  for (const candidate of candidates) {
    if (active.has(candidate)) return candidate;
  }
  return null;
}

export type CallStubAppendResult =
  | { ok: true; messageId: string | null; senderId: string | null; skipped?: "no_room" }
  | { ok: false; error: string; candidates?: string[] };
