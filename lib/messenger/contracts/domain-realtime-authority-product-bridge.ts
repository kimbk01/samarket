/**
 * Allowlist Domain Realtime Authority — product bridge from CM home list hints.
 * Converts Legacy CM home insert hints into Domain event envelopes and applies
 * via applyDomainRealtimeAuthorityEnvelope (Phase6 singleton). Legacy UI list
 * patch remains separate until Legacy Removal.
 *
 * No new Identity / Bootstrap / Cache SSOT. Fail-soft: never throws into UI path.
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import {
  applyDomainRealtimeAuthorityEnvelope,
  createDomainRealtimeAuthorityPort,
  isDomainRealtimeAuthorityEnabledForViewer,
  type DomainRealtimeAuthorityApplyResult,
} from "@/lib/messenger/contracts/domain-realtime-authority";
import { MESSENGER_DOMAIN_EVENT_SCHEMA_VERSION } from "@/lib/messenger/contracts/domain-event-envelope";

export function tryApplyDomainRealtimeAuthorityFromHomeMessageHint(input: {
  viewerUserId: string;
  domain: ChatDomain;
  domainIdentityKey: string;
  roomId: string;
  messageRow: Record<string, unknown> | null | undefined;
}): DomainRealtimeAuthorityApplyResult | { status: "skipped"; reason: "authority_off_or_not_allowlisted" | "bridge_invalid" } {
  const viewer = input.viewerUserId.trim();
  if (!viewer || !isDomainRealtimeAuthorityEnabledForViewer(viewer)) {
    return { status: "skipped", reason: "authority_off_or_not_allowlisted" };
  }
  if (input.domain === "store_order") {
    // customer surface only — owner excluded at Authority gate
  }
  const row = input.messageRow ?? {};
  const messageId = String(row.id ?? row.message_id ?? "").trim();
  const text = String(row.body ?? row.text ?? row.content ?? "").slice(0, 500);
  const occurredAt = String(
    row.created_at ?? row.occurred_at ?? row.updated_at ?? new Date().toISOString()
  ).trim();
  if (!messageId || !input.roomId.trim() || !input.domainIdentityKey.trim()) {
    return { status: "skipped", reason: "bridge_invalid" };
  }
  try {
    const port = createDomainRealtimeAuthorityPort({
      domain: input.domain,
      viewerUserId: viewer,
      surfaceRole: input.domain === "store_order" ? "customer" : null,
    });
    const generation = Math.max(1, (port.inspect().generation || 0) + 1);
    return applyDomainRealtimeAuthorityEnvelope({
      domain: input.domain,
      viewerUserId: viewer,
      surfaceRole: input.domain === "store_order" ? "customer" : null,
      envelope: {
        schemaVersion: MESSENGER_DOMAIN_EVENT_SCHEMA_VERSION,
        domain: input.domain,
        identityKey: input.domainIdentityKey.trim(),
        roomId: input.roomId.trim(),
        viewerUserId: viewer,
        eventId: `home-hint:${messageId}:${generation}`,
        generation,
        occurredAt,
        eventType: "message_created",
        payload: {
          messageId,
          text,
          occurredAt,
        },
      },
    });
  } catch {
    return { status: "skipped", reason: "bridge_invalid" };
  }
}
