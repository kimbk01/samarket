import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { APP_MOBILE_LAYOUT_MAX_PX } from "@/lib/ui/app-viewport-layout-breakpoints";
import {
  MYPAGE_DESKTOP_MIN_PX,
  MYPAGE_HOME_MENU_DESKTOP_CLASS,
  MYPAGE_HOME_MENU_MOBILE_CLASS,
  MYPAGE_HOME_MENU_TABLET_ADMIN_SPAN_CLASS,
  MYPAGE_HOME_MENU_TABLET_CLASS,
  MYPAGE_MOBILE_MAX_PX,
  mypageHubBreakpointAt,
} from "@/lib/ui/mypage-responsive-breakpoints";

describe("mypage-responsive-breakpoints (Slice 9 Phase 1)", () => {
  it("keeps locked 767 / 1025 contract", () => {
    expect(MYPAGE_MOBILE_MAX_PX).toBe(767);
    expect(MYPAGE_MOBILE_MAX_PX).toBe(APP_MOBILE_LAYOUT_MAX_PX);
    expect(MYPAGE_DESKTOP_MIN_PX).toBe(1025);
    expect(MYPAGE_HOME_MENU_TABLET_CLASS).toContain("max-[1025px]");
    expect(MYPAGE_HOME_MENU_DESKTOP_CLASS).toContain("min-[1025px]");
    expect(MYPAGE_HOME_MENU_MOBILE_CLASS).toContain("md:hidden");
    expect(MYPAGE_HOME_MENU_TABLET_ADMIN_SPAN_CLASS).toContain("col-span-2");
  });

  it("classifies viewport widths without visual-band change", () => {
    expect(mypageHubBreakpointAt(390)).toBe("mobile");
    expect(mypageHubBreakpointAt(767)).toBe("mobile");
    expect(mypageHubBreakpointAt(768)).toBe("tablet");
    expect(mypageHubBreakpointAt(1024)).toBe("tablet");
    expect(mypageHubBreakpointAt(1025)).toBe("desktop");
    expect(mypageHubBreakpointAt(1280)).toBe("desktop");
  });

  it("MyPageHomeDashboard uses SSOT class exports", () => {
    const src = readFileSync(
      path.resolve(__dirname, "../../../components/mypage/MyPageHomeDashboard.tsx"),
      "utf8",
    );
    expect(src).toContain("MYPAGE_HOME_MENU_MOBILE_CLASS");
    expect(src).toContain("MYPAGE_HOME_MENU_TABLET_CLASS");
    expect(src).toContain("MYPAGE_HOME_MENU_DESKTOP_CLASS");
    expect(src).not.toMatch(/md:max-\[1025px\]/);
    expect(src).not.toMatch(/min-\[1025px\]/);
  });
});
