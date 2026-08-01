import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("notification sound HARD LOCK contract (Phase 1)", () => {
  it("keeps cm_participant_already_played duplicate gate", () => {
    const gate = read("lib/notifications/notification-sound-gate.ts");
    expect(gate).toContain("cm_participant_already_played");
    expect(gate).toContain("shouldSkipNotificationInsertSoundForCmParticipant");
  });

  it("does not claim INSERT ownership when CM domain is unknown", () => {
    const effects = read(
      "lib/community-messenger/notifications/cm-participant-unread-full-effects.ts"
    );
    expect(effects).toContain("else if (dedupeKey && !playInAppMessageSound)");
    expect(effects).not.toMatch(
      /else if \(dedupeKey && !allowSound\)[\s\S]{0,200}noteCmParticipantSurfaceSoundHandled/
    );
    expect(effects).toContain("domain 미상");
  });

  it("hub-sync does not forge sound_schedule_ms from schedule latency", () => {
    const hub = read("lib/community-messenger/notifications/use-cm-participants-hub-sync.ts");
    expect(hub).toContain("sound_schedule_ms: null");
    expect(hub).toContain("scheduled\" 오판");
  });

  it("keeps single coalesced owner entry for chat alert sound", () => {
    const coalesced = read("lib/notifications/coalesced-chat-alert-sound.ts");
    expect(coalesced).toContain("playDomainNotificationSound");
    expect(coalesced).toContain("tryConsumeChatAlertSlot");
  });

  it("does not silently swallow Audio.play failures", () => {
    const engine = read("lib/notifications/notification-sound-engine.ts");
    expect(engine).not.toContain("void a.play().catch(() => {})");
    expect(engine).toContain("playOneShot_failed");
    expect(engine).toContain("playDomainNotificationSound.enter");
  });
});
