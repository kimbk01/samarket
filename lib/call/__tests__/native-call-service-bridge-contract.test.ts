import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(process.cwd());

const METHODS = ["prepareAccept", "startCall", "endCall", "getActiveCallId", "heartbeat"] as const;
const OUTGOING_METHODS = ["startNativeOutgoingEstablishment", "isNativeEstablishmentOwned"] as const;

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

describe("NativeCallService bridge contract", () => {
  it("TS plugin surface exposes five methods", () => {
    const ts = read("lib/call/native/native-call-service.ts");
    for (const method of METHODS) {
      expect(ts).toContain(method);
    }
    for (const method of OUTGOING_METHODS) {
      expect(ts).toContain(method);
    }
    expect(ts).toContain("getActiveCall");
  });

  it("Android plugin implements five PluginMethods", () => {
    const java = read("android/app/src/main/java/com/dibay/app/call/NativeCallServicePlugin.java");
    for (const method of METHODS) {
      expect(java).toContain(`public void ${method}(`);
    }
    for (const method of OUTGOING_METHODS) {
      expect(java).toContain(`public void ${method}(`);
    }
  });

  it("native outgoing bridge exposes establishment wrappers", () => {
    const bridge = read("lib/call/native/native-outgoing-bridge.ts");
    expect(bridge).toContain("startNativeOutgoingEstablishment");
    expect(bridge).toContain("isNativeEstablishmentOwned");
    expect(bridge).toContain('resolveCapacitorShellPlatform() === "android"');
  });

  it("iOS plugin registers five bridged methods", () => {
    const swift = read("ios/App/App/Plugins/NativeCallServicePlugin.swift");
    for (const method of METHODS) {
      expect(swift).toContain(`CAPPluginMethod(name: "${method}"`);
    }
  });

  it("Android plugin publishes O3 native connected event and snapshot fgsOwner", () => {
    const java = read("android/app/src/main/java/com/dibay/app/call/NativeCallServicePlugin.java");
    expect(java).toContain('EVENT_NATIVE_CALL_CONNECTED = "nativeCallConnected"');
    expect(java).toContain("publishNativeConnected");
    expect(java).toContain("fgsOwner");
    expect(java).toContain("isNativeRuntimeConnected");
  });

  it("TS exposes native connected payload and event name", () => {
    const ts = read("lib/call/native/native-call-service.ts");
    expect(ts).toContain("NATIVE_CALL_CONNECTED_EVENT");
    expect(ts).toContain("NativeCallConnectedPayload");
    expect(ts).toContain("fgsOwner");
    const sync = read("lib/call/native/native-connected-sync.ts");
    expect(sync).toContain("native_connected_received");
    expect(sync).toContain("native_connected_store_hydrate");
    expect(sync).toContain("startNativeConnectedSync");
  });
});
