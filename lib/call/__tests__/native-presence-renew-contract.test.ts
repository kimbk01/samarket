import { describe, expect, it } from "vitest";
import {
  CALL_PRESENCE_NATIVE_CAPABLE_BODY_KEY,
  CALL_PRESENCE_NATIVE_RENEW_INTERVAL_MS,
  CALL_PRESENCE_SHADOW_LEASE_TTL_MS,
  canEndActiveCallForPresenceStale,
  evaluateActiveCallPresenceDetail,
} from "@/lib/call/call-active-presence";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "../../..");

describe("Native presence renew contract (Capability CUT)", () => {
  it("cadence is derived from shadow lease TTL (not 10s)", () => {
    expect(CALL_PRESENCE_SHADOW_LEASE_TTL_MS).toBe(300_000);
    expect(CALL_PRESENCE_NATIVE_RENEW_INTERVAL_MS).toBe(150_000);
    expect(CALL_PRESENCE_NATIVE_RENEW_INTERVAL_MS).toBe(
      Math.floor(CALL_PRESENCE_SHADOW_LEASE_TTL_MS / 2),
    );
    expect(CALL_PRESENCE_NATIVE_RENEW_INTERVAL_MS).toBeGreaterThan(10_000);
  });

  it("capability body key is explicit (not UA/version/non-null lease)", () => {
    expect(CALL_PRESENCE_NATIVE_CAPABLE_BODY_KEY).toBe("nativePresenceCapable");
  });

  it("Production authority remains legacy_hb with capable renew fields present", () => {
    const now = Date.now();
    const row = {
      status: "active",
      answered_at: new Date(now - 120_000).toISOString(),
      ended_at: null,
      caller_last_heartbeat_at: new Date(now - 5_000).toISOString(),
      callee_last_heartbeat_at: new Date(now - 5_000).toISOString(),
      caller_presence_lease_until: new Date(now + 60_000).toISOString(),
      callee_presence_lease_until: new Date(now + 60_000).toISOString(),
    };
    const detail = evaluateActiveCallPresenceDetail(row, now);
    expect(detail.productionAuthority).toBe("legacy_hb");
    expect(detail.leaseEvaluation).toBe("shadow");
    expect(canEndActiveCallForPresenceStale(row, now)).toBe(false);
  });

  it("I1–I8 source: iOS renew owner + CallApi capable flag (no BG guarantee claim)", () => {
    const owner = readFileSync(join(ROOT, "ios/App/App/Call/NativePresenceLeaseRenewOwner.swift"), "utf8");
    const voiceApi = readFileSync(join(ROOT, "ios/App/App/Call/NativeVoiceCallApi.swift"), "utf8");
    const videoApi = readFileSync(join(ROOT, "ios/App/App/Call/Video/NativeVideoCallApi.swift"), "utf8");
    const voiceRt = readFileSync(join(ROOT, "ios/App/App/Call/NativeVoiceCallRuntime.swift"), "utf8");
    const videoRt = readFileSync(join(ROOT, "ios/App/App/Call/Video/NativeVideoCallRuntime.swift"), "utf8");

    expect(owner).toContain("renewIntervalMs");
    expect(owner).toContain("shadowLeaseTtlMs");
    expect(owner).toContain("best-effort");
    expect(owner).toContain("do not claim guaranteed BG execution");
    expect(owner).toContain("immediate_connected");
    expect(owner).toContain("server_not_live");

    expect(voiceApi).toContain("presenceRenewAsync");
    expect(voiceApi).toContain("nativePresenceCapable");
    expect(videoApi).toContain("presenceRenewAsync");
    expect(videoApi).toContain("nativePresenceCapable");

    expect(voiceRt).toContain("NativePresenceLeaseRenewOwner.start");
    expect(voiceRt).toContain("NativePresenceLeaseRenewOwner.stop");
    expect(videoRt).toContain("NativePresenceLeaseRenewOwner.start");
    expect(videoRt).toContain("NativePresenceLeaseRenewOwner.stop");
  });

  it("Android renew owner + CallApi capable flag + Runtime wiring", () => {
    const owner = readFileSync(
      join(ROOT, "android/app/src/main/java/com/dibay/app/call/NativePresenceLeaseRenewOwner.java"),
      "utf8",
    );
    const voiceApi = readFileSync(
      join(ROOT, "android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallApi.java"),
      "utf8",
    );
    const videoApi = readFileSync(
      join(ROOT, "android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallApi.java"),
      "utf8",
    );
    const voiceRt = readFileSync(
      join(ROOT, "android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallRuntime.java"),
      "utf8",
    );
    const videoRt = readFileSync(
      join(ROOT, "android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallRuntime.java"),
      "utf8",
    );
    expect(owner).toContain("RENEW_INTERVAL_MS = SHADOW_LEASE_TTL_MS / 2");
    expect(owner).not.toContain("10_000");
    expect(voiceApi).toContain("nativePresenceCapable");
    expect(videoApi).toContain("nativePresenceCapable");
    expect(voiceRt).toContain("NativePresenceLeaseRenewOwner.start");
    expect(voiceRt).toContain("NativePresenceLeaseRenewOwner.stop");
    expect(videoRt).toContain("NativePresenceLeaseRenewOwner.start");
    expect(videoRt).toContain("NativePresenceLeaseRenewOwner.stop");
  });

  it("server heartbeat accepts nativePresenceCapable without lease cutover", () => {
    const hb = readFileSync(join(ROOT, "lib/community-messenger/call-session-heartbeat.ts"), "utf8");
    const route = readFileSync(
      join(ROOT, "app/api/community-messenger/calls/sessions/[sessionId]/route.ts"),
      "utf8",
    );
    expect(hb).toContain("nativePresenceCapable");
    expect(hb).toContain("leaseCutover: false");
    expect(hb).toContain('productionAuthority: "legacy_hb"');
    expect(route).toContain("nativePresenceCapable: body.nativePresenceCapable === true");
    expect(hb).toContain("canEndActiveCallForPresenceStale");
  });

  it("ringback dirty is not part of this CUT (source untouched by renew)", () => {
    // Contract: renew files must not import ringback owner.
    const owner = readFileSync(
      join(ROOT, "android/app/src/main/java/com/dibay/app/call/NativePresenceLeaseRenewOwner.java"),
      "utf8",
    );
    expect(owner).not.toContain("NativeOutgoingRingbackOwner");
  });
});
