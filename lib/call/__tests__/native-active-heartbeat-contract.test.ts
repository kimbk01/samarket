import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CALL_SERVER_HEARTBEAT_STALE_MS } from "@/lib/call/call-server-heartbeat";
import { CALL_PRESENCE_NATIVE_RENEW_INTERVAL_MS } from "@/lib/call/call-active-presence";
import { CALL_HEARTBEAT_INTERVAL_MS } from "@/lib/call/native/call-heartbeat-watchdog";
import { resolveCallSessionHeartbeatMutation } from "@/lib/community-messenger/call-session-heartbeat";

const repoRoot = process.cwd();

function readRepoFile(path: string): string {
  return readFileSync(join(repoRoot, path), "utf8");
}

describe("native active-call heartbeat contract", () => {
  it("native active heartbeat cadence is the production heartbeat cadence and stays below server stale", () => {
    expect(CALL_HEARTBEAT_INTERVAL_MS).toBe(10_000);
    expect(CALL_HEARTBEAT_INTERVAL_MS).toBeLessThan(CALL_SERVER_HEARTBEAT_STALE_MS);

    const androidOwner = readRepoFile(
      "android/app/src/main/java/com/dibay/app/call/NativeActiveCallHeartbeatOwner.java",
    );
    const iosOwner = readRepoFile("ios/App/App/Call/NativeActiveCallHeartbeatOwner.swift");
    expect(androidOwner).toContain("ACTIVE_HEARTBEAT_INTERVAL_MS = 10_000L");
    expect(iosOwner).toContain("activeHeartbeatIntervalMs: Int = 10_000");
  });

  it("native lease cadence remains the 150s shadow lease cadence", () => {
    expect(CALL_PRESENCE_NATIVE_RENEW_INTERVAL_MS).toBe(150_000);

    const androidLeaseOwner = readRepoFile(
      "android/app/src/main/java/com/dibay/app/call/NativePresenceLeaseRenewOwner.java",
    );
    const iosLeaseOwner = readRepoFile("ios/App/App/Call/NativePresenceLeaseRenewOwner.swift");
    expect(androidLeaseOwner).toContain("SHADOW_LEASE_TTL_MS = 300_000L");
    expect(androidLeaseOwner).toContain("RENEW_INTERVAL_MS = SHADOW_LEASE_TTL_MS / 2");
    expect(iosLeaseOwner).toContain("shadowLeaseTtlMs: Int = 300_000");
    expect(iosLeaseOwner).toContain("renewIntervalMs: Int = shadowLeaseTtlMs / 2");
  });

  it("active heartbeat and native lease renew write separate authorities", () => {
    expect(resolveCallSessionHeartbeatMutation("active")).toEqual({
      purpose: "active",
      writeHeartbeat: true,
      writeLease: false,
    });
    expect(resolveCallSessionHeartbeatMutation("native_lease")).toEqual({
      purpose: "native_lease",
      writeHeartbeat: false,
      writeLease: true,
    });
    expect(resolveCallSessionHeartbeatMutation()).toEqual({
      purpose: "legacy_compat",
      writeHeartbeat: true,
      writeLease: true,
    });
  });

  it("native voice/video APIs send active and lease purposes explicitly", () => {
    const androidVoiceApi = readRepoFile(
      "android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallApi.java",
    );
    const androidVideoApi = readRepoFile(
      "android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallApi.java",
    );
    const iosVoiceApi = readRepoFile("ios/App/App/Call/NativeVoiceCallApi.swift");
    const iosVideoApi = readRepoFile("ios/App/App/Call/Video/NativeVideoCallApi.swift");

    for (const source of [androidVoiceApi, androidVideoApi, iosVoiceApi, iosVideoApi]) {
      expect(source).toContain("heartbeatPurpose");
      expect(source).toContain("active");
      expect(source).toContain("native_lease");
    }
  });

  it("native voice/video runtimes start active heartbeat at connected and stop on terminal cleanup", () => {
    const runtimes = [
      readRepoFile("android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallRuntime.java"),
      readRepoFile("android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallRuntime.java"),
      readRepoFile("ios/App/App/Call/NativeVoiceCallRuntime.swift"),
      readRepoFile("ios/App/App/Call/Video/NativeVideoCallRuntime.swift"),
    ];

    for (const source of runtimes) {
      expect(source).toContain("NativeActiveCallHeartbeatOwner.start");
      expect(source).toContain("NativeActiveCallHeartbeatOwner.stop");
      expect(source).toContain("NativePresenceLeaseRenewOwner.start");
      expect(source).toContain("NativePresenceLeaseRenewOwner.stop");
    }
  });

  it("native-established call survival no longer requires the web watchdog source", () => {
    const androidOwner = readRepoFile(
      "android/app/src/main/java/com/dibay/app/call/NativeActiveCallHeartbeatOwner.java",
    );
    const iosOwner = readRepoFile("ios/App/App/Call/NativeActiveCallHeartbeatOwner.swift");
    expect(androidOwner).not.toContain("startCallHeartbeatWatchdog");
    expect(iosOwner).not.toContain("startCallHeartbeatWatchdog");
  });
});
