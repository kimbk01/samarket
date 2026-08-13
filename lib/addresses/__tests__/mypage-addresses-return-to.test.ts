import { describe, expect, it } from "vitest";
import {
  buildMypageAddressesHref,
  buildMypageAddressesHrefFromPath,
  parseSafeInternalReturnTo,
  resolveAddressFlowEntryPath,
  resolveMemberAddressBookHref,
} from "@/lib/addresses/mypage-addresses-return-to";

describe("mypage-addresses-return-to", () => {
  it("buildMypageAddressesHref encodes returnTo", () => {
    expect(buildMypageAddressesHref("/stores")).toBe(
      "/mypage/addresses?returnTo=%2Fstores"
    );
  });

  it("buildMypageAddressesHrefFromPath preserves current screen", () => {
    expect(buildMypageAddressesHrefFromPath("/stores", "?tab=delivery")).toBe(
      "/mypage/addresses?returnTo=%2Fstores%3Ftab%3Ddelivery"
    );
  });

  it("resolveMemberAddressBookHref prefers explicit returnTo", () => {
    expect(resolveMemberAddressBookHref({ returnTo: "/philife" })).toBe(
      "/mypage/addresses?returnTo=%2Fphilife",
    );
    expect(resolveMemberAddressBookHref({ pathname: "/stores", search: "?x=1" })).toBe(
      "/mypage/addresses?returnTo=%2Fstores%3Fx%3D1",
    );
  });

  it("resolveAddressFlowEntryPath skips address routes", () => {
    expect(resolveAddressFlowEntryPath("/mypage/addresses/edit")).toBe("");
    expect(resolveAddressFlowEntryPath("/mypage/addresses")).toBe("");
    expect(resolveAddressFlowEntryPath("/mypage/addresses/fine-tune")).toBe("");
  });

  it("parseSafeInternalReturnTo rejects external urls", () => {
    expect(parseSafeInternalReturnTo("//evil.example")).toBe("");
  });
});
