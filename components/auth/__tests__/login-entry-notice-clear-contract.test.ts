import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 로그아웃 직후 /login 의 "로그아웃되었습니다" 안내가 다음 로그인(카카오 등) 진행 중에 남지 않는다.
 * 로그인 시작(OAuth·아이디) 시 info 안내를 먼저 지운다.
 */
const src = readFileSync(join(process.cwd(), "app/login/LoginPageClient.tsx"), "utf8");

describe("login entry notice clear on new login attempt", () => {
  it("OAuth 시작 전에 안내를 지운다", () => {
    const block = src.slice(src.indexOf("const handleOAuthLogin"), src.indexOf("const handleOpenInternalLogin"));
    expect(block.indexOf("clearEntryNotice()")).toBeGreaterThan(-1);
    expect(block.indexOf("clearEntryNotice()")).toBeLessThan(block.indexOf("startOAuthProvider(provider)"));
  });

  it("아이디 로그인 제출 전에 안내를 지운다", () => {
    expect(src).toMatch(/clearEntryNotice\(\);\s*return passwordLogin\.submit\(event\);/);
  });

  it("지우는 대상은 info 안내만 (계정 상태·오류 안내 유지)", () => {
    expect(src).toContain('prev && prev.tone === "info" ? null : prev');
  });
});
