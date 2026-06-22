import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("call-v3-incoming-banner", () => {
  it("renders only for incoming_ringing incoming direction", () => {
    const banner = read("components/community-messenger/call-v3/CallV3IncomingBanner.tsx");
    expect(banner).toContain('phase !== "incoming_ringing"');
    expect(banner).toContain('identity.direction !== "incoming"');
    expect(banner).toContain("call-v3-incoming-banner");
    expect(banner).toContain("callV3Accept");
    expect(banner).toContain("callV3Reject");
    expect(banner).toContain("incoming_banner_show");
  });

  it("exposes accept and reject buttons for QA", () => {
    const banner = read("components/community-messenger/call-v3/CallV3IncomingBanner.tsx");
    expect(banner).toContain('data-testid="call-v3-incoming-banner"');
    expect(banner).toContain('data-testid="call-v3-incoming-accept"');
    expect(banner).toContain('data-testid="call-v3-incoming-reject"');
    expect(banner).toContain("grid-cols-2");
  });
});

describe("call-v3-controls-ui", () => {
  it("shows cancel on outgoing ringing and end on joining/connected", () => {
    const controls = read("components/community-messenger/call-v3/CallV3Controls.tsx");
    expect(controls).toContain('phase === "outgoing_ringing"');
    expect(controls).toContain('phase === "creating"');
    expect(controls).toContain('phase === "joining"');
    expect(controls).toContain('phase === "connected"');
    expect(controls).toContain("callV3Cancel");
    expect(controls).toContain("callV3End");
    expect(controls).toContain('data-testid="call-v3-cancel-button"');
    expect(controls).toContain('data-testid="call-v3-end-button"');
  });
});

describe("call-v3-screen-ui", () => {
  it("mounts controls for outgoing dialing, joining, and connected", () => {
    const screen = read("components/community-messenger/call-v3/CallV3Screen.tsx");
    expect(screen).toContain('phase === "connected"');
    expect(screen).toContain('phase === "joining"');
    expect(screen).toContain("isOutgoingDialing");
    expect(screen).toContain("CallV3Controls");
    expect(screen).toContain("cm_ui_call_log_voice_outgoing");
    expect(screen).toContain("cm_ui_call_status_outgoing_dialing");
  });
});
