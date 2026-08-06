import { describe, expect, it } from "vitest";
import {
  MYPAGE_DOMAIN_ROOT_PATH,
  MYPAGE_MOTION_MS,
  isMypageDomainHubPath,
  isMypageLogoutDangerVariant,
} from "@/lib/mypage/mypage-authority-contract";

describe("mypage-authority-contract (Slice 2)", () => {
  it("domain root is /mypage", () => {
    expect(MYPAGE_DOMAIN_ROOT_PATH).toBe("/mypage");
    expect(isMypageDomainHubPath("/mypage")).toBe(true);
    expect(isMypageDomainHubPath("/mypage/")).toBe(true);
    expect(isMypageDomainHubPath("/mypage/settings")).toBe(false);
  });

  it("Danger logout variants only", () => {
    expect(isMypageLogoutDangerVariant("danger_button")).toBe(true);
    expect(isMypageLogoutDangerVariant("menu_row")).toBe(true);
    expect(isMypageLogoutDangerVariant("text_link")).toBe(false);
  });

  it("motion ms match Architecture LOCK class", () => {
    expect(MYPAGE_MOTION_MS.push).toBe(300);
    expect(MYPAGE_MOTION_MS.back).toBe(300);
    expect(MYPAGE_MOTION_MS.modal).toBe(200);
  });
});
