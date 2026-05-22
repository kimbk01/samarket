import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");

function readRepo(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("owner admin back navigation contract", () => {
  it("mobile header uses AppBackButton with history back, not plain Link back", () => {
    const header = readRepo("components/business/owner/OwnerMobileAdminHeader.tsx");
    expect(header).toContain("AppBackButton");
    expect(header).toContain("preferHistoryBack");
    expect(header).not.toMatch(/backHref\s*\?[\s\S]*?<Link[\s\S]*?href=\{backHref\}/);
  });

  it("shell passes backIntercept to mobile header", () => {
    const shell = readRepo("components/business/admin/BusinessAdminShell.tsx");
    expect(shell).toContain("backIntercept={combinedAdminHeaderBackIntercept}");
  });

  it("desktop stack header keeps preferHistoryBack enabled on hub", () => {
    const shell = readRepo("components/business/admin/BusinessAdminShell.tsx");
    expect(shell).toContain("backPreferHistory");
    expect(shell).not.toContain("backPreferHistory={!isHub}");
  });

  it("order overlay close uses runOwnerAdminBackNavigation", () => {
    const orders = readRepo("components/business/owner/OwnerStoreOrdersView.tsx");
    expect(orders).toContain("runOwnerAdminBackNavigation");
    expect(orders).not.toMatch(/onCloseDetail[\s\S]{0,200}router\.replace/);
  });
});
