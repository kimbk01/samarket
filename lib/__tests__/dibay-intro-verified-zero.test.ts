import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * TOTAL BURN / VERIFIED ZERO — proves rejected Intro product is absent.
 * Not a 12th design test.
 */
describe("dibay intro verified zero", () => {
  it("failed Admin studio/list components are absent", () => {
    expect(existsSync("components/admin/dibay-intro")).toBe(false);
    expect(existsSync("app/admin/intro/IntroRebuildNotice.tsx")).toBe(false);
    expect(existsSync("app/admin/intro/[showId]")).toBe(false);
    const page = readFileSync("app/admin/intro/page.tsx", "utf8");
    expect(page).toContain("IntroDocumentHub");
    expect(page).not.toContain("DibayIntroListPage");
    expect(page).not.toContain("DibayIntroStudioPage");
    expect(page).not.toContain("인트로 시스템 재구성 중");
    expect(page).not.toContain("Set Live");
  });

  it("current Intro domain/engine/pack are absent", () => {
    expect(existsSync("lib/dibay-intro")).toBe(false);
    expect(existsSync("scripts/bundle-dibay-intro-engine.mjs")).toBe(false);
  });

  it("current Intro APIs are absent", () => {
    expect(existsSync("app/api/admin/dibay-intros")).toBe(false);
    expect(existsSync("app/api/dibay-intro")).toBe(false);
  });

  it("DibayIntroHost native files are absent", () => {
    // Burned Host product must stay gone. V2+ DibayIntroAuthority under the same
    // package path is the intended recovery surface and is allowed.
    expect(existsSync("android/app/src/main/java/com/dibay/app/intro/DibayIntroHostOwner.java")).toBe(false);
    expect(existsSync("android/app/src/main/java/com/dibay/app/intro/DibayIntroHostPlugin.java")).toBe(false);
    expect(existsSync("ios/App/App/Plugins/DibayIntroHostOwner.swift")).toBe(false);
    expect(existsSync("ios/App/App/Plugins/DibayIntroHostPlugin.swift")).toBe(false);
    const main = readFileSync("android/app/src/main/java/com/dibay/app/MainActivity.java", "utf8");
    expect(main).not.toContain("DibayIntroHost");
    const startup = readFileSync("ios/App/App/DibayStartupBridgeViewController.swift", "utf8");
    expect(startup).not.toContain("DibayIntroHost");
    const cap = readFileSync("ios/App/App/capacitor.config.json", "utf8");
    expect(cap).not.toContain("DibayIntroHostPlugin");
    expect(cap).toContain("NativeCallServicePlugin");
    expect(cap).toContain("DibayVoipCallPlugin");
    expect(cap).toContain("DibayCallPipPlugin");
  });

  it("HOME_PRESENTATION_READY Intro coupling uses startup-metrics producer — burned probe absent", () => {
    expect(existsSync("components/community/CommunityHomePresentationProbe.tsx")).toBe(false);
    const feed = readFileSync("components/community/CommunityFeed.tsx", "utf8");
    expect(feed).not.toContain("CommunityHomePresentationProbe");
    expect(feed).not.toContain("markHomePresentationReady");
    const metrics = readFileSync("lib/startup/startup-metrics.ts", "utf8");
    expect(metrics).toContain("HOME_PRESENTATION_READY");
    expect(metrics).toContain("notifyNativeHomePresentationReady");
    expect(metrics).toContain("homePresentationReady");
    const main = readFileSync(
      "android/app/src/main/java/com/dibay/app/MainActivity.java",
      "utf8",
    );
    expect(main).toContain("HOME_PRESENTATION_READY");
    expect(main).toContain("tryIntroHomeHandoff");
    expect(main).toContain("INTRO_HOLD_LAST_FRAME");
    const ios = readFileSync(
      "ios/App/App/DibayStartupBridgeViewController.swift",
      "utf8",
    );
    expect(ios).toContain("HOME_PRESENTATION_READY");
    expect(ios).toContain("tryIntroHomeHandoff");
  });
});
