/**
 * STEP 6 — Domain Atomic Read Authority tests (existing SQL, allowlist CONNECTED).
 */
import { describe, expect, it } from "vitest";
import {
  DOMAIN_ATOMIC_READ_AUTHORITY_SQL_MIGRATION,
  DOMAIN_ATOMIC_READ_STAGING_DB_APPLY_GATE,
  invokeDomainAtomicReadAuthority,
  invokeDomainAtomicReadAuthorityForHarness,
  isDomainAtomicReadAuthorityEnabledForViewer,
  listDomainAtomicReadAuthoritySurfaces,
} from "@/lib/messenger/contracts/domain-atomic-read-authority";
import {
  PHASE11D_A_ATOMIC_READ_AUTHORITY_PREPARED,
  PHASE11D_A_CANARY_ALLOWLIST_USER_IDS,
  PHASE11D_A_READ_WRITE,
} from "@/lib/messenger/contracts/phase11da-canary-gate";
import {
  D1_1_ATOMIC_READ_RPC_IMPLEMENTED,
  D1_1_ATOMIC_READ_RPC_PRODUCTION_WIRING,
} from "@/lib/messenger/contracts/domain-read-unread-badge";
import { DIBAY_MESSENGER_DOMAIN_ATOMIC_MARK_READ_RPC } from "@/lib/messenger/contracts/atomic-mark-read-rpc-phase8b";

const CANARY = PHASE11D_A_CANARY_ALLOWLIST_USER_IDS[0];
const OTHER = "00000000-0000-4000-8000-000000000099";

describe("STEP6 Domain Atomic Read Authority", () => {
  it("prepared; product read_write CONNECTED; existing SQL only; all-user wiring OFF", () => {
    expect(PHASE11D_A_ATOMIC_READ_AUTHORITY_PREPARED).toBe(true);
    expect(PHASE11D_A_READ_WRITE).toBe(true);
    expect(D1_1_ATOMIC_READ_RPC_PRODUCTION_WIRING).toBe(false);
    expect(D1_1_ATOMIC_READ_RPC_IMPLEMENTED).toBe(true);
    expect(DOMAIN_ATOMIC_READ_AUTHORITY_SQL_MIGRATION).toContain(
      "20261005120000_dibay_messenger_domain_atomic_mark_read"
    );
    expect(DOMAIN_ATOMIC_READ_STAGING_DB_APPLY_GATE).toBe("final_device_qa_before_cutover");
    expect(isDomainAtomicReadAuthorityEnabledForViewer(CANARY)).toBe(true);
    expect(isDomainAtomicReadAuthorityEnabledForViewer(OTHER)).toBe(true);
    expect(isDomainAtomicReadAuthorityEnabledForViewer("")).toBe(false);
    expect(
      listDomainAtomicReadAuthoritySurfaces().every((s) => s.authority === "DOMAIN_AUTHORITY")
    ).toBe(true);
  });

  it("product invoke returns ok with rpc_client_required for allowlist", () => {
    const result = invokeDomainAtomicReadAuthority({
      viewerUserId: CANARY,
      domain: "general_direct",
      args: {
        p_user_id: CANARY,
        p_room_id: "r1",
        p_chat_domain: "general_direct",
        p_domain_identity_key: "general_direct:a:b",
        p_generation: 1,
        p_last_read_message_id: null,
        p_idempotency_key: "k1",
      },
    });
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.invokeMode).toBe("authority_wired_awaiting_rpc_client");
      expect(result.rpc).toBe(DIBAY_MESSENGER_DOMAIN_ATOMIC_MARK_READ_RPC);
      expect(result.result).toEqual({
        status: "forbidden",
        reason: "rpc_client_required",
        rolledBack: true,
      });
    }
  });

  it("anonymous product invoke skips", () => {
    expect(
      invokeDomainAtomicReadAuthority({
        viewerUserId: "",
        domain: "general_direct",
        args: {
          p_user_id: "",
          p_room_id: "r1",
          p_chat_domain: "general_direct",
          p_domain_identity_key: "general_direct:a:b",
          p_generation: 1,
          p_last_read_message_id: null,
          p_idempotency_key: "k1",
        },
      })
    ).toEqual({
      status: "skipped",
      reason: "authority_off_or_not_allowlisted",
    });
  });

  it("any authenticated viewer product invoke returns ok", () => {
    const result = invokeDomainAtomicReadAuthority({
      viewerUserId: OTHER,
      domain: "general_direct",
      args: {
        p_user_id: OTHER,
        p_room_id: "r1",
        p_chat_domain: "general_direct",
        p_domain_identity_key: "general_direct:a:b",
        p_generation: 1,
        p_last_read_message_id: null,
        p_idempotency_key: "k1",
      },
    });
    expect(result.status).toBe("ok");
  });

  it("harness simulates atomic transaction without production wiring", () => {
    const { result, after } = invokeDomainAtomicReadAuthorityForHarness({
      generation: 2,
      before: {
        participantUnread: 1,
        targetUnread: 1,
        eventUnread: 1,
        generation: 1,
      },
    });
    expect(result.status).toBe("consistent");
    expect(after.participantUnread).toBe(0);
    expect(after.generation).toBe(2);
    expect(DIBAY_MESSENGER_DOMAIN_ATOMIC_MARK_READ_RPC).toBe(
      "dibay_messenger_domain_atomic_mark_read"
    );
  });
});
