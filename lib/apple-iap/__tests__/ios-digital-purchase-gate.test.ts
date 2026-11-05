import { describe, expect, it } from "vitest";
import {
  detectIosAppRequestSignals,
  isIosAppWebViewUserAgent,
} from "@/lib/apple-iap/ios-digital-purchase-contract";
import { blockIosAppDigitalPurchase } from "@/lib/apple-iap/ios-digital-purchase-gate.server";

const UA = {
  iosAppIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  iosAppIpadDesktop:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)",
  iosSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  iosChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1",
  iosFacebookInApp:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 [FBAN/FBIOS;FBAV/489.0.0.47.104]",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  androidApp:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.86 Mobile Safari/537.36",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.86 Mobile Safari/537.36",
  desktopChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
};

function req(headers: Record<string, string>) {
  return new Request("https://x.test/api/me/x", { method: "POST", headers }) as never;
}

describe("iOS app UA detection", () => {
  it("DIBAY iOS WKWebView (iPhone · iPad desktop mode) = iOS app", () => {
    expect(isIosAppWebViewUserAgent(UA.iosAppIphone)).toBe(true);
    expect(isIosAppWebViewUserAgent(UA.iosAppIpadDesktop)).toBe(true);
  });
  it("browsers, other apps' in-app browsers, Android = not iOS app", () => {
    for (const ua of [
      UA.iosSafari,
      UA.iosChrome,
      UA.iosFacebookInApp,
      UA.macSafari,
      UA.androidApp,
      UA.androidChrome,
      UA.desktopChrome,
      "",
    ]) {
      expect(isIosAppWebViewUserAgent(ua)).toBe(false);
    }
  });
});

describe("iOS app request signals (block only, any one signal blocks)", () => {
  it("Build 22 (no header) still blocked by cookie and UA", () => {
    expect(detectIosAppRequestSignals({ markerCookie: "ios", userAgent: UA.iosAppIphone })).toEqual([
      "cookie",
      "user_agent",
    ]);
  });
  it("cookie missing in the iOS app → header and UA still block", () => {
    expect(detectIosAppRequestSignals({ shellHeader: "ios", userAgent: UA.iosAppIphone })).toEqual([
      "header",
      "user_agent",
    ]);
  });
  it("forged android header + cookie removed inside iOS app → UA still blocks", () => {
    expect(detectIosAppRequestSignals({ shellHeader: "android", userAgent: UA.iosAppIphone })).toEqual([
      "user_agent",
    ]);
  });
  it("Android app / web → no signal", () => {
    expect(
      detectIosAppRequestSignals({ shellHeader: "android", markerCookie: "android", userAgent: UA.androidApp })
    ).toEqual([]);
    expect(detectIosAppRequestSignals({ shellHeader: "web", userAgent: UA.desktopChrome })).toEqual([]);
    expect(detectIosAppRequestSignals({ userAgent: UA.iosSafari })).toEqual([]);
  });
});

describe("blockIosAppDigitalPurchase", () => {
  it("iOS app request → 403 ios_digital_purchase_unavailable", async () => {
    const res = blockIosAppDigitalPurchase(req({ "user-agent": UA.iosAppIphone, cookie: "a=1; dibay_app=ios" }));
    expect(res?.status).toBe(403);
    expect(await res?.json()).toEqual({ ok: false, error: "ios_digital_purchase_unavailable" });
  });
  it("cookie only (Build 22 with header absent, UA unknown) → blocked", () => {
    expect(blockIosAppDigitalPurchase(req({ cookie: "dibay_app=ios" }))?.status).toBe(403);
  });
  it("Android app and web → null (payment continues)", () => {
    expect(
      blockIosAppDigitalPurchase(
        req({ "user-agent": UA.androidApp, cookie: "dibay_app=android", "x-dibay-shell": "android" })
      )
    ).toBeNull();
    expect(blockIosAppDigitalPurchase(req({ "user-agent": UA.desktopChrome, "x-dibay-shell": "web" }))).toBeNull();
    expect(blockIosAppDigitalPurchase(req({ "user-agent": UA.iosSafari }))).toBeNull();
  });
});
