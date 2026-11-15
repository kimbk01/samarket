import { describe, expect, it } from "vitest";
import { PROFILE_PUBLIC_MIN_SELECT } from "@/lib/users/profile-public-select";

describe("공개 프로필 select — 운영 profiles 에 있는 열만 (G2 · 2026-11-16)", () => {
  it("없는 열 temperature 를 조회하지 않는다", () => {
    const cols = PROFILE_PUBLIC_MIN_SELECT.split(",").map((c) => c.trim());
    expect(cols).not.toContain("temperature");
    expect(cols).toEqual(["id", "nickname", "username", "avatar_url", "trust_score", "manner_temperature", "manner_score"]);
  });
});
