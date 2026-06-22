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

  it("exposes banner test id for QA", () => {
    const banner = read("components/community-messenger/call-v3/CallV3IncomingBanner.tsx");
    expect(banner).toContain('data-testid="call-v3-incoming-banner"');
  });
});
