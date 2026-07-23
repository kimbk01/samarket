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

  it("prefetch seeds only on cache miss (no always-revalidate)", () => {
    const src = read(
      "components/community-messenger/domain-shell-canary/domain-list-canary-hub-prefetch.ts"
    );
    expect(src).toContain("stabilizeTradeListDto");
    expect(src).toContain("stabilizeSoCustomerListDto");
    expect(src).toMatch(/if \(peekDomainTradeListCanaryCache\(uid\)\) return Promise\.resolve\(\)/);
    expect(src).toMatch(
      /if \(peekDomainStoreOrderCustomerListCanaryCache\(uid\)\) return Promise\.resolve\(\)/
    );
  });

  it("room→list: hydrated memory skips all refresh; Domain Gate skips fetch when cache present", () => {
    const home = read("lib/community-messenger/home/use-community-messenger-home-bootstrap.ts");
    expect(home).toContain("Telegram list authority");
    expect(home).not.toMatch(/await refreshRef\.current\(true\)/);
    expect(home).not.toMatch(/messenger:stale-resume-silent/);
    const tradeGate = read(
      "components/community-messenger/domain-shell-canary/DomainTradeListCanaryGate.tsx"
    );
    expect(tradeGate).toContain("peekDomainTradeListCanaryCache(syncUid)");
    expect(tradeGate).not.toContain("isDomainTradeListCanaryCacheFresh");
    const soGate = read(
      "components/community-messenger/domain-shell-canary/DomainStoreOrderCustomerListCanaryGate.tsx"
    );
    expect(soGate).toContain("peekDomainStoreOrderCustomerListCanaryCache(syncUid)");
    expect(soGate).not.toContain("isDomainStoreOrderCustomerListCanaryCacheFresh");
  });
});
