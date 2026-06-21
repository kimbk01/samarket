import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SSOT_SOURCE_CONTRACT_REGISTRY } from "@/lib/test-utils/ssot-source-contract-registry";
import { assertSsotSourceContract } from "@/lib/test-utils/ssot-source-contract";

function read(p: string): string {
  return readFileSync(join(process.cwd(), p), "utf8");
}

describe("cm kakao/telegram navigation recovery contract", () => {
  it("contract document defines incident root cause and 4 tiers", () => {
    const doc = read("docs/community-messenger/cm-kakao-telegram-navigation-contract.md");
    expect(doc).toContain("2026-06-21 rollback");
    expect(doc).toContain("signupComplete = consent && @id && profile");
    expect(doc).toContain("Tier 1 — Hub tabs");
    expect(doc).toContain("Tier 4 — Call accept");
    expect(doc).toContain("verify:cm-kakao-telegram-navigation-contract");
  });

  it("hub navigation commits synchronously without deferred router calls", () => {
    const nav = read("lib/main-menu/main-bottom-nav-route-commit.ts");
    expect(nav).toContain("commitMainBottomNavRouteNavigateSync");
    expect(nav).toContain("guardedClientNavigate");
    expect(nav).not.toMatch(
      /commitMainBottomNavRouteNavigateSync[\s\S]{0,900}setTimeout\([^)]*(?:replace|push)\(/
    );
  });

  it("deep route lock guards hub navigation during room/call entry", () => {
    const lock = read("lib/navigation/cm-deep-route-navigation-lock.ts");
    expect(lock).toContain("beginRoomDeepRouteNavigationLock");
    expect(lock).toContain("beginCallDeepRouteNavigationLock");
    expect(lock).toContain("bottom_nav_async");
    const guard = read("lib/navigation/guarded-client-navigation.ts");
    expect(guard).toContain("evaluateDeepRouteNavigationGuard");
  });

  it("auth HTML gate stays consent-only for messenger deep routes", () => {
    const gate = read("components/auth/DibaySignupGate.tsx");
    expect(gate).toContain("consentComplete");
    expect(gate).toContain("/mypage");
    const signup = read("lib/auth/dibay-signup-status.ts");
    expect(signup).toContain("const signupComplete = consentComplete");
    expect(signup).not.toContain("consentComplete && dibayIdComplete && profileComplete");
  });

  it("call accept SSOT: gateway PATCH + in-place video banner accept", () => {
    const global = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    expect(global).toContain("acceptIncomingCallOnce");
    expect(global).toContain("skipRouteReplace: isVideoDirect");
    expect(global).not.toContain("incoming_banner_accept_route_first");
    const gateway = read("lib/community-messenger/incoming-call-accept-gateway.ts");
    expect(gateway).toContain("buildPostAcceptActiveCallHref");
    expect(gateway).toContain("prewarmInPlaceDirectVideoCallHost");
  });

  it("SSOT contract markers for recovery modules are present", () => {
    const ids = [
      "cm-deep-route-navigation-lock",
      "cm-call-accept-gateway-patch-owner",
      "dibay-signup-consent-only-gate",
    ] as const;
    for (const id of ids) {
      const entry = SSOT_SOURCE_CONTRACT_REGISTRY.find((e) => e.id === id);
      expect(entry, `registry missing ${id}`).toBeTruthy();
      expect(() => assertSsotSourceContract(entry!)).not.toThrow();
    }
  });
});
