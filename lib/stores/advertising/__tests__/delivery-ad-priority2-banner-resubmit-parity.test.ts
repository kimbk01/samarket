/**
 * Priority 2 — Banner CHANGES_REQUESTED must post canonical resubmit (caller parity).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const bannerCreateSrc = () =>
  readFileSync(
    join(process.cwd(), "components/business/owner/ads/OwnerBannerCreateView.tsx"),
    "utf8"
  );

const sponsoredCreateSrc = () =>
  readFileSync(
    join(process.cwd(), "components/business/owner/ads/OwnerStoreSponsoredCreateView.tsx"),
    "utf8"
  );

const actionsRouteSrc = () =>
  readFileSync(
    join(
      process.cwd(),
      "app/api/me/stores/[storeId]/delivery-ads/[campaignId]/actions/route.ts"
    ),
    "utf8"
  );

describe("Priority 2 Banner resubmit caller parity", () => {
  it("T1/T2/T3 — Banner submit uses submit or resubmit from lifecycleStatus; productKind stays banner", () => {
    const src = bannerCreateSrc();
    expect(src).toContain(
      '/delivery-ads/${encodeURIComponent(draft.id)}/actions'
    );
    expect(src).toMatch(
      /action:\s*\n?\s*draft\.lifecycleStatus === "CHANGES_REQUESTED" \? "resubmit" : "submit"/
    );
    expect(src).toContain('productKind: "banner"');
    /** Hard-coded always-submit removed. */
    expect(src).not.toMatch(
      /JSON\.stringify\(\{\s*action:\s*"submit",\s*productKind:\s*"banner"\s*\}\)/
    );
  });

  it("T4 — same existing owner delivery-ads actions route is used", () => {
    const src = bannerCreateSrc();
    expect(src).toMatch(
      /\/api\/me\/stores\/\$\{encodeURIComponent\(draft\.storeId\)\}\/delivery-ads\/\$\{encodeURIComponent\(draft\.id\)\}\/actions/
    );
    const route = actionsRouteSrc();
    expect(route).toContain('"resubmit"');
    expect(route).toContain('"submit"');
    expect(route).toContain('productKind === "banner"');
  });

  it("T5 — no new lifecycle action introduced in Banner caller", () => {
    const src = bannerCreateSrc();
    const actionMatches = src.match(/action:\s*["'](\w+)["']/g) ?? [];
    for (const m of actionMatches) {
      expect(m).toMatch(/action:\s*["'](submit|resubmit|pause|resume|end|delete)["']/);
    }
    expect(src).not.toContain("reapply");
    expect(src).not.toContain("force_submit");
  });

  it("T6 — Store Sponsored resubmit parity remains untouched", () => {
    const src = sponsoredCreateSrc();
    expect(src).toContain(
      'action: saved.lifecycleStatus === "CHANGES_REQUESTED" ? "resubmit" : "submit"'
    );
  });

  it("T7 — REJECTED does not map to resubmit; only CHANGES_REQUESTED does", () => {
    const src = bannerCreateSrc();
    expect(src).toContain('=== "CHANGES_REQUESTED" ? "resubmit"');
    expect(src).not.toMatch(/REJECTED[^;\n]{0,80}resubmit/);
    expect(src).toContain(
      'row.lifecycleStatus !== "DRAFT" && row.lifecycleStatus !== "CHANGES_REQUESTED"'
    );
  });
});
