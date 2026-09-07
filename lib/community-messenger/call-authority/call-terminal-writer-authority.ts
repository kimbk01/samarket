/**
 * CUT 1 — Call Terminal Writer SSOT
 *
 * ONLY this server function may mutate terminal session fields
 * (status → terminal, ended_at, ended_reason) for product call lifecycle:
 *
 *   updateCommunityMessengerCallSession
 *     (lib/community-messenger/service.ts)
 *
 * Allowed callers that must go through that function:
 *   - HTTP accept / reject / cancel / end / missed / leave
 *   - reconcileUserLiveCallSessions
 *   - cleanupStaleActiveCommunityMessengerCallSessions (heartbeat both-stale)
 *   - forceEnd / redial / incoming policy supersede
 *
 * FORBIDDEN terminal writers:
 *   - SQL direct UPDATE of status/ended_at/ended_reason (incl. legacy pg_cron body)
 *   - Native inventing terminal without PATCH to the updater
 *   - Push / chat inventing session terminal state
 *
 * Presence end predicate: canEndActiveCallForPresenceStale (both-stale AND only).
 * First valid terminal transition wins via CAS (.eq("status", currentStatus)).
 */

export const CALL_TERMINAL_SESSION_WRITER = "updateCommunityMessengerCallSession" as const;

export const CALL_TERMINAL_STALE_CLEANUP_PATH =
  "/api/community-messenger/calls/sessions/stale-cleanup" as const;

/** SQL detect-only RPC — must never mutate terminal columns after CUT1. */
export const CALL_STALE_CANDIDATE_DETECT_RPC =
  "cleanup_stale_community_messenger_call_sessions" as const;
