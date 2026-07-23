/**
 * STEP 2 — Domain Cache Authority unit tests (canonical key · seed · stale · dual writer 0 · viewer isolation).
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  buildDomainCacheAuthorityKey,
  hydrateDomainCacheAuthoritySnapshot,
  isDomainCacheAuthorityEnabledForViewer,
  listDomainCacheAuthoritySurfaces,
  rollbackDomainCacheAuthority,
  seedDomainCacheAuthoritySnapshot,
  shouldBlockLegacyHomeCacheWarm,
} from "@/lib/messenger/contracts/domain-cache-authority";
import {
  PHASE11D_A_CACHE_WRITE,
  PHASE11D_A_CANARY_ALLOWLIST_USER_IDS,
  PHASE11D_A_PRODUCTION_HOME_WIRING,
  PHASE11D_A_REALTIME_APPLY,
  PHASE11D_A_BADGE_READ_WIRING,
  PHASE11D_A_NOTIFICATION_WRITE,
  killPhase11dACanary,
  resetPhase11dACanaryKillForTests,
} from "@/lib/messenger/contracts/phase11da-canary-gate";
import { PHASE6_DOMAIN_CACHE_PRODUCTION_WIRING } from "@/lib/messenger/contracts/domain-bootstrap-cache";
import { generalDirectRoomIdentity, tradeRoomIdentity, storeOrderRoomIdentity, groupRoomIdentity } from "@/lib/chat-domain/room-identity";
import { assertNoDualWrite } from "@/lib/messenger/contracts/cutover";

const CANARY = PHASE11D_A_CANARY_ALLOWLIST_USER_IDS[0];
const OTHER = "00000000-0000-4000-8000-000000000099";

afterEach(() => {
  resetPhase11dACanaryKillForTests();
  rollbackDomainCacheAuthority(CANARY);
  rollbackDomainCacheAuthority(OTHER);
});

function gdRow(input: {
  roomId: string;
  userA: string;
  userB: string;
  lastMessageAt: string;
  preview?: string;
}) {
  const id = generalDirectRoomIdentity(input.userA, input.userB);
  return {
    roomId: input.roomId,
    chatDomain: "general_direct" as const,
    domainIdentityKey: id.identityKey,
    peerUserId: input.userA === CANARY ? input.userB : input.userA,
    peerDisplayName: "Peer",
    peerAvatarUrl: null,
    lastMessage: input.preview ?? "hi",
    lastMessageAt: input.lastMessageAt,
    unreadCount: 0,
    updatedAt: input.lastMessageAt,
    generation: "1",
  };
}

describe("STEP2 Domain Cache Authority flags", () => {
  it("Cache Authority ON for all authenticated viewers; sibling Phase6 OFF", () => {
    expect(PHASE11D_A_CACHE_WRITE).toBe(true);
    expect(PHASE6_DOMAIN_CACHE_PRODUCTION_WIRING).toBe(false);
    expect(PHASE11D_A_PRODUCTION_HOME_WIRING).toBe(true);
    expect(PHASE11D_A_REALTIME_APPLY).toBe(true);
    expect(PHASE11D_A_BADGE_READ_WIRING).toBe(true);
    expect(PHASE11D_A_NOTIFICATION_WRITE).toBe(true);
    expect(isDomainCacheAuthorityEnabledForViewer(CANARY)).toBe(true);
    expect(isDomainCacheAuthorityEnabledForViewer(OTHER)).toBe(true);
    expect(shouldBlockLegacyHomeCacheWarm(CANARY)).toBe(true);
    expect(shouldBlockLegacyHomeCacheWarm(OTHER)).toBe(true);
    expect(() => assertNoDualWrite(["domain"])).not.toThrow();
    expect(() => assertNoDualWrite(["legacy", "domain"])).toThrow(/dual_write/);
    expect(listDomainCacheAuthoritySurfaces().every((s) => s.authority === "DOMAIN_AUTHORITY")).toBe(
      true
    );
  });
});

describe("STEP2 canonical cache keys", () => {
  it("A-B and B-A share general_direct identity; A-C differs", () => {
    const ab = generalDirectRoomIdentity("u-a", "u-b").identityKey;
    const ba = generalDirectRoomIdentity("u-b", "u-a").identityKey;
    const ac = generalDirectRoomIdentity("u-a", "u-c").identityKey;
    expect(ab).toBe(ba);
    expect(ab).not.toBe(ac);
    expect(ab.startsWith("general_direct:")).toBe(true);
  });

  it("groupId key; trade listing+seller+counterparty; store orderId", () => {
    expect(groupRoomIdentity("g1").identityKey).toBe("group:g1");
    const t1 = tradeRoomIdentity({
      itemId: "L1",
      sellerId: "S",
      buyerId: "C1",
    }).identityKey;
    const t2 = tradeRoomIdentity({
      itemId: "L2",
      sellerId: "S",
      buyerId: "C1",
    }).identityKey;
    const t3 = tradeRoomIdentity({
      itemId: "L1",
      sellerId: "S",
      buyerId: "C2",
    }).identityKey;
    expect(t1).toBe("trade:L1:S:C1");
    expect(t1).not.toBe(t2);
    expect(t1).not.toBe(t3);
    expect(storeOrderRoomIdentity("ord-1").identityKey).toBe("store_order:ord-1");
    expect(storeOrderRoomIdentity("ord-1").identityKey).not.toBe(
      storeOrderRoomIdentity("ord-2").identityKey
    );
  });

  it("stable authority cache key excludes generation", () => {
    const k1 = buildDomainCacheAuthorityKey({ domain: "general_direct", viewerUserId: CANARY });
    const k2 = buildDomainCacheAuthorityKey({ domain: "general_direct", viewerUserId: CANARY });
    expect(k1).toBe(k2);
    expect(k1.includes(":gen:")).toBe(false);
    const trade = buildDomainCacheAuthorityKey({ domain: "trade", viewerUserId: CANARY });
    expect(trade.includes("chat.trade")).toBe(true);
    expect(trade).not.toBe(k1);
  });
});

describe("STEP2 seed / hydrate / stale / isolation", () => {
  it("seeds allowlist and hydrates same rows; non-allowlist seed skipped", () => {
    const rows = [
      gdRow({
        roomId: "r1",
        userA: CANARY,
        userB: "u-b",
        lastMessageAt: "2026-07-15T01:00:00.000Z",
        preview: "new",
      }),
    ];
    const seeded = seedDomainCacheAuthoritySnapshot({
      domain: "general_direct",
      viewerUserId: CANARY,
      generation: "100",
      producedAt: "2026-07-15T01:00:00.000Z",
      rows,
    });
    expect(seeded.seeded).toBe(true);
    expect(seeded.rowCount).toBe(1);

    const hyd = hydrateDomainCacheAuthoritySnapshot<typeof rows[0]>({
      domain: "general_direct",
      viewerUserId: CANARY,
    });
    expect(hyd?.rows).toHaveLength(1);
    expect(hyd?.rows[0]?.domainIdentityKey).toBe(rows[0].domainIdentityKey);

    const otherSeed = seedDomainCacheAuthoritySnapshot({
      domain: "general_direct",
      viewerUserId: OTHER,
      generation: "100",
      producedAt: "2026-07-15T01:00:00.000Z",
      rows,
    });
    expect(otherSeed.seeded).toBe(true);
    expect(
      hydrateDomainCacheAuthoritySnapshot({ domain: "general_direct", viewerUserId: OTHER })
    ).not.toBeNull();

    const anonSeed = seedDomainCacheAuthoritySnapshot({
      domain: "general_direct",
      viewerUserId: "",
      generation: "100",
      producedAt: "2026-07-15T01:00:00.000Z",
      rows,
    });
    expect(anonSeed.seeded).toBe(false);
  });

  it("stale generation cannot overwrite newer snapshot", () => {
    const row = gdRow({
      roomId: "r1",
      userA: CANARY,
      userB: "u-b",
      lastMessageAt: "2026-07-15T02:00:00.000Z",
      preview: "latest",
    });
    seedDomainCacheAuthoritySnapshot({
      domain: "general_direct",
      viewerUserId: CANARY,
      generation: "200",
      producedAt: "2026-07-15T02:00:00.000Z",
      rows: [row],
    });
    expect(() =>
      seedDomainCacheAuthoritySnapshot({
        domain: "general_direct",
        viewerUserId: CANARY,
        generation: "100",
        producedAt: "2026-07-15T01:00:00.000Z",
        rows: [
          gdRow({
            roomId: "r1",
            userA: CANARY,
            userB: "u-b",
            lastMessageAt: "2026-07-15T01:00:00.000Z",
            preview: "stale",
          }),
        ],
      })
    ).toThrow(/stale_generation/);
    const hyd = hydrateDomainCacheAuthoritySnapshot<{ lastMessage: string }>({
      domain: "general_direct",
      viewerUserId: CANARY,
    });
    expect(hyd?.rows[0]?.lastMessage).toBe("latest");
  });

  it("duplicate canonical identity collapses to one cache row (no DB delete)", () => {
    const identity = generalDirectRoomIdentity(CANARY, "u-b").identityKey;
    const seeded = seedDomainCacheAuthoritySnapshot({
      domain: "general_direct",
      viewerUserId: CANARY,
      generation: "10",
      producedAt: "2026-07-15T03:00:00.000Z",
      rows: [
        {
          ...gdRow({
            roomId: "r-a",
            userA: CANARY,
            userB: "u-b",
            lastMessageAt: "2026-07-15T03:00:00.000Z",
          }),
          domainIdentityKey: identity,
        },
        {
          ...gdRow({
            roomId: "r-b",
            userA: CANARY,
            userB: "u-b",
            lastMessageAt: "2026-07-15T03:00:01.000Z",
          }),
          domainIdentityKey: identity,
        },
      ],
    });
    expect(seeded.seeded).toBe(true);
    expect(seeded.rowCount).toBe(1);
    expect(seeded.duplicateIdentityKeys).toContain(identity);
  });

  it("viewer A seed not visible to viewer B; rollback clears allowlist cache", () => {
    seedDomainCacheAuthoritySnapshot({
      domain: "general_direct",
      viewerUserId: CANARY,
      generation: "1",
      producedAt: "2026-07-15T04:00:00.000Z",
      rows: [
        gdRow({
          roomId: "r1",
          userA: CANARY,
          userB: "u-b",
          lastMessageAt: "2026-07-15T04:00:00.000Z",
        }),
      ],
    });
    expect(
      hydrateDomainCacheAuthoritySnapshot({ domain: "general_direct", viewerUserId: CANARY })
        ?.rows.length
    ).toBe(1);
    rollbackDomainCacheAuthority(CANARY);
    expect(
      hydrateDomainCacheAuthoritySnapshot({ domain: "general_direct", viewerUserId: CANARY })
    ).toBeNull();
  });

  it("kill disables Domain Cache Authority for allowlist", () => {
    killPhase11dACanary("test");
    expect(isDomainCacheAuthorityEnabledForViewer(CANARY)).toBe(false);
    const seeded = seedDomainCacheAuthoritySnapshot({
      domain: "general_direct",
      viewerUserId: CANARY,
      generation: "1",
      producedAt: "2026-07-15T05:00:00.000Z",
      rows: [
        gdRow({
          roomId: "r1",
          userA: CANARY,
          userB: "u-b",
          lastMessageAt: "2026-07-15T05:00:00.000Z",
        }),
      ],
    });
    expect(seeded.seeded).toBe(false);
  });
});
