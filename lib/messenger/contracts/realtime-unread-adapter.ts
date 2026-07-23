/**
 * Phase 8A — Phase7 Realtime → Domain Unread isolated adapter.
 * production subscriber 연결 금지. +1/-1 단순 누적 금지.
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import {
  parseMessengerDomainEventEnvelope,
  type MessengerDomainEventEnvelope,
} from "@/lib/messenger/contracts/domain-event-envelope";
import type { DomainUnreadContribution } from "@/lib/messenger/contracts/domain-read-unread-badge";
import { assertPhase8aBadgeProductionWiringOff } from "@/lib/messenger/contracts/domain-read-unread-badge";

export type RealtimeUnreadAdapterResult =
  | { status: "patched"; contribution: DomainUnreadContribution }
  | { status: "noop_duplicate" }
  | { status: "rejected"; reason: string };

/**
 * Realtime apply 결과 snapshot 으로부터 Unread contribution 을 재계산.
 * message_created + unread_changed 이중 합산 없음 — snapshot upsert 권위.
 */
export function applyRealtimeEventToUnreadContribution(input: {
  domain: ChatDomain;
  viewerUserId: string;
  port: {
    applyEnvelope: (
      raw: unknown,
      ctx: "test" | "isolated_harness"
    ) => { status: string; reason?: string };
    inspect: () => {
      generation: number;
      snapshot: {
        rows: ReadonlyArray<{ roomId: string; domainIdentityKey: string; unreadCount?: number }>;
      } | null;
    };
  };
  rawEvent: unknown;
  ctx: "test" | "isolated_harness";
  /** 이미 applyEnvelope 한 경우 skip re-apply */
  alreadyApplied?: boolean;
  surfaceRole?: "customer" | "owner" | null;
  storeId?: string | null;
}): RealtimeUnreadAdapterResult {
  assertPhase8aBadgeProductionWiringOff();

  let envelope: MessengerDomainEventEnvelope;
  try {
    envelope = parseMessengerDomainEventEnvelope(input.rawEvent, {
      domain: input.domain,
      viewerUserId: input.viewerUserId,
    });
  } catch (err) {
    return {
      status: "rejected",
      reason: err instanceof Error ? err.message : "envelope_invalid",
    };
  }

  if (envelope.domain !== input.domain) {
    return { status: "rejected", reason: "cross_domain" };
  }

  if (!input.alreadyApplied) {
    const apply = input.port.applyEnvelope(input.rawEvent, input.ctx);
    if (apply.status === "noop_duplicate") return { status: "noop_duplicate" };
    if (apply.status === "rejected") {
      return { status: "rejected", reason: apply.reason ?? "rejected" };
    }
  }

  const snap = input.port.inspect().snapshot;
  const rows = snap?.rows ?? [];
  let messageCount = 0;
  const unreadKeys: string[] = [];
  for (const r of rows) {
    const u = Math.max(0, Math.floor((r as { unreadCount?: number }).unreadCount ?? 0));
    messageCount += u;
    if (u > 0) unreadKeys.push(r.domainIdentityKey);
  }

  const contribution: DomainUnreadContribution = {
    domain: input.domain,
    viewerUserId: input.viewerUserId,
    unreadMessageCount: messageCount,
    unreadRoomCount: unreadKeys.length,
    unreadIdentityKeys: unreadKeys,
    latestUnreadGeneration: input.port.inspect().generation,
    generation: input.port.inspect().generation,
    sourceAuthority: "realtime_patch",
    computedAt: new Date().toISOString(),
    surfaceRole: input.surfaceRole ?? null,
    storeId: input.storeId ?? null,
  };

  return { status: "patched", contribution };
}

/** 동일 event 를 두 번 adapter 에 넣어도 contribution 이중 감소 없음 */
export function assertNoDoubleBadgeDecrement(before: number, afterFirst: number, afterSecond: number): void {
  if (afterSecond !== afterFirst) {
    throw new Error(`dibay_realtime_unread_double_decrement:${before}->${afterFirst}->${afterSecond}`);
  }
}
