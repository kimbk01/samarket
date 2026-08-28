/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetNotificationSoundDecisionForTests,
  decideNotificationSound,
  ingestCanonicalNotificationSound,
  ingestAdminRowSound,
  ingestMessengerMessageSound,
  resetNotificationSoundRuntimeForAuthEpoch,
  seedCanonicalSoundConsumed,
} from "@/lib/notifications/notification-sound-decision";
import { playEventNotificationSound } from "@/lib/notifications/notification-sound-engine";
import { syncNotificationSoundGateSnapshot } from "@/lib/notifications/notification-sound-gate-snapshot";

vi.mock("@/lib/notifications/notification-sound-engine", () => ({
  playEventNotificationSound: vi.fn(async () => {}),
  resetNotificationSoundEngineForAuthEpoch: vi.fn(),
  playDomainNotificationSound: vi.fn(async () => {}),
}));

const RECIPIENT = "user-a";

function playInput(
  overrides: Partial<Parameters<typeof decideNotificationSound>[0]> = {}
): Parameters<typeof decideNotificationSound>[0] {
  return {
    identityKind: "messenger_message",
    canonicalEventId: "M1",
    recipientId: RECIPIENT,
    eventType: "messenger_direct_message_received",
    source: "realtime",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("GATE 2 notification sound decision", () => {
  beforeEach(() => {
    vi.mocked(playEventNotificationSound).mockClear();
    syncNotificationSoundGateSnapshot({
      userNotificationSettings: {
        trade_chat_enabled: true,
        community_chat_enabled: true,
        order_enabled: true,
        store_enabled: true,
        sound_enabled: true,
        vibration_enabled: true,
      },
      activeTradeChatRoomId: null,
      activeCommunityChatRoomId: null,
      activeGroupChatRoomId: null,
      isWindowFocused: true,
    });
    __resetNotificationSoundDecisionForTests({
      recipientId: RECIPIENT,
      isLeader: true,
      callActive: false,
      visibility: "visible",
      windowFocused: true,
      sessionStartedAt: Date.now() - 1_000,
    });
  });

  it("1 bootstrap unread does not play", () => {
    const d = decideNotificationSound(playInput({ source: "hydrate", canonicalEventId: "old-1" }));
    expect(d.reason).toBe("SKIP_BOOTSTRAP");
    expect(playEventNotificationSound).not.toHaveBeenCalled();
  });

  it("2 new message M1 plays once", () => {
    const first = ingestCanonicalNotificationSound(playInput());
    expect(first.action).toBe("PLAY");
    expect(playEventNotificationSound).toHaveBeenCalledTimes(1);
  });

  it("3 duplicate RT of M1 stays at one play", () => {
    ingestCanonicalNotificationSound(playInput());
    ingestCanonicalNotificationSound(playInput());
    expect(playEventNotificationSound).toHaveBeenCalledTimes(1);
    expect(decideNotificationSound(playInput()).reason).toBe("SKIP_ALREADY_CONSUMED");
  });

  it("4 push + RT share identity", () => {
    ingestCanonicalNotificationSound(playInput({ source: "push" }));
    ingestCanonicalNotificationSound(playInput({ source: "realtime" }));
    expect(playEventNotificationSound).toHaveBeenCalledTimes(1);
  });

  it("5 reconnect historical M1 is silent", () => {
    const d = decideNotificationSound(
      playInput({
        createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      })
    );
    expect(d.reason).toBe("SKIP_BOOTSTRAP");
  });

  it("6 initial participants unread has no message identity — not a sound path", () => {
    const d = decideNotificationSound(
      playInput({
        canonicalEventId: "",
      })
    );
    expect(d.reason).toBe("SKIP_NO_IDENTITY");
  });

  it("7 admin existing pending seeded → sound 0", () => {
    seedCanonicalSoundConsumed({ identityKind: "admin_row", canonicalEventId: "ad-1", recipientId: RECIPIENT });
    const d = ingestAdminRowSound({ sourceTable: "feed_ad_requests", rowId: "ad-1", recipientId: RECIPIENT });
    expect(d.reason).toBe("SKIP_ALREADY_CONSUMED");
    expect(playEventNotificationSound).not.toHaveBeenCalled();
  });

  it("8 admin new actionable row plays once", () => {
    const d = ingestAdminRowSound({
      sourceTable: "feed_ad_requests",
      rowId: "ad-new",
      recipientId: RECIPIENT,
      createdAt: new Date().toISOString(),
    });
    expect(d.action).toBe("PLAY");
    expect(playEventNotificationSound).toHaveBeenCalledTimes(1);
  });

  it("9 admin burst coalesces audio and keeps row identities consumed", () => {
    const reasons = Array.from({ length: 8 }, (_, i) =>
      ingestAdminRowSound({
        sourceTable: "feed_ad_requests",
        rowId: `burst-${i}`,
        recipientId: RECIPIENT,
        createdAt: new Date().toISOString(),
      })
    );
    const plays = reasons.filter((r) => r.action === "PLAY");
    const coalesced = reasons.filter((r) => r.reason === "SKIP_COALESCED");
    expect(plays).toHaveLength(1);
    expect(coalesced.length).toBeGreaterThan(0);
    expect(playEventNotificationSound).toHaveBeenCalledTimes(1);
  });

  it("P0-B T5/T6 point_charge_requests INSERT sound once then duplicate blocked", () => {
    const first = ingestAdminRowSound({
      sourceTable: "point_charge_requests",
      rowId: "pcr-1",
      recipientId: RECIPIENT,
      createdAt: new Date().toISOString(),
    });
    expect(first.action).toBe("PLAY");
    const replay = ingestAdminRowSound({
      sourceTable: "point_charge_requests",
      rowId: "pcr-1",
      recipientId: RECIPIENT,
      createdAt: new Date().toISOString(),
    });
    expect(replay.reason).toBe("SKIP_ALREADY_CONSUMED");
    expect(playEventNotificationSound).toHaveBeenCalledTimes(1);
  });

  it("10 logout A then login B drops delayed A callback", () => {
    ingestCanonicalNotificationSound(playInput());
    resetNotificationSoundRuntimeForAuthEpoch();
    __resetNotificationSoundDecisionForTests({
      recipientId: "user-b",
      isLeader: true,
      visibility: "visible",
      windowFocused: true,
      sessionStartedAt: Date.now() - 500,
    });
    const delayed = ingestCanonicalNotificationSound(playInput({ recipientId: RECIPIENT }));
    expect(delayed.reason).toBe("SKIP_WRONG_RECIPIENT");
    vi.mocked(playEventNotificationSound).mockClear();
    const bEvent = ingestCanonicalNotificationSound(
      playInput({ recipientId: "user-b", canonicalEventId: "M-b" })
    );
    expect(bEvent.action).toBe("PLAY");
  });

  it("11 non-leader tab is silent", () => {
    __resetNotificationSoundDecisionForTests({
      recipientId: RECIPIENT,
      isLeader: false,
      visibility: "visible",
      windowFocused: true,
      sessionStartedAt: Date.now() - 500,
    });
    const d = ingestCanonicalNotificationSound(playInput({ canonicalEventId: "M-tab" }));
    expect(d.reason).toBe("SKIP_NOT_LEADER");
    expect(playEventNotificationSound).not.toHaveBeenCalled();
  });

  it("12 active call suppresses message sound", () => {
    __resetNotificationSoundDecisionForTests({
      recipientId: RECIPIENT,
      isLeader: true,
      callActive: true,
      visibility: "visible",
      windowFocused: true,
      sessionStartedAt: Date.now() - 500,
    });
    const d = ingestCanonicalNotificationSound(playInput({ canonicalEventId: "M-call" }));
    expect(d.reason).toBe("SKIP_ACTIVE_CALL");
  });

  it("13 incoming call identity is native-owned", () => {
    const d = decideNotificationSound(
      playInput({
        identityKind: "call_session",
        canonicalEventId: "sess-1",
        eventType: "call_incoming_voice",
      })
    );
    expect(d.reason).toBe("SKIP_CALL_NATIVE_OWNER");
  });

  it("14 call session hydrate is bootstrap-silent", () => {
    const d = decideNotificationSound(
      playInput({
        identityKind: "call_session",
        canonicalEventId: "sess-old",
        eventType: "call_incoming_voice",
        source: "hydrate",
      })
    );
    expect(d.reason).toBe("SKIP_CALL_NATIVE_OWNER");
  });

  it("15 poll without fallback is not sound authority", () => {
    const d = decideNotificationSound(playInput({ source: "poll", canonicalEventId: "M-poll" }));
    expect(d.reason).toBe("SKIP_POLL_NOT_AUTHORITY");
  });

  it("rejects Date.now() identity", () => {
    const d = decideNotificationSound(playInput({ canonicalEventId: String(Date.now()) }));
    expect(d.reason).toBe("SKIP_TIMESTAMP_IDENTITY");
  });

  it("hidden document yields OS owner", () => {
    __resetNotificationSoundDecisionForTests({
      recipientId: RECIPIENT,
      isLeader: true,
      visibility: "hidden",
      sessionStartedAt: Date.now() - 500,
    });
    const d = ingestMessengerMessageSound({
      messageId: "M-hidden",
      recipientId: RECIPIENT,
      createdAt: new Date().toISOString(),
    });
    expect(d.reason).toBe("SKIP_BACKGROUND_OS_OWNER");
  });
});
