import { describe, expect, it } from "vitest";
import {
  buildAuthUserMap,
  linkedProvidersFromIdentities,
  resolveProfileLessAdminNickname,
} from "@/lib/admin-users/admin-users-list-server";

describe("buildAuthUserMap", () => {
  it("dedupes auth users by id", () => {
    const map = buildAuthUserMap([
      { id: "a", email: "one@test.com" },
      { id: "a", email: "dup@test.com" },
      { id: "b", email: "two@test.com" },
    ]);
    expect(map.size).toBe(2);
    expect(map.get("a")?.email).toBe("one@test.com");
  });
});

describe("linkedProvidersFromIdentities", () => {
  it("returns provider slugs in order", () => {
    expect(
      linkedProvidersFromIdentities([
        { provider: "google", providerUserId: "g1", email: null },
        { provider: "kakao", providerUserId: "k1", email: null },
      ]),
    ).toEqual(["google", "kakao"]);
  });
});

describe("resolveProfileLessAdminNickname", () => {
  it("prefers metadata nickname over synthetic auth email local part", () => {
    expect(
      resolveProfileLessAdminNickname({
        userMetadata: { nickname: "카카오유저" },
        authEmail: "kakao.4944733937@kakao.native.dibay.internal",
        loginIdentifier: "4944733937",
        userId: "uuid-1234",
      }),
    ).toBe("카카오유저");
  });

  it("uses login identifier when metadata is empty", () => {
    expect(
      resolveProfileLessAdminNickname({
        userMetadata: {},
        authEmail: "kakao.4944733937@kakao.native.dibay.internal",
        loginIdentifier: "4944733937",
        userId: "uuid-1234",
      }),
    ).toBe("4944733937");
  });
});
