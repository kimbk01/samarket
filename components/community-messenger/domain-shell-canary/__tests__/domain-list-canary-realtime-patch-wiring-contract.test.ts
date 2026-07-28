import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Domain List canary realtime patch — wiring contract (2026-07-23)", () => {
  it("trade/SO tip canary routes through Room Activity Projection (not DomainHost direct dual-write)", () => {
    const host = read("components/messenger/DomainRoomStateRealtimeHost.tsx");
    const projection = read("lib/community-messenger/home/project-room-activity-to-home-list.ts");
    expect(host).toContain("projectRoomActivityToHomeList");
    expect(host).toContain("applyDomainListCanaryReadPatchByRoomId");
    expect(projection).toContain("applyDomainTradeListRealtimeMessagePatch");
    expect(projection).toContain("applyDomainStoreOrderListRealtimeMessagePatch");
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
