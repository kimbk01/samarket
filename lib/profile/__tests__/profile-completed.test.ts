import { describe, expect, it } from "vitest";
import { SAMARKET_DEFAULT_AVATAR_URL } from "@/lib/profile/default-avatar";
import {
  computeProfileCompleted,
  isDefaultDibayPublicId,
} from "@/lib/profile/profile-completed";

describe("isDefaultDibayPublicId", () => {
  it("matches dibay_XXXXXX pattern", () => {
    expect(isDefaultDibayPublicId("dibay_A1B2C3")).toBe(true);
    expect(isDefaultDibayPublicId("dibay_000000")).toBe(true);
  });

  it("rejects custom usernames", () => {
    expect(isDefaultDibayPublicId("my_nickname")).toBe(false);
    expect(isDefaultDibayPublicId("dibay_short")).toBe(false);
    expect(isDefaultDibayPublicId(null)).toBe(false);
  });
});

describe("computeProfileCompleted", () => {
  const defaultAvatar = SAMARKET_DEFAULT_AVATAR_URL;
  const customAvatar = "https://cdn.example.com/avatar.jpg";

  it("false for signup defaults", () => {
    expect(
      computeProfileCompleted({
        username: "dibay_A1B2C3",
        display_name: "dibay_A1B2C3",
        avatar_url: defaultAvatar,
      }),
    ).toBe(false);
  });

  it("false when only display_name changes", () => {
    expect(
      computeProfileCompleted({
        username: "dibay_A1B2C3",
        display_name: "홍길동",
        avatar_url: defaultAvatar,
      }),
    ).toBe(false);
  });

  it("false when only avatar changes", () => {
    expect(
      computeProfileCompleted({
        username: "dibay_A1B2C3",
        display_name: "dibay_A1B2C3",
        avatar_url: customAvatar,
      }),
    ).toBe(false);
  });

  it("true when username, display_name, and custom avatar are all set", () => {
    expect(
      computeProfileCompleted({
        username: "hong_user",
        display_name: "홍길동",
        avatar_url: customAvatar,
      }),
    ).toBe(true);
  });
});
