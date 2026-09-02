/**
 * Phase E — Domain realtime envelope + dedupe key.
 * docs/community-messenger/2026-07-23-four-domain-phase-e.md
 *
 * Wire: optional on existing bump v2 payload (unknown domain → omit; receivers fall back).
 * DO NOT: applyHomeListPatch / hub / bell / Native Call.
 */

import { CHAT_DOMAINS, type ChatDomain } from "@/lib/chat-domain/four-domain-freeze";

export const DOMAIN_REALTIME_ENVELOPE_V = 1 as const;

export type DomainRealtimeKind = "room_bump";

export type DomainRealtimeEnvelope = {
  v: typeof DOMAIN_REALTIME_ENVELOPE_V;
  kind: DomainRealtimeKind;
  chatDomain: ChatDomain;
  domainIdentity: string;
  roomId: string;
  /** messageId preferred; else stable at/seq token */
  eventId: string;
  seq?: number | null;
};

const DOMAIN_SET = new Set<string>(CHAT_DOMAINS);

export function isChatDomain(value: unknown): value is ChatDomain {
  return typeof value === "string" && DOMAIN_SET.has(value);
}

/** `${chatDomain}\\0${domainIdentity}\\0${eventId}` (+ `\\0${seq}` when present). */
export function buildDomainRealtimeDedupeKey(env: Pick<
  DomainRealtimeEnvelope,
  "chatDomain" | "domainIdentity" | "eventId" | "seq"
>): string {
  const base = `${env.chatDomain}\0${env.domainIdentity.trim()}\0${env.eventId.trim()}`;
  if (env.seq == null || !Number.isFinite(env.seq)) return base;
  return `${base}\0${Math.trunc(env.seq)}`;
}

/**
 * Legacy bump dedupe (pre-domain): `${from}|${messageId|no-mid}|${at}`.
 * Used when chatDomain/domainIdentity absent on wire.
 */
export function buildLegacyRoomBumpDedupeKey(args: {
  fromUserId: string;
  messageId?: string | null;
  at?: string | null;
}): string {
  const from = args.fromUserId.trim();
  const hint = (args.messageId ?? "").trim() || "no-mid";
  const at = (args.at ?? "").trim();
  return `${from}|${hint}|${at}`;
}

export function buildDomainRealtimeEnvelope(args: {
  chatDomain: ChatDomain;
  domainIdentity: string;
  roomId: string;
  eventId: string;
  kind?: DomainRealtimeKind;
  seq?: number | null;
}): DomainRealtimeEnvelope | null {
  const chatDomain = args.chatDomain;
  const domainIdentity = args.domainIdentity.trim();
  const roomId = args.roomId.trim();
  const eventId = args.eventId.trim();
  if (!isChatDomain(chatDomain) || !domainIdentity || !roomId || !eventId) return null;
  return {
    v: DOMAIN_REALTIME_ENVELOPE_V,
    kind: args.kind ?? "room_bump",
    chatDomain,
    domainIdentity,
    roomId,
    eventId,
    ...(args.seq != null && Number.isFinite(args.seq) ? { seq: Math.trunc(args.seq) } : {}),
  };
}

/**
 * Parse bump v2 payload → Domain envelope when domain fields present.
 * Missing/invalid domain → null (caller uses legacy dedupe).
 */
export function parseDomainRealtimeEnvelopeFromBumpPayload(
  payload: Record<string, unknown>,
): DomainRealtimeEnvelope | null {
  const chatDomainRaw = payload.chatDomain ?? payload.chat_domain;
  const domainIdentityRaw = payload.domainIdentity ?? payload.domain_identity;
  if (!isChatDomain(chatDomainRaw)) return null;
  const domainIdentity =
    typeof domainIdentityRaw === "string" ? domainIdentityRaw.trim() : "";
  if (!domainIdentity) return null;

  const roomId =
    (typeof payload.canonicalRoomId === "string" && payload.canonicalRoomId.trim()) ||
    (typeof payload.roomId === "string" && payload.roomId.trim()) ||
    "";
  if (!roomId) return null;

  const messageId =
    typeof payload.messageId === "string"
      ? payload.messageId.trim()
      : typeof payload.message_id === "string"
        ? payload.message_id.trim()
        : "";
  const at = typeof payload.at === "string" ? payload.at.trim() : "";
  const eventId =
    (typeof payload.eventId === "string" && payload.eventId.trim()) ||
    messageId ||
    at;
  if (!eventId) return null;

  const seqRaw = payload.seq;
  const seq =
    typeof seqRaw === "number" && Number.isFinite(seqRaw)
      ? Math.trunc(seqRaw)
      : null;

  return buildDomainRealtimeEnvelope({
    chatDomain: chatDomainRaw,
    domainIdentity,
    roomId,
    eventId,
    kind: "room_bump",
    seq,
  });
}

/**
 * Prefer domain dedupe; else legacy.
 *
 * Same `messageId` can be bumped twice (INSERT then metadata UPDATE). Domain eventId often
 * equals messageId only — always fold wire `at` (or eventIdentity) so UPDATE is not dropped.
 */
export function resolveRoomBumpDedupeKey(payload: Record<string, unknown>): string {
  const at = typeof payload.at === "string" ? payload.at.trim() : "";
  const eventIdentity =
    typeof payload.eventIdentity === "string" ? payload.eventIdentity.trim() : "";
  const revision = at || eventIdentity;
  const env = parseDomainRealtimeEnvelopeFromBumpPayload(payload);
  if (env) {
    const base = buildDomainRealtimeDedupeKey(env);
    return revision ? `${base}\0${revision}` : base;
  }
  const from = typeof payload.fromUserId === "string" ? payload.fromUserId.trim() : "";
  const messageId =
    typeof payload.messageId === "string"
      ? payload.messageId.trim()
      : typeof payload.message_id === "string"
        ? payload.message_id.trim()
        : "";
  return buildLegacyRoomBumpDedupeKey({ fromUserId: from, messageId, at: revision });
}
