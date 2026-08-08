import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMypageSectionLegacyHubRedirect } from "@/lib/mypage/mypage-section-legacy-redirect";
import {
  MYPAGE_HOME_ACCOUNT_HREF,
  MYPAGE_HOME_ADDRESSES_HREF,
} from "@/lib/mypage/mypage-home-hub-links";

const root = path.resolve(__dirname, "../../..");

describe("Slice6 Account route MERGE", () => {
  it("section address and account-info map to hubs", () => {
    expect(resolveMypageSectionLegacyHubRedirect("settings", "address")).toBe(
      MYPAGE_HOME_ADDRESSES_HREF,
    );
    expect(resolveMypageSectionLegacyHubRedirect("store", "address")).toBe(
      MYPAGE_HOME_ADDRESSES_HREF,
    );
    expect(resolveMypageSectionLegacyHubRedirect("account", "account-info")).toBe(
      MYPAGE_HOME_ACCOUNT_HREF,
    );
    /** leave is the canonical section route — must not self-redirect (React #310). */
    expect(resolveMypageSectionLegacyHubRedirect("settings", "leave")).toBeNull();
  });

  it("home Danger block includes leave; Account/Service do not", () => {
    const src = readFileSync(path.join(root, "lib/mypage/mypage-home-menu-config.ts"), "utf8");
    const accountIdx = src.indexOf("export const MYPAGE_HOME_ACCOUNT_ITEMS");
    const dangerIdx = src.indexOf("export const MYPAGE_HOME_DANGER_ITEMS");
    const serviceIdx = src.indexOf("export const MYPAGE_HOME_SERVICE_ITEMS");
    const supportIdx = src.indexOf("export const MYPAGE_HOME_SUPPORT_ITEMS");
    expect(accountIdx).toBeGreaterThan(-1);
    expect(dangerIdx).toBeGreaterThan(accountIdx);
    expect(serviceIdx).toBeGreaterThan(dangerIdx);
    const accountBlock = src.slice(accountIdx, dangerIdx);
    const dangerBlock = src.slice(dangerIdx, serviceIdx);
    const serviceBlock = src.slice(serviceIdx, supportIdx);
    expect(dangerBlock).toContain("MYPAGE_HOME_ACCOUNT_LEAVE_HREF");
    expect(accountBlock).not.toContain("MYPAGE_HOME_ACCOUNT_LEAVE_HREF");
    expect(serviceBlock).not.toContain("settings/leave");
  });

  it("next.config HTTP redirects cover account shells", () => {
    const src = readFileSync(path.join(root, "next.config.js"), "utf8");
    expect(src).toContain('source: "/mypage/section/settings/address"');
    expect(src).toContain('source: "/account/delete-request"');
    expect(src).toContain('destination: "/mypage/section/settings/leave"');
  });
});
