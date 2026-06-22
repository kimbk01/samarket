import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("incoming call compact banner UI", () => {
  it("renders Starbucks dark green compact card with accept/decline phone buttons", () => {
    const banner = read("components/messenger/call/IncomingCallBanner.tsx");
    expect(banner).toContain("data-incoming-call-compact-banner");
    expect(banner).toContain("INCOMING_CALL_BANNER_BG_CLASS");
    expect(banner).toContain("#006241");
    expect(banner).toContain("PhoneOff");
    expect(banner).toContain("<Phone size={24}");
    expect(banner).not.toContain("<Check size=");
    expect(banner).toContain("var(--safe-top");
  });

  it("Global incoming host renders ForegroundIncomingCallHost with web banner SSOT", () => {
    const global = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    expect(global).toContain("ForegroundIncomingCallHost");
    expect(global).toContain("preferNativeAndroidForegroundIncoming: false");
    expect(global).toContain("acceptIncomingCallOnce");
    expect(global).toContain("runIncomingCallReject");
    expect(global).not.toContain("patchCommunityMessengerCallSession");
  });

  it("foreground presenter never suppresses banner for native Android foreground", () => {
    const presenter = read("lib/community-messenger/incoming-call/foreground-incoming-presenter.ts");
    expect(presenter).not.toContain("native_foreground_primary");
  });

  it("Android push delivery uses foreground web SSOT without native pill launcher", () => {
    const delivery = read("android/app/src/main/java/com/dibay/app/IncomingCallPushDelivery.java");
    expect(delivery).toContain("incoming_call_foreground_web_ssot");
    expect(delivery).not.toContain("IncomingCallForegroundUiLauncher.showUi");
  });

  it("outgoing hydrate shell does not block on full-page loading copy", () => {
    const client = read("components/community-messenger/CommunityMessengerCallClient.tsx");
    const hydrate = client.slice(client.indexOf("if (loading && !session)"));
    expect(hydrate).toContain('visualTheme: "starbucks"');
    expect(hydrate).toContain("subStatusText: null");
    expect(hydrate).not.toContain("cm_ui_call_loading_session");
  });
});
