// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { readUpdatePromptSafetyInput } from "@/lib/platform/android-play-update-prompt-gate";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("U1 DOM safety reader", () => {
  it("chat composer focused → text input", () => {
    document.body.innerHTML = '<textarea id="composer"></textarea>';
    (document.getElementById("composer") as HTMLTextAreaElement).focus();
    const input = readUpdatePromptSafetyInput({ pathname: "/home", callActive: false, ownDialogsOpen: 0 });
    expect(input.textInputFocused).toBe(true);
  });

  it("checkbox focus is not typing", () => {
    document.body.innerHTML = '<input id="c" type="checkbox" />';
    (document.getElementById("c") as HTMLInputElement).focus();
    expect(
      readUpdatePromptSafetyInput({ pathname: "/home", callActive: false, ownDialogsOpen: 0 }).textInputFocused
    ).toBe(false);
  });

  it("launch intro overlay → intro active", () => {
    document.body.innerHTML = '<div data-launch-intro-overlay=""></div>';
    expect(
      readUpdatePromptSafetyInput({ pathname: "/home", callActive: false, ownDialogsOpen: 0 }).introActive
    ).toBe(true);
  });

  it("incoming call banner (role=dialog) and other modals count as foreign overlays", () => {
    document.body.innerHTML =
      '<div role="dialog" data-testid="incoming-call-banner"></div><div role="dialog" aria-modal="true"></div>';
    expect(
      readUpdatePromptSafetyInput({ pathname: "/home", callActive: false, ownDialogsOpen: 0 }).foreignOverlayCount
    ).toBe(2);
    // own update dialog excluded
    expect(
      readUpdatePromptSafetyInput({ pathname: "/home", callActive: false, ownDialogsOpen: 1 }).foreignOverlayCount
    ).toBe(1);
  });

  it("hidden dialogs are ignored", () => {
    document.body.innerHTML =
      '<div style="display:none"><div role="dialog"></div></div><div hidden role="dialog"></div><div aria-hidden="true"><div role="dialog"></div></div>';
    expect(
      readUpdatePromptSafetyInput({ pathname: "/home", callActive: false, ownDialogsOpen: 0 }).foreignOverlayCount
    ).toBe(0);
  });
});
