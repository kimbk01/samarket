/**
 * STEP 3 — Domain Realtime Authority unit tests (allowlist CONNECTED · Phase6 shared apply).
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  applyDomainRealtimeAuthorityEnvelope,
  createDomainRealtimeAuthorityPort,
  isDomainRealtimeAuthorityEnabledForViewer,
  listDomainRealtimeAuthoritySurfaces,
  PHASE11D_A_REALTIME_AUTHORITY_READY,
} from "@/lib/messenger/contracts/domain-realtime-authority";
import {
  hydrateDomainCacheAuthoritySnapshot,
  rollbackDomainCacheAuthority,
  seedDomainCacheAuthoritySnapshot,
} from "@/lib/messenger/contracts/domain-cache-authority";
import {
  PHASE11D_A_CANARY_ALLOWLIST_USER_IDS,
  PHASE11D_A_REALTIME_APPLY,
  PHASE11D_A_BADGE_READ_WIRING,
  PHASE11D_A_NOTIFICATION_WRITE,
  PHASE11D_A_PRODUCTION_HOME_WIRING,
  PHASE11D_A_READ_WRITE,
} from "@/lib/messenger/contracts/phase11da-canary-gate";
import { PHASE7_DOMAIN_REALTIME_PRODUCTION_WIRING } from "@/lib/messenger/contracts/domain-event-envelope";
import { generalDirectRoomIdentity } from "@/lib/chat-domain/room-identity";
import type { GeneralDirectListItem } from "@/lib/messenger/general-direct/types";

const CANARY = PHASE11D_A_CANARY_ALLOWLIST_USER_IDS[0];
const OTHER = "00000000-0000-4000-8000-000000000099";
const PEER = "00000000-0000-4000-8000-000000000001";

afterEach(() => {
  rollbackDomainCacheAuthority(CANARY);
  rollbackDomainCacheAuthority(OTHER);
});

function gdRow(roomId: string, lastMessageAt: string, lastMessage = "hi"): GeneralDirectListItem {
  const id = generalDirectRoomIdentity(CANARY, PEER);
  return {
    roomId,
    chatDomain: "general_direct",
    domainIdentityKey: id.identityKey,
    peerUserId: PEER,
    peerDisplayName: "Peer",
    peerAvatarUrl: null,
    lastMessage,
    lastMessageAt,
    unreadCount: 0,
    updatedAt: lastMessageAt,
    generation: "1",
  };
}

describe("STEP3 Domain Realtime Authority flags", () => {
  it("Realtime Authority READY and product apply CONNECTED for allowlist", () => {
    expect(PHASE11D_A_REALTIME_AUTHORITY_READY).toBe(true);
    expect(PHASE11D_A_REALTIME_APPLY).toBe(true);
    expect(PHASE7_DOMAIN_REALTIME_PRODUCTION_WIRING).toBe(false);
    expect(PHASE11D_A_BADGE_READ_WIRING).toBe(true);
    expect(PHASE11D_A_NOTIFICATION_WRITE).toBe(true);
    expect(PHASE11D_A_READ_WRITE).toBe(true);
    expect(PHASE11D_A_PRODUCTION_HOME_WIRING).toBe(true);
    expect(isDomainRealtimeAuthorityEnabledForViewer(CANARY)).toBe(true);
    expect(isDomainRealtimeAuthorityEnabledForViewer(OTHER)).toBe(true);
    expect(isDomainRealtimeAuthorityEnabledForViewer("")).toBe(false);
    expect(
      listDomainRealtimeAuthoritySurfaces().every((s) => s.authority === "DOMAIN_AUTHORITY")
    ).toBe(true);
    expect(listDomainRealtimeAuthoritySurfaces().every((s) => s.ready === true)).toBe(true);
  });
});

describe("STEP3 product apply CONNECTED", () => {
  it("applyDomainRealtimeAuthorityEnvelope may apply for canary (not skip)", () => {
    seedDomainCacheAuthoritySnapshot({
      domain: "general_direct",
      viewerUserId: CANARY,
      generation: "1",
      producedAt: new Date().toISOString(),
      rows: [gdRow("r1", "2026-07-01T00:00:00.000Z")],
    });
    const result = applyDomainRealtimeAuthorityEnvelope({
      domain: "general_direct",
      viewerUserId: CANARY,
      envelope: {
        schemaVersion: 1,
        domain: "general_direct",
        identityKey: generalDirectRoomIdentity(CANARY, PEER).identityKey,
        roomId: "r1",
        viewerUserId: CANARY,
        eventId: "evt-apply-1",
        generation: 2,
        occurredAt: "2026-07-01T01:00:00.000Z",
        eventType: "message_created",
        payload: {
          messageId: "m1",
          text: "should apply",
          occurredAt: "2026-07-01T01:00:00.000Z",
        },
      },
    });
    expect(result.status).not.toBe("skipped");
    expect(result).toEqual({ status: "applied", generation: 2 });
    const snap = hydrateDomainCacheAuthoritySnapshot<GeneralDirectListItem>({
      domain: "general_direct",
      viewerUserId: CANARY,
    });
    expect(snap?.rows[0]?.lastMessage).toBe("should apply");
  });

  it("anonymous apply still skips", () => {
    const result = applyDomainRealtimeAuthorityEnvelope({
      domain: "general_direct",
      viewerUserId: "",
      envelope: {
        schemaVersion: 1,
        domain: "general_direct",
        identityKey: generalDirectRoomIdentity(OTHER, PEER).identityKey,
        roomId: "r1",
        viewerUserId: "",
        eventId: "evt-skip-anon",
        generation: 2,
        occurredAt: "2026-07-01T01:00:00.000Z",
        eventType: "message_created",
        payload: {
          messageId: "m1",
          text: "nope",
          occurredAt: "2026-07-01T01:00:00.000Z",
        },
      },
    });
    expect(result).toEqual({
      status: "skipped",
      reason: "authority_off_or_not_allowlisted",
    });
  });

  it("any authenticated viewer apply may proceed (not skip for allowlist gate)", () => {
    seedDomainCacheAuthoritySnapshot({
      domain: "general_direct",
      viewerUserId: OTHER,
      generation: "1",
      producedAt: new Date().toISOString(),
      rows: [
        {
          ...gdRow("r1", "2026-07-01T00:00:00.000Z"),
          domainIdentityKey: generalDirectRoomIdentity(OTHER, PEER).identityKey,
        },
      ],
    });
    const result = applyDomainRealtimeAuthorityEnvelope({
      domain: "general_direct",
      viewerUserId: OTHER,
      envelope: {
        schemaVersion: 1,
        domain: "general_direct",
        identityKey: generalDirectRoomIdentity(OTHER, PEER).identityKey,
        roomId: "r1",
        viewerUserId: OTHER,
        eventId: "evt-other-apply",
        generation: 2,
        occurredAt: "2026-07-01T01:00:00.000Z",
        eventType: "message_created",
        payload: {
          messageId: "m1",
          text: "other ok",
          occurredAt: "2026-07-01T01:00:00.000Z",
        },
      },
    });
    expect(result.status).not.toBe("skipped");
  });

  it("owner surface excluded from authority port factory", () => {
    expect(() =>
      createDomainRealtimeAuthorityPort({
        domain: "store_order",
        viewerUserId: CANARY,
        surfaceRole: "owner",
      })
    ).toThrow(/owner_excluded/);
  });
});

describe("STEP3 Phase6 shared apply (isolated_harness)", () => {
  it("Authority port + Phase6 singleton apply updates Cache Authority snapshot", () => {
    seedDomainCacheAuthoritySnapshot({
      domain: "general_direct",
      viewerUserId: CANARY,
      generation: "1",
      producedAt: new Date().toISOString(),
      rows: [gdRow("r1", "2026-07-01T00:00:00.000Z")],
    });
    const port = createDomainRealtimeAuthorityPort({
      domain: "general_direct",
      viewerUserId: CANARY,
    });
    const applied = port.applyEnvelope(
      {
        schemaVersion: 1,
        domain: "general_direct",
        identityKey: generalDirectRoomIdentity(CANARY, PEER).identityKey,
        roomId: "r1",
        viewerUserId: CANARY,
        eventId: "evt-shared-1",
        generation: 2,
        occurredAt: "2026-07-01T01:00:00.000Z",
        eventType: "message_created",
        payload: {
          messageId: "m1",
          text: "shared-phase6",
          occurredAt: "2026-07-01T01:00:00.000Z",
        },
      },
      "isolated_harness"
    );
    expect(applied).toEqual({ status: "applied", generation: 2 });
    const snap = hydrateDomainCacheAuthoritySnapshot<GeneralDirectListItem>({
      domain: "general_direct",
      viewerUserId: CANARY,
    });
    expect(snap?.rows[0]?.lastMessage).toBe("shared-phase6");
    expect(snap?.generation).toBe("2");
  });
});
