import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("hub pillar preview SSOT = Domain list", () => {
  it("MessengerChatsScreen prefetches Domain commerce lists when pillars show", () => {
    const src = read("components/community-messenger/MessengerChatsScreen.tsx");
    expect(src).toContain("prefetchDomainCommerceListsForHub");
  });

  it("MessengerPillarSummaryRow prefers Domain list peek over bootstrap-only", () => {
    const src = read("components/community-messenger/MessengerPillarSummaryRow.tsx");
    expect(src).toContain("peekDomainTradeHubListPreview");
    expect(src).toContain("peekDomainStoreOrderHubListPreview");
    expect(src).toContain('data-messenger-pillar-preview-source={useDomain ? "domain_list" : "bootstrap"}');
  });

  it("prefetch stabilizes DTO before prime (same as list)", () => {
    const src = read(
      "components/community-messenger/domain-shell-canary/domain-list-canary-hub-prefetch.ts"
    );
    expect(src).toContain("stabilizeTradeListDto");
    expect(src).toContain("stabilizeSoCustomerListDto");
    expect(src).not.toMatch(/if \(peekDomainTradeListCanaryCache\(uid\)\) return Promise\.resolve\(\)/);
  });
});
