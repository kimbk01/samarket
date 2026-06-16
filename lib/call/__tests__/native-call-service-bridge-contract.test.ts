import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(process.cwd());

const METHODS = ["prepareAccept", "startCall", "endCall", "getActiveCallId", "heartbeat"] as const;

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

describe("NativeCallService bridge contract", () => {
  it("TS plugin surface exposes five methods", () => {
    const ts = read("lib/call/native/native-call-service.ts");
    for (const method of METHODS) {
      expect(ts).toContain(method);
    }
    expect(ts).toContain("getActiveCall");
  });

  it("Android plugin implements five PluginMethods", () => {
    const java = read("android/app/src/main/java/com/dibay/app/call/NativeCallServicePlugin.java");
    for (const method of METHODS) {
      expect(java).toContain(`public void ${method}(`);
    }
  });

  it("iOS plugin registers five bridged methods", () => {
    const swift = read("ios/App/App/Plugins/NativeCallServicePlugin.swift");
    for (const method of METHODS) {
      expect(swift).toContain(`CAPPluginMethod(name: "${method}"`);
    }
  });
});
