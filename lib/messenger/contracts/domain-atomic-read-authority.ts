/**
 * STEP 6 — Domain Atomic Read Authority (existing SQL RPC contract).
 *
 * Uses existing migration:
 *   supabase/migrations/20261005120000_dibay_messenger_domain_atomic_mark_read.sql
 * No new migration in this STEP.
 *
 * Product flag PHASE11D_A_READ_WRITE CONNECTED (allowlist invoke).
 * Sibling D1_1_ATOMIC_READ_RPC_PRODUCTION_WIRING (all-user) stays false.
 * Staging DB apply remains a final Regression QA gate.
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import { assertNoDualWrite } from "@/lib/messenger/contracts/cutover";
import {
  assertAtomicRpcNotCalledInProductionWiring,
  DIBAY_MESSENGER_DOMAIN_ATOMIC_MARK_READ_RPC,
  DIBAY_STORE_ORDER_ATOMIC_MARK_READ_RPC,
  simulateAtomicMarkReadTransaction,
  type AtomicMarkReadRpcResult,
  type MessengerDomainAtomicMarkReadArgs,
  type StoreOrderAtomicMarkReadArgs,
} from "@/lib/messenger/contracts/atomic-mark-read-rpc-phase8b";
import {
  D1_1_ATOMIC_READ_RPC_IMPLEMENTED,
  D1_1_ATOMIC_READ_RPC_PRODUCTION_WIRING,
} from "@/lib/messenger/contracts/domain-read-unread-badge";
import {
  isPhase11dAAllowlisted,
  isPhase11dACanaryKilled,
  PHASE11D_A_ATOMIC_READ_AUTHORITY_PREPARED,
  PHASE11D_A_READ_WRITE,
} from "@/lib/messenger/contracts/phase11da-canary-gate";

export { PHASE11D_A_ATOMIC_READ_AUTHORITY_PREPARED };

/** Existing SQL artifact — do not create a new migration for Authority. */
export const DOMAIN_ATOMIC_READ_AUTHORITY_SQL_MIGRATION =
  "supabase/migrations/20261005120000_dibay_messenger_domain_atomic_mark_read.sql" as const;

export const DOMAIN_ATOMIC_READ_STAGING_DB_APPLY_GATE =
  "final_device_qa_before_cutover" as const;

export function assertDomainAtomicReadAuthorityWritersContract(): void {
  if (!PHASE11D_A_READ_WRITE) {
    throw new Error("dibay_domain_atomic_read_authority_requires_read_write_flag");
  }
  // All-user Phase8B production wiring stays OFF; allowlist uses PHASE11D_A_READ_WRITE.
  if (D1_1_ATOMIC_READ_RPC_PRODUCTION_WIRING) {
    throw new Error("dibay_atomic_read_all_user_wiring_must_remain_false");
  }
  if (!D1_1_ATOMIC_READ_RPC_IMPLEMENTED) {
    throw new Error("dibay_atomic_read_rpc_must_remain_implemented");
  }
  assertNoDualWrite(["domain"]);
}

export function isDomainAtomicReadAuthorityEnabledForViewer(viewerUserId: string): boolean {
  if (!PHASE11D_A_READ_WRITE) return false;
  if (isPhase11dACanaryKilled()) return false;
  if (!isPhase11dAAllowlisted(viewerUserId)) return false;
  return true;
}

export type DomainAtomicReadAuthorityInvokeResult =
  | {
      status: "ok";
      result: AtomicMarkReadRpcResult;
      rpc: string;
      invokeMode: "authority_wired_awaiting_rpc_client";
    }
  | { status: "skipped"; reason: "authority_off_or_not_allowlisted" | "owner_excluded" };

/**
 * Product HTTP invoke — allowlist CONNECTED.
 * RPC name + args are validated; actual supabase.rpc client is supplied by the product route
 * (see invokeDomainAtomicReadAuthorityWithRpc). Sync entry remains for contract tests.
 */
export function invokeDomainAtomicReadAuthority(input: {
  viewerUserId: string;
  domain: ChatDomain;
  args: MessengerDomainAtomicMarkReadArgs | StoreOrderAtomicMarkReadArgs;
  surfaceRole?: "customer" | "owner" | null;
}): DomainAtomicReadAuthorityInvokeResult {
  const viewer = input.viewerUserId.trim();
  if (!isDomainAtomicReadAuthorityEnabledForViewer(viewer)) {
    return { status: "skipped", reason: "authority_off_or_not_allowlisted" };
  }
  if (input.domain === "store_order" && input.surfaceRole === "owner") {
    return { status: "skipped", reason: "owner_excluded" };
  }
  assertDomainAtomicReadAuthorityWritersContract();
  const rpc =
    input.domain === "store_order"
      ? DIBAY_STORE_ORDER_ATOMIC_MARK_READ_RPC
      : DIBAY_MESSENGER_DOMAIN_ATOMIC_MARK_READ_RPC;
  if (input.args.p_user_id !== viewer) {
    return {
      status: "ok",
      rpc,
      invokeMode: "authority_wired_awaiting_rpc_client",
      result: {
        status: "forbidden",
        reason: "viewer_mismatch",
        rolledBack: true,
      },
    };
  }
  if (input.args.p_chat_domain !== input.domain) {
    return {
      status: "ok",
      rpc,
      invokeMode: "authority_wired_awaiting_rpc_client",
      result: {
        status: "domain_mismatch",
        reason: "chat_domain_mismatch",
        rolledBack: true,
      },
    };
  }
  // Authority path wired — product route must call invokeDomainAtomicReadAuthorityWithRpc.
  return {
    status: "ok",
    rpc,
    invokeMode: "authority_wired_awaiting_rpc_client",
    result: {
      status: "forbidden",
      reason: "rpc_client_required",
      rolledBack: true,
    },
  };
}

