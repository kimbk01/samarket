/**
 * Phase F — room snapshot read version (content clock).
 * Separate from home unread truth (`messenger-consistency-version`).
 * docs/community-messenger/2026-07-23-four-domain-phase-f.md
 */

import type { ChatDomain } from "@/lib/chat-domain/four-domain-freeze";

export type RoomReadSource =
  | "server_bootstrap"
  | "memory_cache"
  | "hot_cache"
  | "idb"
  | "optimistic"
  | "unknown";

export type DomainRoomReadVersion = {
  roomId: string;
  versionMs: number;
  source: RoomReadSource;
  chatDomain?: ChatDomain | null;
  domainIdentity?: string | null;
};

const SOURCE_RANK: Record<RoomReadSource, number> = {
  server_bootstrap: 40,
  memory_cache: 30,
  hot_cache: 25,
  idb: 20,
  unknown: 10,
  optimistic: 0,
};

export function roomReadSourceRank(source: RoomReadSource): number {
  return SOURCE_RANK[source] ?? SOURCE_RANK.unknown;
}

export function versionMsFromIso(...values: Array<string | null | undefined>): number {
  let max = 0;
  for (const v of values) {
    const t = Date.parse(String(v ?? "").trim());
    if (Number.isFinite(t) && t > max) max = t;
  }
  return max;
}

/** Derive content clock from room lastMessageAt + message createdAt (not cache write time). */
export function deriveRoomReadVersionMs(input: {
  lastMessageAt?: string | null;
  messageCreatedAts?: Array<string | null | undefined>;
  explicitVersionMs?: number | null;
}): number {
  if (
    typeof input.explicitVersionMs === "number" &&
    Number.isFinite(input.explicitVersionMs) &&
    input.explicitVersionMs > 0
  ) {
    return Math.floor(input.explicitVersionMs);
  }
  return versionMsFromIso(input.lastMessageAt, ...(input.messageCreatedAts ?? []));
}

export function compareRoomReadVersions(
  prev: DomainRoomReadVersion,
  incoming: DomainRoomReadVersion,
): "accept_incoming" | "keep_prev" | "tie_prefer_incoming_source" {
  const p = Math.floor(prev.versionMs);
  const i = Math.floor(incoming.versionMs);
  if (i < p) return "keep_prev";
  if (i > p) return "accept_incoming";
  const pr = roomReadSourceRank(prev.source);
  const ir = roomReadSourceRank(incoming.source);
  if (ir > pr) return "accept_incoming";
  if (ir < pr) return "keep_prev";
  return "tie_prefer_incoming_source";
}

/**
 * Stale snapshot restore guard.
 * Optimistic never replaces equal-or-newer server/cache (source rank).
 */
export function shouldAcceptIncomingRoomRead(
  prev: DomainRoomReadVersion | null | undefined,
  incoming: DomainRoomReadVersion,
): boolean {
  if (!prev || !Number.isFinite(prev.versionMs) || prev.versionMs <= 0) {
    return Number.isFinite(incoming.versionMs) && incoming.versionMs >= 0;
  }
  if (!Number.isFinite(incoming.versionMs) || incoming.versionMs < 0) return false;
  const cmp = compareRoomReadVersions(prev, incoming);
  return cmp === "accept_incoming" || cmp === "tie_prefer_incoming_source";
}
