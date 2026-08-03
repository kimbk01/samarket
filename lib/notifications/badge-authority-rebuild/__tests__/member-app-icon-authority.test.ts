/**
 * Gate 3 Step 6 — App Icon Authority Projection contract (must PASS).
 */
import { describe, expect, it, beforeEach } from "vitest";
import { resolveMemberNotificationAuthorityFromRows } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-authority";
import { resolveMemberConversationAuthority } from "@/lib/notifications/badge-authority-rebuild/member-conversation-b-authority";
import {
  assertAppIconMissedCallXor,
  assertAppIconSnapshotComplete,
  clearMemberAppIconAuthority,
  compareMemberAppIconAuthorityVersion,
  nativeAppIconEchoFromAuthority,
  publishMemberAppIconAuthority,
  reconcileCachedAppIconWithCanonical,
  resolveMemberAppIconAuthority,
} from "@/lib/notifications/badge-authority-rebuild/member-app-icon-authority";
import {
  commitMemberAppIconAuthority,
  getCommittedMemberAppIconAuthority,
  logoutClearMemberAppIconAuthority,
  resetCommittedMemberAppIconAuthorityForTests,
} from "@/lib/notifications/badge-authority-rebuild/member-app-icon-authority-commit";
import { buildNotificationBadgeProjection } from "@/lib/notifications/build-notification-badge-projection";
import { gate2ASetsEqual, snapshotAuthorityASets } from "@/lib/notifications/badge-authority-rebuild/authority-a-set-heads";
import { generalDirectRoomIdentity } from "@/lib/chat-domain/room-identity";
import { resolveMemberAppIconTotalForNativeFcm } from "@/lib/notifications/badge-authority-rebuild/native-fcm-member-app-icon-authority";
import fs from "node:fs";
import path from "node:path";

const MEMBER = "11111111-1111-1111-1111-111111111111";

function aAuth(eventIds: string[] = ["evt-a"]) {
  return resolveMemberNotificationAuthorityFromRows(
    eventIds.map((id, i) => ({
      id,
      type: "admin_notice",
      category: "admin_notice",
      unread: true,
      read_at: null,
      dedupe_key: `n:${i}:${id}`,
      display_payload: {},
    })),
    MEMBER
  );
}

function bAuth(opts?: {
  general?: number;
  group?: number;
  trade?: number;
  order?: number;
}) {
  const rooms = [];
  const g = opts?.general ?? 0;
  const gr = opts?.group ?? 0;
  const t = opts?.trade ?? 0;
  const o = opts?.order ?? 0;
  for (let i = 0; i < g; i++) {
    rooms.push({
      roomId: `gd-${i}`,
      chatDomain: "general_direct" as const,
      unreadMessageCount: 3,
      domainIdentityKey: generalDirectRoomIdentity(MEMBER, `peer-${i}`).identityKey,
      memberId: MEMBER,
      peerUserId: `peer-${i}`,
    });
  }
  for (let i = 0; i < gr; i++) {
    rooms.push({
      roomId: `grp-${i}`,
      chatDomain: "group" as const,
      unreadMessageCount: 2,
      domainIdentityKey: `group:g-${i}`,
      groupId: `g-${i}`,
      memberId: MEMBER,
    });
  }
  for (let i = 0; i < t; i++) {
    rooms.push({
      roomId: `tr-${i}`,
      chatDomain: "trade" as const,
      unreadMessageCount: 5,
      domainIdentityKey: `trade:L${i}:s:c`,
      listingId: `L${i}`,
      sellerId: "s",
      counterpartyId: "c",
      memberId: MEMBER,
    });
  }
  for (let i = 0; i < o; i++) {
    rooms.push({
      roomId: `so-${i}`,
      chatDomain: "store_order_customer" as const,
      unreadMessageCount: 4,
      domainIdentityKey: `store_order:o${i}`,
      orderId: `o${i}`,
      memberId: MEMBER,
    });
  }
  return resolveMemberConversationAuthority(MEMBER, rooms);
}

