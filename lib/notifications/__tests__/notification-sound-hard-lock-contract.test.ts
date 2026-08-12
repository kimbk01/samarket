import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("notification sound GATE 2 contract", () => {
  it("central decision owns occurrence identity", () => {
    const decision = read("lib/notifications/notification-sound-decision.ts");
    expect(decision).toContain("canonicalEventId");
    expect(decision).toContain("SKIP_ALREADY_CONSUMED");
    expect(decision).toContain("SKIP_BOOTSTRAP");
    expect(decision).toContain("looksLikeTimestampIdentity");
    expect(decision).not.toMatch(/canonicalEventId:\s*(String\()?Date\.now/);
  });

  it("participant unread is not sound authority", () => {
    const effects = read(
      "lib/community-messenger/notifications/cm-participant-unread-full-effects.ts"
    );
    expect(effects).not.toContain("playCoalescedChatNotificationSound");
    expect(effects).toContain("unread_delta_not_sound_authority");
  });

  it("engine play path does not await SSOT hydrate", () => {
    const engine = read("lib/notifications/notification-sound-engine.ts");
    expect(engine).not.toContain("ensureNotificationSoundSsotHydratedForClient");
    expect(engine).toContain("SOUND HOT PATH HTTP = 0");
    expect(engine).toContain("playOneShot_failed");
  });

  it("chat poll is not sound authority", () => {
    const chat = read("components/chats/ChatDetailView.tsx");
    expect(chat).not.toContain("playCoalescedEventNotificationSound");
    expect(chat).not.toContain("playCoalescedOrderMatchChatAlert");
  });

  it("incoming call JS one-shot is removed", () => {
    const incoming = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    expect(incoming).not.toContain("playEventNotificationSound");
  });

  it("idle 3s participant bridge is after-paint rAF", () => {
    const deferred = read("components/layout/DeferredMainShellMessengerParticipantBridge.tsx");
    expect(deferred).not.toContain("timeout: 3000");
    expect(deferred).toContain("requestAnimationFrame");
  });

  it("sound tab leader starts at app lifetime, not route Prime", () => {
    const layout = read("app/layout.tsx");
    const bootstrap = read("components/notifications/NotificationSoundLeaderBootstrap.tsx");
    const prime = read("components/notifications/NotificationSoundPrime.tsx");
    const flags = read("lib/layout/conditional-app-shell-flags.ts");
    expect(layout).toContain("NotificationSoundLeaderBootstrap");
    expect(bootstrap).toContain("ensureNotificationSoundRuntimeStarted");
    expect(prime).toContain("ensureNotificationSoundRuntimeStarted");
    expect(flags).not.toMatch(/mountNotificationSoundPrime[\s\S]{0,80}\/market/);
  });

  it("admin sound ingress waits for realtime JWT and uses row PK", () => {
    const admin = read("components/admin/store-points/AdminStorePointPendingProvider.tsx");
    expect(admin).toContain("waitForSupabaseRealtimeAuth");
    expect(admin).toContain("ingestAdminRowSound");
    expect(admin).not.toMatch(/setAdminBellCount\([\s\S]{0,120}ingestAdminRowSound/);
    expect(admin).not.toMatch(/userChargePendingCount[\s\S]{0,80}ingestAdminRowSound/);
  });

  it("logout wipes sound runtime with badge epoch", () => {
    const wipe = read("lib/auth/client-session-wipe.ts");
    expect(wipe).toContain("resetNotificationSoundRuntimeForAuthEpoch");
  });
});
