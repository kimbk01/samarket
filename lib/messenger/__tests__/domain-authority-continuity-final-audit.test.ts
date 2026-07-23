/**
 * Final static audit — Domain Authority Continuity CONNECTED (allowlist) · Legacy retained.
 */
import { describe, expect, it } from "vitest";
import { assertNoDualWrite } from "@/lib/messenger/contracts/cutover";
import { applyDomainRealtimeAuthorityEnvelope } from "@/lib/messenger/contracts/domain-realtime-authority";
import { readDomainBadgeAuthorityShell } from "@/lib/messenger/contracts/domain-badge-authority";
import { writeDomainNotificationAuthorityEnvelope } from "@/lib/messenger/contracts/domain-notification-authority";
import { invokeDomainAtomicReadAuthority } from "@/lib/messenger/contracts/domain-atomic-read-authority";
import {
  isStoreOrderOwnerSurfaceExposed,
  resolveStoreOrderOwnerSurfaceForProduct,
} from "@/lib/messenger/contracts/domain-owner-surface-authority";
import { assertDomainCutoverPrepStillOff } from "@/lib/messenger/contracts/domain-cutover-prep";
import { PHASE7_DOMAIN_REALTIME_PRODUCTION_WIRING } from "@/lib/messenger/contracts/domain-event-envelope";
import { PHASE6_DOMAIN_CACHE_PRODUCTION_WIRING } from "@/lib/messenger/contracts/domain-bootstrap-cache";
import { PHASE8A_BADGE_PRODUCTION_WIRING } from "@/lib/messenger/contracts/domain-read-unread-badge";
import { PHASE8B_BADGE_PRODUCTION_WIRING } from "@/lib/messenger/contracts/badge-unit-policy-phase8b";
import { PHASE9_NOTIFICATION_PRODUCTION_WIRING } from "@/lib/messenger/contracts/domain-notification-envelope-phase9";
import { D1_1_ATOMIC_READ_RPC_PRODUCTION_WIRING } from "@/lib/messenger/contracts/domain-read-unread-badge";
import { generalDirectRoomIdentity } from "@/lib/chat-domain/room-identity";
import {
  PHASE11D_A_ATOMIC_READ_AUTHORITY_PREPARED,
  PHASE11D_A_BADGE_AUTHORITY_PREPARED,
  PHASE11D_A_BADGE_READ_WIRING,
  PHASE11D_A_CACHE_WRITE,
  PHASE11D_A_CANARY_ALLOWLIST_USER_IDS,
  PHASE11D_A_LEGACY_DELETE,
  PHASE11D_A_NOTIFICATION_AUTHORITY_PREPARED,
  PHASE11D_A_NOTIFICATION_WRITE,
  PHASE11D_A_OWNER_SURFACE_EXPOSURE,
  PHASE11D_A_OWNER_SURFACE_PREPARED,
  PHASE11D_A_PERCENT_ROLLOUT,
  PHASE11D_A_PRODUCTION_HOME_WIRING,
  PHASE11D_A_READ_WRITE,
  PHASE11D_A_REALTIME_APPLY,
  PHASE11D_A_REALTIME_AUTHORITY_PREPARED,
  assertPhase11dALayerContract,
} from "@/lib/messenger/contracts/phase11da-canary-gate";

const CANARY = PHASE11D_A_CANARY_ALLOWLIST_USER_IDS[0];
const PEER = "00000000-0000-4000-8000-000000000001";

