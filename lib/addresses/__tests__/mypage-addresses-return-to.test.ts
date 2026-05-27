import { describe, expect, it } from "vitest";
import {
  buildMypageAddressesHref,
  buildMypageAddressesHrefFromPath,
  parseSafeInternalReturnTo,
  resolveAddressFlowEntryPath,
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

  it("resolveAddressFlowEntryPath skips address routes", () => {
    expect(resolveAddressFlowEntryPath("/mypage/addresses/edit")).toBe("");
    expect(resolveAddressFlowEntryPath("/mypage/addresses")).toBe("");
  });

  it("parseSafeInternalReturnTo rejects external urls", () => {
    expect(parseSafeInternalReturnTo("//evil.example")).toBe("");
  });
});
