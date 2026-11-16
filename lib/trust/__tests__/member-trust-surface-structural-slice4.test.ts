/**
 * Slice 4 structural contract — Member trust surfaces share SSOT helper.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../..");

describe("Slice4 trust surface structural", () => {
  it("trust page and home manner row both use buildMemberTrustSurface", () => {
    // S02: 페이지는 MypageTrustContent 만 렌더 — 계약 검사는 실제 화면 컴포넌트 기준
    const trustRoute = readFileSync(path.join(root, "app/(main)/mypage/trust/page.tsx"), "utf8");
    expect(trustRoute).toContain("MypageTrustContent");
    const trustPage = readFileSync(
      path.join(root, "components/mypage/trust/MypageTrustContent.tsx"),
      "utf8",
    );
    const home = readFileSync(
      path.join(root, "components/mypage/home/MypageProfileSummary.tsx"),
      "utf8",
    );
    expect(trustPage).toContain("buildMemberTrustSurface");
    expect(trustPage).toContain("/api/me/profile?fresh=1");
    expect(trustPage).not.toMatch(/text-signature/);
    expect(home).toContain("buildMemberTrustSurface");
    expect(home).toContain("mypage-profile-manner-row");
  });

  it("CREW REP display has no battery icon or % and no admin free-text label", () => {
    const crew = readFileSync(path.join(root, "lib/trust/crew-rep.ts"), "utf8");
    const ds = readFileSync(path.join(root, "lib/ui/design-system-hard-lock.ts"), "utf8");
    expect(ds).toContain('primaryHex: "#0B421A"');
    expect(crew).toContain("#0B421A");
    const surfaces = [
      "components/trust/CrewRep.tsx",
      "components/mypage/trust/MypageTrustContent.tsx",
      "components/mypage/home/MypageProfileSummary.tsx",
      "components/post/PostDetailView.tsx",
      "components/mypage/tabs/AccountTab.tsx",
      "components/community-messenger/room/phase2/ChatRoomMoreMenu.tsx",
      "components/community-messenger/room/phase2/StoreOrderDeliveryMessengerHeaderBlock.tsx",
    ].map((f) => readFileSync(path.join(root, f), "utf8"));
    for (const src of surfaces) {
      expect(src).not.toMatch(/MannerBattery(Icon|Display|Inline)|TrustSummaryCard|speedDisplayLabel/);
      expect(src).not.toMatch(/°C|배터리/);
    }
  });
});
