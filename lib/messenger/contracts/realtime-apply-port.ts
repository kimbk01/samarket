/**
 * Phase 7 — Domain RealtimeApply 공용 엔진.
 * CachePort applyPartial / applyTombstones 만 사용. writeFull · clear* · Shell 금지.
 * contexts: test | isolated_harness | domain_realtime_authority (flag-gated).
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import type {
  DomainPersistentCachePort,
  DomainCacheSnapshot,
  DomainCacheWriteContext,
} from "@/lib/messenger/contracts/persistent-cache-port";
import {
  assertPhase7RealtimeProductionWiringOff,
  parseMessengerDomainEventEnvelope,
  type MessengerDomainEventEnvelope,
  DomainEventEnvelopeError,
} from "@/lib/messenger/contracts/domain-event-envelope";
import type { DomainTombstone } from "@/lib/messenger/contracts/domain-bootstrap-cache";
import { PHASE11D_A_REALTIME_APPLY } from "@/lib/messenger/contracts/phase11da-canary-gate";

export const DOMAIN_EVENT_ID_DEDUPE_CAPACITY = 512 as const;

export type DomainRealtimeApplyResult =
  | { status: "applied"; generation: number }
  | { status: "noop_duplicate"; eventId: string }
  | { status: "rejected"; reason: string };

export type DomainRealtimeApplyContext =
  | "test"
  | "isolated_harness"
  | "domain_realtime_authority";

function mapCacheWriteContext(ctx: DomainRealtimeApplyContext): DomainCacheWriteContext {
  if (ctx === "domain_realtime_authority") return "domain_realtime_authority";
  return ctx;
}

function assertApplyContext(ctx: DomainRealtimeApplyContext): void {
  if (ctx === "test" || ctx === "isolated_harness") return;
  if (ctx === "domain_realtime_authority") {
    if (!PHASE11D_A_REALTIME_APPLY) {
      throw new Error("dibay_domain_realtime_authority_flag_off");
    }
    return;
  }
  throw new Error("dibay_phase7_apply_context_forbidden");
}
export type DomainRowPatchBase = {
  roomId: string;
  domainIdentityKey: string;
  generation: string;
};

export type DomainRealtimeStoreState<TRow extends DomainRowPatchBase> = Readonly<{
  domain: ChatDomain;
  viewerUserId: string;
  generation: number;
  cacheKey: string;
  appliedEventIds: ReadonlySet<string>;
  /** roomId → tombstone generation (이후 message 거부) */
  tombstonedRooms: ReadonlyMap<string, number>;
  /** roomId → room_read 적용 generation (stale unread 복원 금지) */
  lastReadGenerationByRoom: ReadonlyMap<string, number>;
  /** Domain badge contribution (unread room count) — Shell 합산은 Phase 10 */
  badgeContribution: { unreadRoomCount: number };
  hub: unknown | null;
  snapshot: DomainCacheSnapshot<TRow> | null;
}>;

type MutableStore<TRow extends DomainRowPatchBase> = {
  generation: number;
  appliedEventIds: Set<string>;
  eventIdOrder: string[];
  tombstonedRooms: Map<string, number>;
  lastReadGenerationByRoom: Map<string, number>;
  badgeContribution: { unreadRoomCount: number };
  hub: unknown | null;
};

function rememberEventId(store: MutableStore<DomainRowPatchBase>, eventId: string): void {
  if (store.appliedEventIds.has(eventId)) return;
  store.appliedEventIds.add(eventId);
  store.eventIdOrder.push(eventId);
  while (store.eventIdOrder.length > DOMAIN_EVENT_ID_DEDUPE_CAPACITY) {
    const old = store.eventIdOrder.shift();
    if (old) store.appliedEventIds.delete(old);
  }
}

function assertGenerationAllowsEvent(incoming: number, current: number, isDuplicateCheckOnly: boolean): void {
  if (incoming > current) return;
  if (incoming === current && isDuplicateCheckOnly) return;
  if (incoming < current) {
    throw new Error(`dibay_realtime_stale_generation:${incoming}<${current}`);
  }
  // incoming === current 이고 신규 eventId → 허용 (호출부에서 eventId 검사 후)
}

