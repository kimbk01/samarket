import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Domain List canary realtime patch — wiring contract (2026-07-23)", () => {
  it("DomainRoomStateRealtimeHost patches both list caches from cm.room.incoming_message", () => {
    const src = read("components/messenger/DomainRoomStateRealtimeHost.tsx");
    expect(src).toContain("applyDomainTradeListRealtimeMessagePatch");
    expect(src).toContain("applyDomainStoreOrderListRealtimeMessagePatch");
    expect(src).toContain("applyDomainListCanaryReadPatchByRoomId");
  });

  it("DomainTradeListCanaryGate subscribes to live patches instead of staying fetch-once", () => {
    const src = read(
      "components/community-messenger/domain-shell-canary/DomainTradeListCanaryGate.tsx"
    );
    expect(src).toContain("subscribeDomainListCanaryPatch(\"trade\"");
  });

  it("DomainStoreOrderCustomerListCanaryGate subscribes to live patches instead of staying fetch-once", () => {
    const src = read(
      "components/community-messenger/domain-shell-canary/DomainStoreOrderCustomerListCanaryGate.tsx"
    );
    expect(src).toContain("subscribeDomainListCanaryPatch(\"store_order\"");
  });
});
