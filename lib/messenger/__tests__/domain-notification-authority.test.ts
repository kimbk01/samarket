/**
 * STEP 5 — Domain Notification Authority tests (allowlist CONNECTED, no native push).
 */
import { describe, expect, it } from "vitest";
import {
  DOMAIN_NOTIFICATION_AUTHORITY_NATIVE_PUSH_FORBIDDEN,
  isDomainNotificationAuthorityEnabledForViewer,
  listDomainNotificationAuthoritySurfaces,
  parseDomainNotificationAuthorityForHarness,
  writeDomainNotificationAuthorityEnvelope,
} from "@/lib/messenger/contracts/domain-notification-authority";
import {
  PHASE11D_A_CANARY_ALLOWLIST_USER_IDS,
  PHASE11D_A_NOTIFICATION_AUTHORITY_PREPARED,
  PHASE11D_A_NOTIFICATION_WRITE,
} from "@/lib/messenger/contracts/phase11da-canary-gate";
import { PHASE9_NOTIFICATION_PRODUCTION_WIRING } from "@/lib/messenger/contracts/domain-notification-envelope-phase9";
import { generalDirectRoomIdentity } from "@/lib/chat-domain/room-identity";

const CANARY = PHASE11D_A_CANARY_ALLOWLIST_USER_IDS[0];
const OTHER = "00000000-0000-4000-8000-000000000099";
const PEER = "00000000-0000-4000-8000-000000000001";

function sampleEnvelope(viewerUserId: string = CANARY) {
  const id = generalDirectRoomIdentity(viewerUserId as typeof CANARY, PEER);
  return {
    schemaVersion: 1,
    chatDomain: "general_direct",
    domainIdentityKey: id.identityKey,
    roomId: "r1",
    eventId: "n1",
    viewerUserId,
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
  };
}

describe("STEP5 Domain Notification Authority", () => {
  it("prepared and product write CONNECTED; native push still forbidden", () => {
    expect(PHASE11D_A_NOTIFICATION_AUTHORITY_PREPARED).toBe(true);
    expect(PHASE11D_A_NOTIFICATION_WRITE).toBe(true);
    expect(PHASE9_NOTIFICATION_PRODUCTION_WIRING).toBe(false);
    expect(DOMAIN_NOTIFICATION_AUTHORITY_NATIVE_PUSH_FORBIDDEN).toBe(true);
    expect(isDomainNotificationAuthorityEnabledForViewer(CANARY)).toBe(true);
    expect(isDomainNotificationAuthorityEnabledForViewer(OTHER)).toBe(true);
    expect(isDomainNotificationAuthorityEnabledForViewer("")).toBe(false);
    expect(
      listDomainNotificationAuthoritySurfaces().every(
        (s) => s.authority === "DOMAIN_AUTHORITY" && s.nativePush === "forbidden"
      )
    ).toBe(true);
  });

  it("product write returns accepted for allowlist (nativePush forbidden)", () => {
    const result = writeDomainNotificationAuthorityEnvelope({
      viewerUserId: CANARY,
      raw: sampleEnvelope(),
    });
    expect(result.status).toBe("accepted");
    if (result.status === "accepted") {
      expect(result.nativePush).toBe("forbidden");
      expect(result.envelope.viewerUserId).toBe(CANARY);
      expect(
        "messagePreview" in result.envelope.displayContext
          ? (result.envelope.displayContext as { messagePreview: string }).messagePreview
          : ""
      ).toBe("hello");
    }
  });

  it("anonymous product write skips", () => {
    expect(
      writeDomainNotificationAuthorityEnvelope({
        viewerUserId: "",
        raw: {
          ...sampleEnvelope(CANARY),
          viewerUserId: "",
        },
      })
    ).toEqual({
      status: "skipped",
      reason: "authority_off_or_not_allowlisted",
    });
  });

  it("any authenticated viewer product write accepted", () => {
    const result = writeDomainNotificationAuthorityEnvelope({
      viewerUserId: OTHER,
      raw: sampleEnvelope(OTHER),
    });
    expect(result.status).toBe("accepted");
  });

  it("harness parses envelope without push", () => {
    const env = parseDomainNotificationAuthorityForHarness(sampleEnvelope());
    expect(env.chatDomain).toBe("general_direct");
    expect(env.viewerUserId).toBe(CANARY);
    expect(
      "messagePreview" in env.displayContext
        ? (env.displayContext as { messagePreview: string }).messagePreview
        : ""
    ).toBe("hello");
  });
});