/**
 * Product route entry — runs existing Domain Atomic RPC via injected client.
 * Does not flip D1_1_ATOMIC_READ_RPC_PRODUCTION_WIRING (all-user remains OFF).
 */
export async function invokeDomainAtomicReadAuthorityWithRpc(input: {
  viewerUserId: string;
  domain: ChatDomain;
  args: MessengerDomainAtomicMarkReadArgs | StoreOrderAtomicMarkReadArgs;
  surfaceRole?: "customer" | "owner" | null;
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
}): Promise<DomainAtomicReadAuthorityInvokeResult> {
  const gated = invokeDomainAtomicReadAuthority({
    viewerUserId: input.viewerUserId,
    domain: input.domain,
    args: input.args,
    surfaceRole: input.surfaceRole,
  });
  if (gated.status === "skipped") return gated;
  if (gated.result.status !== "forbidden" || gated.result.reason !== "rpc_client_required") {
    return gated;
  }
  const { data, error } = await input.rpc(gated.rpc, { ...input.args });
  if (error) {
    return {
      status: "ok",
      rpc: gated.rpc,
      invokeMode: "authority_wired_awaiting_rpc_client",
      result: {
        status: "rollback",
        reason: error.message ?? "rpc_error",
        rolledBack: true,
      },
    };
  }
  const body = data as AtomicMarkReadRpcResult | null;
  if (!body || typeof body !== "object" || !("status" in body)) {
    return {
      status: "ok",
      rpc: gated.rpc,
      invokeMode: "authority_wired_awaiting_rpc_client",
      result: {
        status: "rollback",
        reason: "rpc_payload_invalid",
        rolledBack: true,
      },
    };
  }
  return {
    status: "ok",
    rpc: gated.rpc,
    invokeMode: "authority_wired_awaiting_rpc_client",
    result: body,
  };
}

/** Isolated harness — uses existing Phase8B transaction simulator. */
export function invokeDomainAtomicReadAuthorityForHarness(input: {
  generation: number;
  before: {
    participantUnread: number;
    targetUnread: number;
    eventUnread: number;
    generation: number;
  };
  forceFailAt?: "participant" | "target" | "event" | null;
}): { result: AtomicMarkReadRpcResult; after: typeof input.before } {
  assertAtomicRpcNotCalledInProductionWiring();
  return simulateAtomicMarkReadTransaction({
    before: input.before,
    generation: input.generation,
    forceFailAt: input.forceFailAt ?? null,
  });
}

export function listDomainAtomicReadAuthoritySurfaces(): ReadonlyArray<{
  domain: ChatDomain;
  surface: "default" | "customer";
  authority: "DOMAIN_AUTHORITY" | "OFF";
  rpc: string;
  ready: boolean;
  stagingDbApply: typeof DOMAIN_ATOMIC_READ_STAGING_DB_APPLY_GATE;
}> {
  const authority = PHASE11D_A_READ_WRITE ? ("DOMAIN_AUTHORITY" as const) : ("OFF" as const);
  return [
    {
      domain: "general_direct",
      surface: "default",
      authority,
      rpc: DIBAY_MESSENGER_DOMAIN_ATOMIC_MARK_READ_RPC,
      ready: true,
      stagingDbApply: DOMAIN_ATOMIC_READ_STAGING_DB_APPLY_GATE,
    },
    {
      domain: "group",
      surface: "default",
      authority,
      rpc: DIBAY_MESSENGER_DOMAIN_ATOMIC_MARK_READ_RPC,
      ready: true,
      stagingDbApply: DOMAIN_ATOMIC_READ_STAGING_DB_APPLY_GATE,
    },
    {
      domain: "trade",
      surface: "default",
      authority,
      rpc: DIBAY_MESSENGER_DOMAIN_ATOMIC_MARK_READ_RPC,
      ready: true,
      stagingDbApply: DOMAIN_ATOMIC_READ_STAGING_DB_APPLY_GATE,
    },
    {
      domain: "store_order",
      surface: "customer",
      authority,
      rpc: DIBAY_STORE_ORDER_ATOMIC_MARK_READ_RPC,
      ready: true,
      stagingDbApply: DOMAIN_ATOMIC_READ_STAGING_DB_APPLY_GATE,
    },
  ];
}
