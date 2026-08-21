import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("mypage owner store gate seed authority", () => {
  it("mypage page loads gate seed server-side (no client me-stores list)", () => {
    const pageSrc = fs.readFileSync(
      path.join(process.cwd(), "app/(main)/mypage/page.tsx"),
      "utf8",
    );
    const seedSrc = fs.readFileSync(
      path.join(process.cwd(), "lib/my/load-mypage-owner-store-gate-seed.ts"),
      "utf8",
    );
    const dashSrc = fs.readFileSync(
      path.join(process.cwd(), "components/mypage/MyPageHomeDashboard.tsx"),
      "utf8",
    );
    expect(pageSrc).toMatch(/loadMypageOwnerStoreGateSeedServer/);
    expect(seedSrc).toMatch(/getOwnerStoreGateState/);
    expect(seedSrc).not.toMatch(/loadMeStoresListForUser/);
    expect(seedSrc).not.toMatch(/fetchMeStoresListDeduped/);
    expect(seedSrc).not.toMatch(/fetch\s*\(\s*[`'"]\/api\/me\/stores/);
    expect(dashSrc).toMatch(/ownerStoreGateSeed/);
    expect(dashSrc).toMatch(/MyInfoStoreMenuSection/);
  });
});