describe("Domain Authority Continuity final audit", () => {
  it("all-user Authority stack CONNECTED; Legacy delete OFF", () => {
    expect(PHASE11D_A_CACHE_WRITE).toBe(true);
    expect(PHASE11D_A_REALTIME_APPLY).toBe(true);
    expect(PHASE11D_A_BADGE_READ_WIRING).toBe(true);
    expect(PHASE11D_A_NOTIFICATION_WRITE).toBe(true);
    expect(PHASE11D_A_READ_WRITE).toBe(true);
    expect(PHASE11D_A_OWNER_SURFACE_EXPOSURE).toBe(true);
    expect(PHASE11D_A_PRODUCTION_HOME_WIRING).toBe(true);
    expect(PHASE11D_A_LEGACY_DELETE).toBe(false);
    expect(PHASE11D_A_PERCENT_ROLLOUT).toBe(false);
    expect(PHASE7_DOMAIN_REALTIME_PRODUCTION_WIRING).toBe(false);
    expect(PHASE6_DOMAIN_CACHE_PRODUCTION_WIRING).toBe(false);
    expect(PHASE8A_BADGE_PRODUCTION_WIRING).toBe(false);
    expect(PHASE8B_BADGE_PRODUCTION_WIRING).toBe(false);
    expect(PHASE9_NOTIFICATION_PRODUCTION_WIRING).toBe(false);
    expect(D1_1_ATOMIC_READ_RPC_PRODUCTION_WIRING).toBe(false);
    expect(PHASE11D_A_REALTIME_AUTHORITY_PREPARED).toBe(true);
    expect(PHASE11D_A_BADGE_AUTHORITY_PREPARED).toBe(true);
    expect(PHASE11D_A_NOTIFICATION_AUTHORITY_PREPARED).toBe(true);
    expect(PHASE11D_A_ATOMIC_READ_AUTHORITY_PREPARED).toBe(true);
    expect(PHASE11D_A_OWNER_SURFACE_PREPARED).toBe(true);
    expect(() => assertPhase11dALayerContract()).not.toThrow();
    expect(() => assertDomainCutoverPrepStillOff()).not.toThrow();
    expect(() => assertNoDualWrite(["domain"])).not.toThrow();
    expect(() => assertNoDualWrite(["legacy", "domain"])).toThrow(/dual_write/);
  });

  it("Authority product entrypoints are live for allowlist (not skipped)", () => {
    const id = generalDirectRoomIdentity(CANARY, PEER);
    expect(
      applyDomainRealtimeAuthorityEnvelope({
        domain: "general_direct",
        viewerUserId: CANARY,
        envelope: {
          schemaVersion: 1,
          domain: "general_direct",
          identityKey: id.identityKey,
          roomId: "r1",
          viewerUserId: CANARY,
          eventId: "e-audit-1",
          generation: 1,
          occurredAt: "2026-07-01T00:00:00.000Z",
          eventType: "message_created",
          payload: {
            messageId: "m1",
            text: "hi",
            occurredAt: "2026-07-01T00:00:00.000Z",
          },
        },
      }).status
    ).not.toBe("skipped");
    expect(
      readDomainBadgeAuthorityShell({
        viewerUserId: CANARY,
        counts: { general_direct: 0, group: 0, trade: 0, store_order: 0 },
        phase8a: {
          generalDirect: {
            domain: "general_direct",
            viewerUserId: CANARY,
            unreadMessageCount: 0,
            unreadRoomCount: 0,
            unreadIdentityKeys: [],
            latestUnreadGeneration: 0,
            generation: 0,
            sourceAuthority: "server_snapshot",
            computedAt: "2026-07-01T00:00:00.000Z",
          },
          group: {
            domain: "group",
            viewerUserId: CANARY,
            unreadMessageCount: 0,
            unreadRoomCount: 0,
            unreadIdentityKeys: [],
            latestUnreadGeneration: 0,
            generation: 0,
            sourceAuthority: "server_snapshot",
            computedAt: "2026-07-01T00:00:00.000Z",
          },
          trade: {
            domain: "trade",
            viewerUserId: CANARY,
            unreadMessageCount: 0,
            unreadRoomCount: 0,
            unreadIdentityKeys: [],
            latestUnreadGeneration: 0,
            generation: 0,
            sourceAuthority: "server_snapshot",
            computedAt: "2026-07-01T00:00:00.000Z",
          },
          storeOrder: {
            domain: "store_order",
            viewerUserId: CANARY,
            unreadMessageCount: 0,
            unreadRoomCount: 0,
            unreadIdentityKeys: [],
            latestUnreadGeneration: 0,
            generation: 0,
            sourceAuthority: "server_snapshot",
            computedAt: "2026-07-01T00:00:00.000Z",
            surfaceRole: "customer",
            storeId: null,
            unreadOrderIdentityKeys: [],
          },
          orderStatus: {
            kind: "order_status",
            viewerUserId: CANARY,
            orderStatusCount: 0,
            actionableOrderIdentityKeys: [],
            generation: 0,
            computedAt: "2026-07-01T00:00:00.000Z",
          },
        },
      }).status
    ).toBe("ok");
    expect(
      writeDomainNotificationAuthorityEnvelope({
        viewerUserId: CANARY,
        raw: {
          schemaVersion: 1,
          chatDomain: "general_direct",
          domainIdentityKey: id.identityKey,
          roomId: "r1",
          eventId: "n-audit-1",
          viewerUserId: CANARY,
          senderUserId: PEER,
          notificationType: "message_created",
          badgeTarget: "app_icon",
          soundKey: "default",
          occurredAt: "2026-07-01T00:00:00.000Z",
          displayContext: {
            peerDisplayName: "Peer",
            peerAvatarUrl: null,
            messagePreview: "hello",
          },
        },
      }).status
    ).toBe("accepted");
    expect(
      invokeDomainAtomicReadAuthority({
        viewerUserId: CANARY,
        domain: "general_direct",
        args: {
          p_user_id: CANARY,
          p_room_id: "r",
          p_chat_domain: "general_direct",
          p_domain_identity_key: id.identityKey,
          p_generation: 1,
          p_last_read_message_id: null,
          p_idempotency_key: "k",
        },
      }).status
    ).toBe("ok");
    expect(isStoreOrderOwnerSurfaceExposed()).toBe(true);
    expect(resolveStoreOrderOwnerSurfaceForProduct({ viewerUserId: CANARY }).status).toBe("ok");
  });
});
