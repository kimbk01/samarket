import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

describe("CUT6 connected/duration source contract", () => {
  it("session PATCH allows connected action", () => {
    const route = readFileSync(
      join(root, "app/api/community-messenger/calls/sessions/[sessionId]/route.ts"),
      "utf8",
    );
    expect(route).toContain('body.action !== "connected"');
  });

  it("updateCommunityMessengerCallSession handles connected + connected_at", () => {
    const service = readFileSync(join(root, "lib/community-messenger/service.ts"), "utf8");
    expect(service).toContain('action: "accept" | "reject" | "cancel" | "end" | "leave" | "missed" | "connected"');
    expect(service).toContain('input.action === "connected"');
    expect(service).toContain("connected_at: now");
    expect(service).toContain("connectedAtAuthority: true");
  });

  it("JS proposes connected without native rewrite", () => {
    const nativeSync = readFileSync(join(root, "lib/call/native/native-connected-sync.ts"), "utf8");
    const bridge = readFileSync(
      join(root, "lib/community-messenger/call-v4/call-v4-phase-bridge.ts"),
      "utf8",
    );
    expect(nativeSync).toContain("callV4PatchConnected");
    expect(bridge).toContain("callV4PatchConnected");
  });

  it("migration adds connected_at without rewriting answered_at meaning", () => {
    const mig = readFileSync(
      join(root, "supabase/migrations/20261211120000_cm_call_sessions_connected_at_cut6.sql"),
      "utf8",
    );
    expect(mig).toContain("ADD COLUMN IF NOT EXISTS connected_at");
    expect(mig).toContain("answered_at");
    expect(mig).not.toMatch(/DROP COLUMN.*answered_at/i);
  });
});
