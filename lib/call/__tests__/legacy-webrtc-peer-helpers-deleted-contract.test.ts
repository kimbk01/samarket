import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const DELETED_PATHS = [
  "lib/call/createPeerConnection.ts",
  "lib/call/webrtc-configuration.ts",
] as const;

const DELETED_SYMBOLS = [
  "createMessengerPeerConnection",
  "buildMessengerRtcConfiguration",
  "applyVideoSenderDegradationPreference",
] as const;

const SKIP_DIR = new Set([
  ".git",
  ".next",
  ".qa-logs",
  ".worktrees",
  "node_modules",
  "android",
  "ios",
  "dist",
  "coverage",
]);

function collectSourceFiles(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIR.has(name)) continue;
    const abs = join(dir, name);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      collectSourceFiles(abs, out);
      continue;
    }
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(name)) continue;
    out.push(abs);
  }
}

describe("legacy WebRTC peer helpers deleted (Fix 5)", () => {
  it("deleted files stay gone", () => {
    for (const rel of DELETED_PATHS) {
      expect(existsSync(join(root, rel)), rel).toBe(false);
    }
  });

  it("lib/call barrel does not re-export deleted modules or symbols", () => {
    const barrel = read("lib/call/index.ts");
    expect(barrel).not.toContain("./createPeerConnection");
    expect(barrel).not.toContain("./webrtc-configuration");
    for (const sym of DELETED_SYMBOLS) {
      expect(barrel).not.toContain(sym);
    }
    expect(barrel).toContain("./ice-servers");
  });

  it("product tree has no import path or symbol reintroduction", () => {
    const files: string[] = [];
    collectSourceFiles(root, files);
    const needle =
      /createPeerConnection|webrtc-configuration|createMessengerPeerConnection|buildMessengerRtcConfiguration|applyVideoSenderDegradationPreference/;
    const hits: string[] = [];
    for (const abs of files) {
      const rel = relative(root, abs).replace(/\\/g, "/");
      if (rel.includes("__tests__/legacy-webrtc-peer-helpers-deleted-contract")) continue;
      const src = readFileSync(abs, "utf8");
      if (needle.test(src)) hits.push(rel);
    }
    expect(hits).toEqual([]);
  });

  it("keeps ice-servers consumer path intact", () => {
    expect(existsSync(join(root, "lib/call/ice-servers.ts"))).toBe(true);
    const auth = read("lib/auth/invalidate-auth-exit-client-caches.ts");
    expect(auth).toContain("@/lib/call/ice-servers");
    expect(auth).toContain("invalidateMessengerIceServerCache");
  });
});
