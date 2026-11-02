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
    // 매장 행은 「주문·배달」 분류 화면 — 같은 서버 시드를 받아 첫 그림에 권한별 행 (분류 IA 2026-11-02)
    const sectionSrc = fs.readFileSync(path.join(process.cwd(), "app/(main)/mypage/section/[section]/page.tsx"), "utf8");
    expect(sectionSrc).toMatch(/loadMypageOwnerStoreGateSeedServer/);
    const catSrc = fs.readFileSync(path.join(process.cwd(), "components/mypage/myinfo/MyInfoIaCategoryScreen.tsx"), "utf8");
    expect(catSrc).toMatch(/<MyInfoStoreOwnerEntryRow[\s\S]*ownerStoreGate=\{ownerStoreGateSeed\?\.ownerStoreGate\}/);
  });
});