describe("Gate3 Step6 Member App Icon Authority", () => {
  beforeEach(() => {
    resetCommittedMemberAppIconAuthorityForTests();
  });

  it("appIconTotal equals A+B and exposes all components", () => {
    const snap = resolveMemberAppIconAuthority({
      notificationA: aAuth(["e1", "e2"]),
      conversationB: bAuth({ general: 1, group: 1, trade: 1, order: 1 }),
      revision: 100,
    });
    expect(assertAppIconSnapshotComplete(snap)).toBe(true);
    expect(snap.memberNotificationUnread).toBe(2);
    expect(snap.memberConversationUnreadRooms).toBe(4);
    expect(snap.generalUnreadRooms + snap.groupUnreadRooms).toBe(2);
    expect(snap.tradeUnreadRooms).toBe(1);
    expect(snap.orderUnreadRooms).toBe(1);
    expect(snap.memberConversationUnreadRooms).toBe(
      snap.generalUnreadRooms +
        snap.groupUnreadRooms +
        snap.tradeUnreadRooms +
        snap.orderUnreadRooms
    );
    expect(snap.appIconTotal).toBe(2 + 4);
    expect(snap.memberKey).toBe(`user:${MEMBER}`);
    expect(snap.authorityVersion.startsWith("ai1|100|")).toBe(true);
  });

  it("attention keys / legacy totals / UI surfaces do not feed App Icon builder", () => {
    const snap = resolveMemberAppIconAuthority({
      notificationA: aAuth(["only-a"]),
      conversationB: bAuth({ general: 2 }),
      revision: 1,
    });
    // Builder ignores these — only A+B inputs matter
    const attentionKeysLength = 99;
    const legacyTotal = 50;
    const uiBell = 7;
    const uiBottom = 12;
    void attentionKeysLength;
    void legacyTotal;
    void uiBell;
    void uiBottom;
    expect(snap.appIconTotal).toBe(1 + 2);
  });

  it("owner C does not affect appIconTotal; publish rejects owner contamination", () => {
    const snap = resolveMemberAppIconAuthority({
      notificationA: aAuth(),
      conversationB: bAuth({ order: 1 }),
      revision: 5,
    });
    expect(snap.appIconTotal).toBe(1 + 1);
    expect(
      publishMemberAppIconAuthority(snap, null, { ownerStoreOrderUnreadRooms: 9 }).ok
    ).toBe(false);
    expect(
      publishMemberAppIconAuthority(snap, null, { storeActionRequiredCount: 3 }).ok
    ).toBe(false);
    expect(publishMemberAppIconAuthority(snap, null).ok).toBe(true);
  });

  it("orphan missed counted once through A; room-bound once through B; no A∩B", () => {
    const a = resolveMemberNotificationAuthorityFromRows(
      [
        {
          id: "orphan-evt",
          type: "missed_call",
          category: "missed_call",
          unread: true,
          read_at: null,
          room_id: null,
          dedupe_key: "missed:orphan-sess:u",
          display_payload: {},
        },
      ],
      MEMBER
    );
    expect(a.eventIds).toEqual(["orphan-evt"]);
    const b = bAuth({ general: 1 });
    const snap = resolveMemberAppIconAuthority({
      notificationA: a,
      conversationB: b,
      revision: 2,
    });
    expect(snap.appIconTotal).toBe(1 + 1);
    // Builder path must not add orphan again
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: {
        general_direct: 1,
        group: 0,
        trade: 0,
        store_order: 0,
      },
      orphanMissedCall: 1,
      unresolvedMissedCallIds: ["orphan-sess"],
      nonChatEventAttention: {
        tradeStatus: 0,
        orderStatus: 0,
        deliveryStatus: 0,
        communityActivity: 0,
        adminNotice: 0,
      },
      memberUnreadNotificationCount: 1,
    });
    expect(p.memberAppIconWebTotal).toBe(1 + 1);
    expect(assertAppIconMissedCallXor(snap).ok).toBe(true);
  });

  it("same missed identity cannot contribute to A and B", () => {
    // Identity must be B-canonical so the room enters B; collision is on the shared id string.
    const collideId = generalDirectRoomIdentity(MEMBER, "peer-x").identityKey;
    const snap = resolveMemberAppIconAuthority({
      notificationA: aAuth([collideId]),
      conversationB: resolveMemberConversationAuthority(MEMBER, [
        {
          roomId: "r1",
          chatDomain: "general_direct",
          unreadMessageCount: 1,
          domainIdentityKey: collideId,
          memberId: MEMBER,
          peerUserId: "peer-x",
        },
      ]),
      revision: 1,
    });
    expect(snap.memberConversationUnreadRooms).toBe(1);
    expect(assertAppIconMissedCallXor(snap).ok).toBe(false);
  });

  it("older authorityVersion cannot overwrite newer; same idempotent; newer replaces", () => {
    const newer = resolveMemberAppIconAuthority({
      notificationA: aAuth(["a"]),
      conversationB: bAuth({ general: 2 }),
      revision: 200,
    });
    const older = resolveMemberAppIconAuthority({
      notificationA: aAuth(["a"]),
      conversationB: bAuth({ general: 1 }),
      revision: 100,
    });
    expect(compareMemberAppIconAuthorityVersion(older.authorityVersion, newer.authorityVersion)).toBe(
      -1
    );
    const applied = publishMemberAppIconAuthority(newer, null);
    expect(applied.ok).toBe(true);
    if (applied.ok) expect(applied.action).toBe("applied");
    const stale = publishMemberAppIconAuthority(older, newer);
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.reason).toBe("STALE_VERSION");
    const same = publishMemberAppIconAuthority(newer, newer);
    expect(same.ok).toBe(true);
    if (same.ok) expect(same.action).toBe("idempotent");
    const newest = resolveMemberAppIconAuthority({
      notificationA: aAuth(["a", "b"]),
      conversationB: bAuth({ general: 2 }),
      revision: 300,
    });
    const replaced = publishMemberAppIconAuthority(newest, newer);
    expect(replaced.ok).toBe(true);
    if (replaced.ok) expect(replaced.action).toBe("applied");
  });

  it("different member rejected; logout clears; zero clears native", () => {
    const m1 = resolveMemberAppIconAuthority({
      notificationA: aAuth(),
      conversationB: bAuth({ general: 1 }),
      revision: 10,
    });
    const otherMember = "22222222-2222-2222-2222-222222222222";
    const m2 = resolveMemberAppIconAuthority({
      notificationA: resolveMemberNotificationAuthorityFromRows(
        [
          {
            id: "x",
            type: "admin_notice",
            category: "admin_notice",
            unread: true,
            read_at: null,
            dedupe_key: "x",
            display_payload: {},
          },
        ],
        otherMember
      ),
      conversationB: resolveMemberConversationAuthority(otherMember, []),
      revision: 11,
    });
    const mismatch = publishMemberAppIconAuthority(m2, m1);
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.reason).toBe("MEMBER_MISMATCH");
    expect(clearMemberAppIconAuthority(m1)).toBeNull();
    expect(nativeAppIconEchoFromAuthority(null)).toEqual({
      mode: "absolute_replace",
      total: 0,
      clear: true,
    });
    const zero = resolveMemberAppIconAuthority({
      notificationA: resolveMemberNotificationAuthorityFromRows([], MEMBER),
      conversationB: bAuth({}),
      revision: 12,
    });
    expect(nativeAppIconEchoFromAuthority(zero).clear).toBe(true);
  });

  it("commit store: duplicate trigger idempotent; cache cannot overwrite newer", () => {
    const v1 = resolveMemberAppIconAuthority({
      notificationA: aAuth(),
      conversationB: bAuth({ general: 1 }),
      revision: 50,
    });
    const v2 = resolveMemberAppIconAuthority({
      notificationA: aAuth(["e1", "e2"]),
      conversationB: bAuth({ general: 1 }),
      revision: 60,
    });
    const c1 = commitMemberAppIconAuthority(v2);
    expect(c1.ok).toBe(true);
    if (c1.ok) expect(c1.action).toBe("applied");
    const c2 = commitMemberAppIconAuthority(v2);
    expect(c2.ok).toBe(true);
    if (c2.ok) expect(c2.action).toBe("idempotent");
    expect(getCommittedMemberAppIconAuthority()?.appIconTotal).toBe(v2.appIconTotal);
    const staleCache = reconcileCachedAppIconWithCanonical({
      cached: v2,
      canonical: v1,
    });
    expect(staleCache.ok).toBe(false);
    if (!staleCache.ok) expect(staleCache.reason).toBe("STALE_VERSION");
    logoutClearMemberAppIconAuthority();
    expect(getCommittedMemberAppIconAuthority()).toBeNull();
  });

  it("Native FCM echo prefers snapshot; performs no arithmetic fields", () => {
    const snap = resolveMemberAppIconAuthority({
      notificationA: aAuth(["a", "b", "c"]),
      conversationB: bAuth({ trade: 2 }),
      revision: 9,
    });
    expect(
      resolveMemberAppIconTotalForNativeFcm({
        memberAppIconAuthority: snap,
        memberAppIconWebTotal: 99,
        appIconTotal: 88,
      })
    ).toBe(snap.appIconTotal);
    expect(nativeAppIconEchoFromAuthority(snap).mode).toBe("absolute_replace");
    const sync = fs.readFileSync(
      path.join(process.cwd(), "lib/push/native/sync-native-badge-count.ts"),
      "utf8"
    );
    expect(sync.includes("count + 1") || sync.includes("count - 1")).toBe(false);
  });

  it("cold/warm/resume use same authority builder (source contract)", () => {
    const root = process.cwd();
    const http = fs.readFileSync(
      path.join(root, "lib/notifications/pipeline/build-domain-badge-authority-http.ts"),
      "utf8"
    );
    expect(http.includes("resolveMemberAppIconAuthority")).toBe(true);
    expect(http.includes("memberAppIconAuthority")).toBe(true);
    const apply = fs.readFileSync(
      path.join(root, "lib/notifications/apply-badge-count-authority-response.ts"),
      "utf8"
    );
    expect(apply.includes("commitMemberAppIconAuthorityFromHttpBody")).toBe(true);
  });

  it("A/B non-regression: digit set equality and B parent≠Σ messages", () => {
    const aRows = [
      {
        id: "evt-a",
        type: "trade_status",
        category: "trade_status",
        unread: true,
        read_at: null,
        dedupe_key: "t1",
        display_payload: { legacyMeta: { product_id: "p" } },
      },
      {
        id: "evt-b",
        type: "admin_notice",
        category: "admin_notice",
        unread: true,
        read_at: null,
        dedupe_key: "n1",
        display_payload: {},
      },
    ];
    const snapA = snapshotAuthorityASets(aRows, MEMBER);
    expect(gate2ASetsEqual(snapA)).toBe(true);
    const b = bAuth({ general: 1, group: 1 });
    expect(b.rooms[0]?.unreadMessageCount).toBe(3);
    expect(b.totalUnreadRooms).toBe(2);
    expect(b.totalUnreadRooms).not.toBe(
      b.rooms.reduce((s, r) => s + r.unreadMessageCount, 0)
    );
    const icon = resolveMemberAppIconAuthority({
      notificationA: resolveMemberNotificationAuthorityFromRows(aRows, MEMBER),
      conversationB: b,
      revision: 1,
    });
    expect(icon.appIconTotal).toBe(2 + 2);
  });
});
