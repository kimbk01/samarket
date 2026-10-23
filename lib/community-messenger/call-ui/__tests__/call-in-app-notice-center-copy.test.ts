import { describe, expect, it } from "vitest";
import { CALL_IN_APP_NOTICE_CENTER_EVENTS } from "@/lib/community-messenger/call-ui/call-in-app-notice-contract";
import { getCallInAppNoticeCenterCopy } from "@/lib/community-messenger/call-ui/call-in-app-notice-center-copy";

describe("call-in-app-notice-center-copy (E-C3)", () => {
  it("maps five center events to distinct title/body/tone", () => {
    const tones = new Set<string>();
    for (const event of CALL_IN_APP_NOTICE_CENTER_EVENTS) {
      const copy = getCallInAppNoticeCenterCopy(event);
      expect(copy).not.toBeNull();
      expect(copy!.titleKey).toMatch(/^cm_ui_call_notice_title_/);
      expect(copy!.bodyKey.length).toBeGreaterThan(4);
      expect(copy!.fallbackTitleKo).not.toBe(copy!.fallbackBodyKo);
      tones.add(copy!.tone);
    }
    expect(getCallInAppNoticeCenterCopy("call_failed")!.tone).toBe("failure");
    expect(getCallInAppNoticeCenterCopy("no_answer")!.tone).toBe("info");
    expect(tones.has("attention")).toBe(true);
  });

  it("returns null for banner-only events", () => {
    expect(getCallInAppNoticeCenterCopy("missed")).toBeNull();
    expect(getCallInAppNoticeCenterCopy("reconnecting")).toBeNull();
    expect(getCallInAppNoticeCenterCopy("permission_required")).toBeNull();
  });
});