export type DomainEventPatchBuilder<TRow extends DomainRowPatchBase> = (input: {
  envelope: MessengerDomainEventEnvelope;
  current: DomainCacheSnapshot<TRow> | null;
}) =>
  | { kind: "partial"; rows: ReadonlyArray<TRow> }
  | { kind: "tombstone"; tombstone: DomainTombstone }
  | { kind: "read"; roomId: string }
  | { kind: "noop" };

export type DomainHubBadgeRecompute<TRow extends DomainRowPatchBase> = (input: {
  rows: ReadonlyArray<TRow>;
  envelope: MessengerDomainEventEnvelope;
}) => { hub: unknown | null; unreadRoomCount: number };

export type DomainRealtimeApplyPort<TRow extends DomainRowPatchBase> = Readonly<{
  domain: ChatDomain;
  /** envelope apply — 타 Domain reject */
  applyEnvelope: (
    raw: unknown,
    ctx: DomainRealtimeApplyContext
  ) => DomainRealtimeApplyResult;
  /** Multi-tab 동일 envelope 경로 */
  applyMultiTabPayload: (
    raw: unknown,
    ctx: DomainRealtimeApplyContext
  ) => DomainRealtimeApplyResult;
  inspect: () => DomainRealtimeStoreState<TRow>;
  /** 테스트: 초기 full seed 는 harness 전용 (single event 경로가 아님) */
  seedForHarness: (
    snapshot: DomainCacheSnapshot<TRow>,
    ctx: DomainRealtimeApplyContext
  ) => void;
}>;

