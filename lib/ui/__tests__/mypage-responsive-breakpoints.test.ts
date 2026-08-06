import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { APP_MOBILE_LAYOUT_MAX_PX } from "@/lib/ui/app-viewport-layout-breakpoints";
import {
  MYPAGE_DESKTOP_MIN_PX,
  MYPAGE_HOME_MENU_DESKTOP_CLASS,
  MYPAGE_HOME_MENU_FLOW_CLASS,
  MYPAGE_HOME_MENU_MOBILE_CLASS,
  MYPAGE_HOME_MENU_TABLET_CLASS,
  MYPAGE_MOBILE_MAX_PX,
  mypageHubBreakpointAt,
} from "@/lib/ui/mypage-responsive-breakpoints";

describe("mypage-responsive-breakpoints (Legacy IA 1-col)", () => {
  it("locks 767 / 1200 bands with single-column flow classes", () => {
    expect(MYPAGE_MOBILE_MAX_PX).toBe(767);
    expect(MYPAGE_MOBILE_MAX_PX).toBe(APP_MOBILE_LAYOUT_MAX_PX);
    expect(MYPAGE_DESKTOP_MIN_PX).toBe(1200);
    expect(MYPAGE_HOME_MENU_FLOW_CLASS).toContain("flex-col");
    expect(MYPAGE_HOME_MENU_MOBILE_CLASS).toBe(MYPAGE_HOME_MENU_FLOW_CLASS);
    expect(MYPAGE_HOME_MENU_TABLET_CLASS).toBe(MYPAGE_HOME_MENU_FLOW_CLASS);
    expect(MYPAGE_HOME_MENU_DESKTOP_CLASS).toBe(MYPAGE_HOME_MENU_FLOW_CLASS);
    expect(MYPAGE_HOME_MENU_FLOW_CLASS).not.toMatch(/grid-cols-[23]/);
  });

  it("classifies viewport widths", () => {
    expect(mypageHubBreakpointAt(390)).toBe("mobile");
    expect(mypageHubBreakpointAt(767)).toBe("mobile");
    expect(mypageHubBreakpointAt(768)).toBe("tablet");
    expect(mypageHubBreakpointAt(1199)).toBe("tablet");
    expect(mypageHubBreakpointAt(1200)).toBe("desktop");
    expect(mypageHubBreakpointAt(1280)).toBe("desktop");
  });

  it("MyPageHomeDashboard uses single flow SSOT (no multi-column catalog)", () => {
    const src = readFileSync(
      path.resolve(__dirname, "../../../components/mypage/MyPageHomeDashboard.tsx"),
      "utf8",
    );
    expect(src).toContain("MYPAGE_HOME_MENU_FLOW_CLASS");
    expect(src).not.toMatch(/grid-cols-2/);
    expect(src).not.toMatch(/grid-cols-3/);
    expect(src).toContain("MyInfoPolicyMenuSection");
    expect(src).toContain("MyInfoDangerMenuSection");
  });

  it("Guest dashboard kills tablet/desktop menu grids", () => {
    const src = readFileSync(
      path.resolve(__dirname, "../../../components/mypage/MyPageGuestHomeDashboard.tsx"),
      "utf8",
    );
    expect(src).toContain("MYPAGE_HOME_MENU_FLOW_CLASS");
    expect(src).not.toMatch(/grid-cols-2/);
    expect(src).not.toMatch(/grid-cols-3/);
  });
});
