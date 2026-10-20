import { describe, expect, it } from "vitest";
import {
  isAllowedMemberAvatarUrl,
  isOwnProfileAvatarStoragePath,
  resolveMemberAvatarStorageOrigin,
} from "@/lib/profile/member-avatar-url-policy";

const ORIGIN = "https://ckdosyydvgzqwpbwuhon.supabase.co";
const UID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const FILE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const own = (uid: string, ext = "jpg") => `${ORIGIN}/storage/v1/object/public/post-images/${uid}/profile/${FILE}.${ext}`;

function allowed(url: string | null, currentUrl: string | null = null) {
  return isAllowedMemberAvatarUrl({ ownerUserId: UID, url, currentUrl, storageOrigin: ORIGIN });
}

describe("member-avatar-url-policy (DB is_allowed_member_avatar_url 와 같은 규칙)", () => {
  it("허용: 빈 값·기본 그림·본인 profile 폴더 원본(jpg/jpeg/png/webp)·현재 값 그대로", () => {
    expect(allowed(null)).toBe(true);
    expect(allowed("/samarket-default-avatar.svg")).toBe(true);
    for (const ext of ["jpg", "jpeg", "png", "webp"]) expect(allowed(own(UID, ext))).toBe(true);
    expect(allowed("https://lh3.googleusercontent.com/a/x", "https://lh3.googleusercontent.com/a/x")).toBe(true);
  });

  it("거부: 다른 회원 경로·외부·다른 호스트·쿼리·..·파생본·대문자·http", () => {
    expect(allowed(own(OTHER))).toBe(false);
    expect(allowed(own(UID).replace("/profile/", "/posts/"))).toBe(false);
    expect(allowed("https://lh3.googleusercontent.com/a/x")).toBe(false);
    expect(allowed(own(UID).replace(ORIGIN, "https://attacker.supabase.co"))).toBe(false);
    expect(allowed(`${own(UID)}?x=1`)).toBe(false);
    expect(allowed(own(UID).replace("/profile/", "/profile/../"))).toBe(false);
    expect(allowed(own(UID).replace(".jpg", ".thumb.webp"))).toBe(false);
    expect(allowed(own(UID).toUpperCase())).toBe(false);
    expect(allowed(own(UID).replace("https://", "http://"))).toBe(false);
    expect(allowed(own(UID, "gif"))).toBe(false);
  });

  it("storage origin 을 모르면 본인 사진도 새로 지정 불가(빈 값·기본·현재 값만)", () => {
    expect(isAllowedMemberAvatarUrl({ ownerUserId: UID, url: own(UID), currentUrl: null, storageOrigin: null })).toBe(false);
    expect(resolveMemberAvatarStorageOrigin(undefined)).toBeNull();
    expect(resolveMemberAvatarStorageOrigin("http://x.supabase.co")).toBeNull();
    expect(resolveMemberAvatarStorageOrigin(`${ORIGIN}/`)).toBe(ORIGIN);
  });

  it("삭제 대상 경로 판정: 본인 profile 원본만", () => {
    expect(isOwnProfileAvatarStoragePath(UID, `${UID}/profile/${FILE}.webp`)).toBe(true);
    expect(isOwnProfileAvatarStoragePath(UID, `${OTHER}/profile/${FILE}.webp`)).toBe(false);
    expect(isOwnProfileAvatarStoragePath(UID, `${UID}/posts/${FILE}.webp`)).toBe(false);
    expect(isOwnProfileAvatarStoragePath(UID, `${UID}/profile/../${OTHER}/profile/${FILE}.webp`)).toBe(false);
    expect(isOwnProfileAvatarStoragePath(UID, `${UID}/profile/${FILE}.thumb.webp`)).toBe(false);
  });
});