export function createDomainRealtimeApplyPort<TRow extends DomainRowPatchBase>(input: {
  domain: ChatDomain;
  viewerUserId: string;
  cache: DomainPersistentCachePort<TRow>;
  cacheKey: string;
  buildPatch: DomainEventPatchBuilder<TRow>;
  recomputeHubBadge: DomainHubBadgeRecompute<TRow>;
  validatePayload?: (envelope: MessengerDomainEventEnvelope) => void;
}): DomainRealtimeApplyPort<TRow> {
  const store: MutableStore<TRow> = {
    generation: 0,
    appliedEventIds: new Set(),
    eventIdOrder: [],
    tombstonedRooms: new Map(),
    lastReadGenerationByRoom: new Map(),
    badgeContribution: { unreadRoomCount: 0 },
    hub: null,
  };

  function applyEnvelope(
    raw: unknown,
    ctx: DomainRealtimeApplyContext
  ): DomainRealtimeApplyResult {
    assertPhase7RealtimeProductionWiringOff();
    try {
      assertApplyContext(ctx);
    } catch (err) {
      return {
        status: "rejected",
        reason: err instanceof Error ? err.message : "apply_context_forbidden",
      };
    }
    const cacheCtx = mapCacheWriteContext(ctx);

    let envelope: MessengerDomainEventEnvelope;
    try {
      envelope = parseMessengerDomainEventEnvelope(raw, {
        domain: input.domain,
        viewerUserId: input.viewerUserId,
      });
    } catch (err) {
      const reason =
        err instanceof DomainEventEnvelopeError ? err.reason : "parse_failed";
      return { status: "rejected", reason: String(reason) };
    }

    if (envelope.domain !== input.domain) {
      return { status: "rejected", reason: "cross_domain" };
    }

    if (store.appliedEventIds.has(envelope.eventId)) {
      return { status: "noop_duplicate", eventId: envelope.eventId };
    }

    try {
      if (envelope.generation < store.generation) {
        return { status: "rejected", reason: "stale_generation" };
      }
      assertGenerationAllowsEvent(envelope.generation, store.generation, true);
      input.validatePayload?.(envelope);

      const tombGen = store.tombstonedRooms.get(envelope.roomId);
      if (
        tombGen != null &&
        envelope.generation <= tombGen &&
        envelope.eventType !== "tombstone" &&
        envelope.eventType !== "room_deleted"
      ) {
        return { status: "rejected", reason: "post_tombstone_stale" };
      }

      if (envelope.eventType === "unread_changed") {
        const readGen = store.lastReadGenerationByRoom.get(envelope.roomId);
        if (readGen != null && envelope.generation <= readGen) {
          return { status: "rejected", reason: "stale_unread_after_read" };
        }
      }

      const current = input.cache.readSnapshot(input.cacheKey);
      const patch = input.buildPatch({ envelope, current });

      if (patch.kind === "noop") {
        rememberEventId(store, envelope.eventId);
        if (envelope.generation > store.generation) store.generation = envelope.generation;
        return { status: "applied", generation: store.generation };
      }

      if (patch.kind === "tombstone") {
        // event 경로에서는 writeFullSnapshot / clear 금지
        input.cache.applyTombstones(
          input.cacheKey,
          [patch.tombstone],
          String(envelope.generation),
          cacheCtx
        );
        store.tombstonedRooms.set(envelope.roomId, envelope.generation);
      } else if (patch.kind === "read") {
        store.lastReadGenerationByRoom.set(patch.roomId, envelope.generation);
        if (current) {
          const rows = current.rows.map((r) =>
            r.roomId === patch.roomId
              ? ({ ...r, unreadCount: 0, generation: String(envelope.generation) } as TRow)
              : r
          );
          input.cache.applyPartial(
            input.cacheKey,
            { generation: String(envelope.generation), rows },
            cacheCtx
          );
        }
      } else if (patch.kind === "partial") {
        if (!current && patch.rows.length === 0) {
          return { status: "rejected", reason: "partial_requires_existing_or_rows" };
        }
        if (!current) {
          // 초기 partial only row — harness 에서는 applyPartial 불가 → seed 경로만.
          // event 단건에서 writeFull 금지이므로 reject.
          return { status: "rejected", reason: "cache_seed_required_before_events" };
        }
        input.cache.applyPartial(
          input.cacheKey,
          { generation: String(envelope.generation), rows: patch.rows },
          cacheCtx
        );
      }

      rememberEventId(store, envelope.eventId);
      if (envelope.generation > store.generation) {
        store.generation = envelope.generation;
      }

      const next = input.cache.readSnapshot(input.cacheKey);
      const rows = next?.rows ?? [];
      const recomputed = input.recomputeHubBadge({ rows, envelope });
      store.hub = recomputed.hub;
      store.badgeContribution = { unreadRoomCount: recomputed.unreadRoomCount };

      return { status: "applied", generation: store.generation };
    } catch (err) {
      return {
        status: "rejected",
        reason: err instanceof Error ? err.message : "apply_failed",
      };
    }
  }

  return {
    domain: input.domain,
    applyEnvelope,
    applyMultiTabPayload: applyEnvelope,
    inspect: () => ({
      domain: input.domain,
      viewerUserId: input.viewerUserId,
      generation: store.generation,
      cacheKey: input.cacheKey,
      appliedEventIds: new Set(store.appliedEventIds),
      tombstonedRooms: new Map(store.tombstonedRooms),
      lastReadGenerationByRoom: new Map(store.lastReadGenerationByRoom),
      badgeContribution: { ...store.badgeContribution },
      hub: store.hub,
      snapshot: input.cache.readSnapshot(input.cacheKey),
    }),
    seedForHarness: (snapshot, ctx) => {
      assertPhase7RealtimeProductionWiringOff();
      if (ctx !== "test" && ctx !== "isolated_harness") {
        throw new Error("dibay_realtime_seed_requires_harness_context");
      }
      if (snapshot.domain !== input.domain) {
        throw new Error("dibay_realtime_seed_domain_mismatch");
      }
      input.cache.writeFullSnapshot(input.cacheKey, snapshot, ctx);
      store.generation = Number(snapshot.generation) || 0;
      const recomputed = input.recomputeHubBadge({
        rows: snapshot.rows,
        envelope: {
          schemaVersion: 1,
          domain: input.domain,
          identityKey: `${input.domain}:seed`,
          roomId: "seed",
          viewerUserId: input.viewerUserId,
          eventId: `seed:${Date.now()}`,
          generation: store.generation,
          occurredAt: new Date().toISOString(),
          eventType: "message_created",
          payload: {},
        },
      });
      store.hub = recomputed.hub;
      store.badgeContribution = { unreadRoomCount: recomputed.unreadRoomCount };
    },
  };
}
