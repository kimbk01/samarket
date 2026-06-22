import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

function listTsFilesRecursive(dir: string): string[] {
  const abs = join(ROOT, dir);
  let entries: string[] = [];
  for (const name of readdirSync(abs)) {
    const path = join(abs, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      entries = entries.concat(listTsFilesRecursive(join(dir, name)));
      continue;
    }
    if (name.endsWith(".ts") || name.endsWith(".tsx")) {
      entries.push(join(dir, name));
    }
  }
  return entries;
}

const CALL_ENGINE_IMPORT =
  /from\s+["']@\/lib\/community-messenger\/call-engine(?:\/|["'])|require\(["']@\/lib\/community-messenger\/call-engine/;

const CALL_V3_IMPORT =
  /from\s+["']@\/lib\/community-messenger\/call-v3(?:\/|["'])|require\(["']@\/lib\/community-messenger\/call-v3/;

describe("call-v3 import isolation contract", () => {
  it("call-v3 modules do not import call-engine", () => {
    const v3Files = listTsFilesRecursive("lib/community-messenger/call-v3");
    expect(v3Files.length).toBeGreaterThan(0);
    for (const file of v3Files) {
      const src = read(file);
      expect(src, `${file} must not import call-engine`).not.toMatch(CALL_ENGINE_IMPORT);
    }
  });

  it("call-engine modules do not import call-v3", () => {
    const engineFiles = listTsFilesRecursive("lib/community-messenger/call-engine");
    expect(engineFiles.length).toBeGreaterThan(0);
    for (const file of engineFiles) {
      const src = read(file);
      expect(src, `${file} must not import call-v3`).not.toMatch(CALL_V3_IMPORT);
    }
  });

  it("CallIncomingChrome gates legacy hosts behind V3 flag", () => {
    const chrome = read("components/layout/providers/CallIncomingChrome.tsx");
    expect(chrome).toContain("isDibayCallV3SafeLaneEnabled");
    expect(chrome).toContain("CallV3Provider");
    expect(chrome).toContain("CallV3IncomingBanner");
    expect(chrome).toContain("LegacyCallIncomingChrome");
  });

  it("legacy call route hosts no-op when V3 flag is enabled", () => {
    const fcm = read("components/layout/providers/DibayFcmCallRouteHost.tsx");
    const voip = read("lib/push/native/dibay-voip-call-bridge.ts");
    const recovery = read("components/layout/providers/CallActiveSessionRecoveryHost.tsx");
    for (const src of [fcm, voip, recovery]) {
      expect(src).toContain("isDibayCallV3SafeLaneEnabled");
    }
  });

  it("V3 route lives under app/(main)/community-messenger/calls-v3", () => {
    const page = read("app/(main)/community-messenger/calls-v3/[callId]/page.tsx");
    expect(page).toContain("CallV3Screen");
  });

  it("launchOutgoingDirectCall branches to V3 when flag enabled", () => {
    const nav = read("lib/community-messenger/call-session-navigation-seed.ts");
    expect(nav).toContain("isDibayCallV3SafeLaneEnabled");
    expect(nav).toContain("callV3LaunchOutgoingDirectCall");
  });

  it("flag ON mounts V3 provider instead of legacy incoming overlay", () => {
    const chrome = read("components/layout/providers/CallIncomingChrome.tsx");
    expect(chrome).toContain("CallV3IncomingChrome");
    expect(chrome).toContain("LegacyCallIncomingChrome");
    expect(chrome).not.toMatch(/isDibayCallV3SafeLaneEnabled\(\)[\s\S]{0,200}IncomingCallOverlay/);
  });
});
