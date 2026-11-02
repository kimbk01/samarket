import { readFileSync } from "node:fs";
import { MYPAGE_IA_CATEGORIES } from "@/lib/mypage/mypage-ia";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMypageSectionLegacyHubRedirect } from "@/lib/mypage/mypage-section-legacy-redirect";
import {
  MYPAGE_HOME_ACCOUNT_HREF,
  MYPAGE_HOME_ACCOUNT_LEAVE_HREF,
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

  it("탈퇴 행은 「설정·지원」 분류 마지막 묶음에만 (계정·보안 묶음에 없음) — IA 2026-11-02", () => {
    const rowsOf = (id: string) =>
      MYPAGE_IA_CATEGORIES.find((c) => c.id === id)!.groups.flatMap((g) => g.rows).map((r) => ("href" in r ? r.href : ""));
    const settingsLast = MYPAGE_IA_CATEGORIES.find((c) => c.id === "settings")!.groups.at(-1)!.rows;
    expect(settingsLast.some((r) => "href" in r && r.href === MYPAGE_HOME_ACCOUNT_LEAVE_HREF)).toBe(true);
    expect(rowsOf("account")).not.toContain(MYPAGE_HOME_ACCOUNT_LEAVE_HREF);
    expect(rowsOf("settings").filter((h) => h === MYPAGE_HOME_ACCOUNT_LEAVE_HREF)).toHaveLength(1);
  });

  it("next.config HTTP redirects cover account shells", () => {
    const src = readFileSync(path.join(root, "next.config.js"), "utf8");
    expect(src).toContain('source: "/mypage/section/settings/address"');
    expect(src).toContain('source: "/account/delete-request"');
    expect(src).toContain('destination: "/mypage/section/settings/leave"');
  });
});
