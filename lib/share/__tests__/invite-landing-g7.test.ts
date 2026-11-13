import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isGuestPublicBrowsePath } from "@/lib/auth/guest-browse-access-policy";

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

describe("초대 랜딩 비회원 공개 (Owner G-7 2026-11-14)", () => {
  it("초대 랜딩 2종만 공개 — 그 밖 /moim·/group 은 회원 전용 그대로", () => {
    expect(isGuestPublicBrowsePath("/moim/i/" + "a".repeat(64))).toBe(true);
    expect(isGuestPublicBrowsePath("/group/AbC-_123")).toBe(true);
    expect(isGuestPublicBrowsePath("/moim")).toBe(false);
    expect(isGuestPublicBrowsePath("/moim/1234")).toBe(false);
    expect(isGuestPublicBrowsePath("/moim/i/x/y")).toBe(false);
    expect(isGuestPublicBrowsePath("/group/x/members")).toBe(false);
    expect(isGuestPublicBrowsePath("/group-chat/room-1")).toBe(false);
  });

  it("비회원 미리보기 = 이름·사진·인원·승인 여부만 (소개·멤버·대화 없음)", () => {
    const src = read("lib/share/invite-landing-preview.server.ts");
    expect(src).toContain('.select("name, cover_image_url, member_count, join_mode, status, platform_state")');
    expect(src).not.toMatch(/\bintro\b|host_user_id|created_by/);
    expect(src).not.toContain("r.preview.summary");
    const card = read("components/share/InviteLandingGuestCard.tsx");
    expect(card).toContain("share_invite_login_cta");
    expect(card).not.toMatch(/summary|intro/);
  });

  it("가입은 로그인 후 기존 화면으로 — 비회원 화면에 가입 API 호출 없음 · 로그인 후 이 주소로 복귀", () => {
    for (const rel of ["app/(main)/moim/i/[token]/page.tsx", "app/(main)/group/[token]/page.tsx"]) {
      const src = read(rel);
      expect(src, rel).toContain("getOptionalAuthenticatedUserId");
      expect(src, rel).toContain("buildLoginPath(");
      expect(src, rel).not.toMatch(/\/api\/[^"']*join/);
    }
    expect(read("components/share/InviteLandingGuestCard.tsx")).not.toContain("/api/");
  });

  it("초대 링크 미리보기는 검색 제외", () => {
    const src = read("lib/share/invite-landing-metadata.server.ts");
    expect(src).toContain("index: false");
  });
});
