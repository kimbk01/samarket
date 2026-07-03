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
    expect(banner).toContain("INCOMING_CALL_BANNER_ACCEPT_CLASS");
    expect(banner).toContain("PhoneOff");
    expect(banner).toContain("<Phone size={24}");
    expect(banner).not.toContain("<Check size=");
    expect(banner).toContain("var(--safe-top");
  });

  it("fullscreen incoming uses same Starbucks green surface SSOT as compact banner", () => {
    const tokens = read("lib/community-messenger/call-ui/incoming-call-banner-tokens.ts");
    const incomingView = read("components/messenger/call/IncomingCallView.tsx");
    const callScreen = read("components/messenger/call/CallScreen.tsx");
    expect(tokens).toContain('INCOMING_CALL_PRIMARY_HEX = CALL_UI_PRIMARY');
    expect(tokens).toContain('CALL_UI_PRIMARY = "#00754A"');
    expect(tokens).toContain("INCOMING_CALL_FULLSCREEN_SURFACE_CLASS");
    expect(incomingView).toContain("INCOMING_CALL_FULLSCREEN_ACCEPT_BTN_CLASS");
    expect(incomingView).toContain("INCOMING_CALL_FULLSCREEN_DECLINE_BTN_CLASS");
    expect(incomingView).toContain("bg-transparent");
    expect(incomingView).not.toContain("#8B5E2E");
    expect(incomingView).not.toContain("#101827");
    expect(callScreen).toContain("INCOMING_CALL_FULLSCREEN_SURFACE_CLASS");
    expect(callScreen).not.toContain("#8B5E2E");
  });

  it("Android native call drawables use P2-1 Starbucks token SSOT (dibay_call_*)", () => {
    const colors = read("android/app/src/main/res/values/colors.xml");
    const fullscreen = read("android/app/src/main/res/drawable/bg_dibay_incoming_fullscreen.xml");
    const pill = read("android/app/src/main/res/drawable/bg_dibay_incoming_pill.xml");
    const accept = read("android/app/src/main/res/drawable/bg_dibay_incoming_btn_accept.xml");

    expect(colors).toContain('name="dibay_call_primary">#00754A');
    expect(colors).toContain('name="dibay_call_primary_pressed">#006241');
    expect(colors).toContain('name="dibay_incoming_primary">#00754A');
    expect(colors).toContain('name="dibay_incoming_deep_green">#006241');

    expect(fullscreen).toContain("@color/dibay_call_primary");
    expect(fullscreen).toContain("@color/dibay_call_primary_pressed");
    expect(fullscreen).toContain('android:endColor="#003D29"');
    expect(fullscreen).not.toContain("dibay_incoming_gradient_start");

    expect(pill).toContain("@color/dibay_call_dark_card");
    expect(pill).not.toContain("dibay_incoming_gradient_start");

    expect(accept).toContain("@color/dibay_call_primary");
  });

  it("Global incoming host renders ForegroundIncomingCallHost with web banner SSOT", () => {
    const global = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    const basics = read("lib/community-messenger/call-phase0-basics.ts");
    expect(global).toContain("ForegroundIncomingCallHost");
    expect(basics).toContain("CM_CALL_PHASE0_BASICS_ONLY");
    expect(global).toContain("isCmCallPhase0BasicsOnly()");
    expect(global).toContain("preferNativeAndroidForegroundIncoming");
    expect(global).toContain("isCmNativeForegroundIncomingPillEnabled");
    expect(global).toContain("acceptIncomingCallOnce");
    expect(global).toContain("runIncomingCallReject");
    expect(global).not.toContain("patchCommunityMessengerCallSession");
  });

  it("Phase 0 foreground uses web banner only (native pill disabled at bridge)", () => {
    const global = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    expect(global).toContain("onForegroundIncomingUi");
    expect(global).toContain("isCmNativeForegroundIncomingPillEnabled");
    expect(global).toContain("dismissNativeForegroundIncomingUi");
    const delivery = read("android/app/src/main/java/com/dibay/app/IncomingCallPushDelivery.java");
    expect(delivery).toContain("NativeVoiceCallRuntime.handleIncoming");
    expect(delivery).not.toContain("IncomingCallForegroundUiLauncher.showUi");
    expect(delivery).not.toContain("incoming_call_foreground_web_ssot");
  });

  it("outgoing hydrate shell does not block on full-page loading copy", () => {
    const client = read("components/community-messenger/CommunityMessengerCallClient.tsx");
    const hydrate = client.slice(client.indexOf("if (loading && !session)"));
    expect(hydrate).toContain('visualTheme: "starbucks"');
    expect(hydrate).toContain("subStatusText: null");
    expect(hydrate).not.toContain("cm_ui_call_loading_session");
  });
});
