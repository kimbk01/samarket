import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { IMAGE_REMOTE_PATTERNS, resolveProfileImageSrc } from "@/lib/profile/resolve-profile-image-src";
import { resolveUserAvatarImageSrc } from "@/lib/profile/user-avatar-display";
import { SAMARKET_DEFAULT_AVATAR_URL } from "@/lib/profile/default-avatar";
import {
  verifyRemoteProfileImageForSave,
  withVerifiedOAuthAvatar,
} from "@/lib/profile/verify-remote-profile-image.server";

/** real-screen-redesign §14 — 프로필 사진 표시(문자열만) · 저장 시 실검증 */

const KAKAO_HTTP = "http://k.kakaocdn.net/dn/abc/img_640x640.jpg";
const KAKAO_HTTPS = "https://k.kakaocdn.net/dn/abc/img_640x640.jpg";
const KAKAO_DEFAULT = "http://img1.kakaocdn.net/thumb/R110x110.q70/?fname=http://t1.kakaocdn.net/account_images/default_profile.jpeg";
const GOOGLE = "https://lh3.googleusercontent.com/a/photo=s96-c";

describe("resolveProfileImageSrc (네트워크 0)", () => {
  it("https + 허용 출처 → 그대로", () => {
    expect(resolveProfileImageSrc(GOOGLE)).toBe(GOOGLE);
    expect(resolveProfileImageSrc(KAKAO_HTTPS)).toBe(KAKAO_HTTPS);
    const supa = "https://abc.supabase.co/storage/v1/object/public/post-images/u1/profile/a.jpg";
    expect(resolveProfileImageSrc(supa)).toBe(supa);
  });

  it("http + 허용 출처 → https 로 승격", () => {
    expect(resolveProfileImageSrc(KAKAO_HTTP)).toBe(KAKAO_HTTPS);
  });

  it("카카오 기본 이미지 · 허용 밖 출처 · 빈 값 · DIBAY 기본 → null (기본 아바타)", () => {
    expect(resolveProfileImageSrc(KAKAO_DEFAULT)).toBeNull();
    expect(resolveProfileImageSrc("https://evil.example.com/a.jpg")).toBeNull();
    expect(resolveProfileImageSrc("http://evil.example.com/a.jpg")).toBeNull();
    expect(resolveProfileImageSrc("https://abc.supabase.co/rest/v1/profiles")).toBeNull();
    expect(resolveProfileImageSrc("")).toBeNull();
    expect(resolveProfileImageSrc(null)).toBeNull();
    expect(resolveProfileImageSrc(SAMARKET_DEFAULT_AVATAR_URL)).toBeNull();
    expect(resolveProfileImageSrc("javascript:alert(1)")).toBeNull();
  });

  it("업로드 미리보기(blob/data)·같은 사이트 경로 → 그대로", () => {
    expect(resolveProfileImageSrc("blob:https://samarket.vercel.app/x")).toBe("blob:https://samarket.vercel.app/x");
    expect(resolveProfileImageSrc("/images/a.png")).toBe("/images/a.png");
  });

  it("공용 아바타 src 도 같은 판정 (홈 카드 = 수정 시트 = 메신저)", () => {
    expect(resolveUserAvatarImageSrc(KAKAO_HTTP)).toBe(KAKAO_HTTPS);
    expect(resolveUserAvatarImageSrc(KAKAO_DEFAULT)).toBeNull();
  });

  it("허용 목록은 next.config.js 와 같은 파일 · 원격 http 없음", () => {
    const cfg = readFileSync(path.join(process.cwd(), "next.config.js"), "utf8");
    expect(cfg).toContain('require("./config/image-remote-patterns.json")');
    const remoteHttp = IMAGE_REMOTE_PATTERNS.filter(
      (p) => p.protocol === "http" && p.hostname !== "127.0.0.1" && p.hostname !== "localhost",
    );
    expect(remoteHttp).toEqual([]);
  });

  it("홈 카드·시트가 같은 아바타 컴포넌트 사용", () => {
    const home = readFileSync(path.join(process.cwd(), "components/mypage/home/MypageProfileSummary.tsx"), "utf8");
    const field = readFileSync(path.join(process.cwd(), "components/my/edit/ProfileImageField.tsx"), "utf8");
    expect(home).toMatch(/<SamarketUserAvatar\b/);
    expect(field).toMatch(/<SamarketUserAvatar\b/);
  });
});

function res(status: number, contentType: string) {
  return new Response("x", { status, headers: { "content-type": contentType } });
}

describe("verifyRemoteProfileImageForSave (저장 시에만 1회 요청)", () => {
  it("200 + image/* → https 값 저장 (http 원본도 https 로)", async () => {
    const fetchImpl = vi.fn(async () => res(200, "image/jpeg"));
    await expect(verifyRemoteProfileImageForSave(KAKAO_HTTP, { fetchImpl })).resolves.toBe(KAKAO_HTTPS);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((fetchImpl.mock.calls[0] as unknown[])[0]).toBe(KAKAO_HTTPS);
  });

  it("404 · image 아님 · 예외 · 타임아웃 → null", async () => {
    await expect(
      verifyRemoteProfileImageForSave(KAKAO_HTTP, { fetchImpl: vi.fn(async () => res(404, "image/jpeg")) }),
    ).resolves.toBeNull();
    await expect(
      verifyRemoteProfileImageForSave(KAKAO_HTTP, { fetchImpl: vi.fn(async () => res(200, "text/html")) }),
    ).resolves.toBeNull();
    await expect(
      verifyRemoteProfileImageForSave(KAKAO_HTTP, {
        fetchImpl: vi.fn(async () => {
          throw new Error("offline");
        }),
      }),
    ).resolves.toBeNull();
    const hang = vi.fn(
      (_u: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    await expect(verifyRemoteProfileImageForSave(KAKAO_HTTP, { fetchImpl: hang, timeoutMs: 10 })).resolves.toBeNull();
  });

  it("허용 밖·카카오 기본 이미지 → 요청 없이 null", async () => {
    const fetchImpl = vi.fn(async () => res(200, "image/jpeg"));
    await expect(verifyRemoteProfileImageForSave("https://evil.example.com/a.jpg", { fetchImpl })).resolves.toBeNull();
    await expect(verifyRemoteProfileImageForSave(KAKAO_DEFAULT, { fetchImpl })).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("OAuth 시드 — 사진을 기록하지 않는 재로그인은 요청 0", async () => {
    const fetchImpl = vi.fn(async () => res(200, "image/jpeg"));
    const seed = { avatarCandidate: KAKAO_HTTP };
    const kept = await withVerifiedOAuthAvatar(
      seed,
      { onboarding_completed_at: "2026-01-01T00:00:00Z", avatar_url: KAKAO_HTTPS },
      { fetchImpl },
    );
    expect(kept).toBe(seed);
    expect(fetchImpl).not.toHaveBeenCalled();

    const fresh = await withVerifiedOAuthAvatar(seed, null, { fetchImpl });
    expect(fresh.avatarCandidate).toBe(KAKAO_HTTPS);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
