/**
 * Phase 7 — Multi-tab Domain bus 계약 (isolated harness 전용).
 * production BroadcastChannel / sessionStorage 연결 금지.
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import {
  parseMessengerDomainEventEnvelope,
  DomainEventEnvelopeError,
  PHASE7_DOMAIN_REALTIME_PRODUCTION_WIRING,
  type MessengerDomainEventEnvelope,
} from "@/lib/messenger/contracts/domain-event-envelope";
import type {
  DomainRealtimeApplyPort,
  DomainRealtimeApplyResult,
} from "@/lib/messenger/contracts/realtime-apply-port";

/** 공유 envelope channel 이름 — Domain 검증은 subscriber 책임 */
export const DIBAY_MESSENGER_DOMAIN_MULTITAB_CHANNEL = "dibay.messenger.domain.v1" as const;

export const DIBAY_MESSENGER_DOMAIN_MULTITAB_CHANNELS = {
  general_direct: "dibay.messenger.general.v1",
  group: "dibay.messenger.group.v1",
  trade: "dibay.messenger.trade.v1",
  store_order: "dibay.messenger.store_order.v1",
} as const satisfies Record<ChatDomain, string>;

export type MultiTabDomainPayload = MessengerDomainEventEnvelope;

export type QuarantineLogEntry = Readonly<{
  at: string;
  reason: string;
  rawPreview: string;
}>;

/**
 * In-memory Multi-tab bus — production BroadcastChannel 대체 harness.
 */
export function createIsolatedDomainMultiTabBus() {
  const listeners = new Map<ChatDomain, Set<(raw: unknown) => void>>();
  const quarantine: QuarantineLogEntry[] = [];

  function publish(raw: unknown): { ok: true } | { ok: false; quarantined: true; reason: string } {
    if (PHASE7_DOMAIN_REALTIME_PRODUCTION_WIRING) {
      throw new Error("dibay_phase7_multitab_production_wiring_forbidden");
    }
    try {
      const env = parseMessengerDomainEventEnvelope(raw);
      const set = listeners.get(env.domain);
      if (set) {
        for (const fn of set) fn(env);
      }
      return { ok: true };
    } catch (err) {
      const reason =
        err instanceof DomainEventEnvelopeError ? err.reason : "parse_failed";
      quarantine.push({
        at: new Date().toISOString(),
        reason,
        rawPreview: typeof raw === "object" ? JSON.stringify(raw).slice(0, 200) : String(raw),
      });
      return { ok: false, quarantined: true, reason };
    }
  }

  function subscribe(domain: ChatDomain, listener: (raw: unknown) => void): () => void {
    let set = listeners.get(domain);
    if (!set) {
      set = new Set();
      listeners.set(domain, set);
    }
    set.add(listener);
    return () => set!.delete(listener);
  }

  /** Domain ApplyPort 에 bus 이벤트를 연결 (isolated only) */
  function wireApplyPort(
    port: DomainRealtimeApplyPort<{ roomId: string; domainIdentityKey: string; generation: string }>,
    ctx: "test" | "isolated_harness"
  ): () => void {
    return subscribe(port.domain, (raw) => {
      port.applyMultiTabPayload(raw, ctx);
    });
  }

  function inspectQuarantine(): ReadonlyArray<QuarantineLogEntry> {
    return [...quarantine];
  }

  return {
    channelName: DIBAY_MESSENGER_DOMAIN_MULTITAB_CHANNEL,
    domainChannels: DIBAY_MESSENGER_DOMAIN_MULTITAB_CHANNELS,
    publish,
    subscribe,
    wireApplyPort,
    inspectQuarantine,
  };
}

export type IsolatedDomainMultiTabBus = ReturnType<typeof createIsolatedDomainMultiTabBus>;

/** Realtime + Multi-tab 동일 eventId 가 한 번만 적용되는지 harness */
export function applyRealtimeThenMultiTabOnce(input: {
  port: DomainRealtimeApplyPort<{ roomId: string; domainIdentityKey: string; generation: string }>;
  envelope: MultiTabDomainPayload;
  ctx: "test" | "isolated_harness";
}): { first: DomainRealtimeApplyResult; second: DomainRealtimeApplyResult } {
  const first = input.port.applyEnvelope(input.envelope, input.ctx);
  const second = input.port.applyMultiTabPayload(input.envelope, input.ctx);
  return { first, second };
}
