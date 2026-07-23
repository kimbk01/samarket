/**
 * Phase 8A — Domain ReadPort harness (isolated/test).
 * 실제 mark_read HTTP/RPC 호출 없음. ConsistencyResult · idempotency · plan 만.
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import {
  assertPhase8aBadgeProductionWiringOff,
  buildDomainReadTransactionPlan,
  type DomainReadAuthority,
  type DomainReadConsistencyResult,
  type DomainReadRequest,
  type DomainUnreadContribution,
  type DomainUnreadSourceAuthority,
} from "@/lib/messenger/contracts/domain-read-unread-badge";

export type DomainRoomUnreadState = Readonly<{
  roomId: string;
  domainIdentityKey: string;
  unreadMessageCount: number;
  generation: number;
}>;

export type DomainReadPortHarness = Readonly<{
  domain: ChatDomain;
  applyRead: (
    req: DomainReadRequest,
    authorityResults: Readonly<Record<DomainReadAuthority, "ok" | "fail">>,
    ctx: "test" | "isolated_harness"
  ) => DomainReadConsistencyResult;
  buildUnreadContribution: (input: {
    viewerUserId: string;
    sourceAuthority?: DomainUnreadSourceAuthority;
    surfaceRole?: "customer" | "owner" | null;
    storeId?: string | null;
  }) => DomainUnreadContribution;
  inspectRooms: () => ReadonlyArray<DomainRoomUnreadState>;
  /** 타 Domain state 접근 시도용 — 항상 throw */
  mutateForeignDomain: (domain: ChatDomain) => never;
  seedRooms: (rooms: ReadonlyArray<DomainRoomUnreadState>, ctx: "test" | "isolated_harness") => void;
}>;

export function createDomainReadPortHarness(input: {
  domain: ChatDomain;
  assertIdentity: (req: DomainReadRequest) => void;
  assertPermission?: (req: DomainReadRequest) => void;
}): DomainReadPortHarness {
  const rooms = new Map<string, DomainRoomUnreadState>();
  const appliedKeys = new Map<string, DomainReadConsistencyResult["status"]>();
  let currentGeneration = 0;

  function applyRead(
    req: DomainReadRequest,
    authorityResults: Readonly<Record<DomainReadAuthority, "ok" | "fail">>,
    ctx: "test" | "isolated_harness"
  ): DomainReadConsistencyResult {
    assertPhase8aBadgeProductionWiringOff();
    if (ctx !== "test" && ctx !== "isolated_harness") {
      throw new Error("dibay_phase8a_read_context_forbidden");
    }
    if (req.chatDomain !== input.domain) {
      return {
        status: "forbidden",
        domain: input.domain,
        roomId: req.roomId,
        reason: `cross_domain:${req.chatDomain}`,
      };
    }
    try {
      input.assertIdentity(req);
      input.assertPermission?.(req);
    } catch (err) {
      return {
        status: "forbidden",
        domain: input.domain,
        roomId: req.roomId,
        reason: err instanceof Error ? err.message : "forbidden",
      };
    }

    const idem = req.idempotencyKey.trim();
    if (!idem) {
      return {
        status: "forbidden",
        domain: input.domain,
        roomId: req.roomId,
        reason: "idempotency_required",
      };
    }
    const prior = appliedKeys.get(idem);
    if (prior) {
      return {
        status: "duplicate",
        domain: input.domain,
        roomId: req.roomId,
        idempotencyKey: idem,
        priorStatus: prior,
      };
    }

    if (req.generation < currentGeneration) {
      return {
        status: "stale",
        domain: input.domain,
        roomId: req.roomId,
        currentGeneration,
        incomingGeneration: req.generation,
      };
    }

    const plan = buildDomainReadTransactionPlan(req);
    const applied: DomainReadAuthority[] = [];
    const failed: DomainReadAuthority[] = [];
    for (const a of plan.authorities) {
      if (authorityResults[a] === "ok") applied.push(a);
      else failed.push(a);
    }

    if (failed.length > 0) {
      const result: DomainReadConsistencyResult = {
        status: "partial",
        domain: input.domain,
        roomId: req.roomId,
        generation: req.generation,
        appliedAuthorities: applied,
        failedAuthorities: failed,
        plan,
        treatedAsSuccess: false,
        rolledBack: true,
      };
      // partial 은 적용·idempotency 기록하지 않음 (성공으로 숨기지 않음)
      return result;
    }

    const room = rooms.get(req.roomId);
    if (room) {
      rooms.set(req.roomId, {
        ...room,
        unreadMessageCount: 0,
        generation: req.generation,
      });
    }
    if (req.generation > currentGeneration) currentGeneration = req.generation;

    const result: DomainReadConsistencyResult = {
      status: "consistent",
      domain: input.domain,
      roomId: req.roomId,
      generation: req.generation,
      appliedAuthorities: applied,
      unreadMessageCountAfter: 0,
      unreadRoomCleared: true,
      plan,
    };
    appliedKeys.set(idem, "consistent");
    return result;
  }

  function buildUnreadContribution(opts: {
    viewerUserId: string;
    sourceAuthority?: DomainUnreadSourceAuthority;
    surfaceRole?: "customer" | "owner" | null;
    storeId?: string | null;
  }): DomainUnreadContribution {
    const list = [...rooms.values()];
    const unreadRooms = list.filter((r) => r.unreadMessageCount > 0);
    let messageCount = 0;
    let latest = 0;
    for (const r of list) {
      messageCount += Math.max(0, r.unreadMessageCount);
      if (r.generation > latest) latest = r.generation;
    }
    return {
      domain: input.domain,
      viewerUserId: opts.viewerUserId.trim(),
      unreadMessageCount: messageCount,
      unreadRoomCount: unreadRooms.length,
      unreadIdentityKeys: unreadRooms.map((r) => r.domainIdentityKey),
      latestUnreadGeneration: latest,
      generation: currentGeneration,
      sourceAuthority: opts.sourceAuthority ?? "domain_cache",
      computedAt: new Date().toISOString(),
      surfaceRole: opts.surfaceRole ?? null,
      storeId: opts.storeId ?? null,
    };
  }

  return {
    domain: input.domain,
    applyRead,
    buildUnreadContribution,
    inspectRooms: () => [...rooms.values()],
    mutateForeignDomain: (domain) => {
      throw new Error(`dibay_read_port_forbids_foreign_domain:${input.domain}:${domain}`);
    },
    seedRooms: (seed, ctx) => {
      assertPhase8aBadgeProductionWiringOff();
      if (ctx !== "test" && ctx !== "isolated_harness") {
        throw new Error("dibay_phase8a_read_context_forbidden");
      }
      rooms.clear();
      for (const r of seed) {
        rooms.set(r.roomId, r);
        if (r.generation > currentGeneration) currentGeneration = r.generation;
      }
    },
  };
}
