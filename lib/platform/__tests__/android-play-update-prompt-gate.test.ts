import { describe, expect, it } from "vitest";
import {
  isUpdatePromptSensitivePath,
  resolveInstallConfirmOutcome,
  resolvePendingUpdatePrompt,
  resolveUpdatePromptSafety,
  resolveUpdateStartConfirmOutcome,
  shouldYieldOpenUpdatePrompt,
  type UpdatePromptSafetyInput,
} from "@/lib/platform/android-play-update-prompt-gate";
import type { AndroidPlayUpdateInfo } from "@/lib/platform/android-play-in-app-update-policy";

const SAFE: UpdatePromptSafetyInput = {
  pathname: "/home",
  introActive: false,
  foreignOverlayCount: 0,
  textInputFocused: false,
  documentVisible: true,
  callActive: false,
};

describe("U1 update prompt safety gate", () => {
  it("is safe on a plain service screen", () => {
    expect(resolveUpdatePromptSafety(SAFE)).toEqual({ safe: true });
    expect(resolveUpdatePromptSafety({ ...SAFE, pathname: "/community-messenger" })).toEqual({
      safe: true,
    });
    expect(resolveUpdatePromptSafety({ ...SAFE, pathname: "/stores/kimbap" })).toEqual({ safe: true });
  });

  it.each([
    ["intro / OS Start", { introActive: true }, "intro"],
    ["background", { documentVisible: false }, "background"],
    ["active or ringing call", { callActive: true }, "call"],
    ["other dialog / sheet / incoming banner", { foreignOverlayCount: 1 }, "other_overlay"],
    ["typing (keyboard)", { textInputFocused: true }, "text_input"],
  ])("holds during %s", (_label, patch, reason) => {
    expect(resolveUpdatePromptSafety({ ...SAFE, ...patch })).toEqual({ safe: false, reason });
  });

  it.each([
    "/login",
    "/signup",
    "/admin/app/meta",
    "/community-messenger/rooms/abc",
    "/chats/room-1",
    "/chats/new",
    "/community-messenger/calls-v4/c1",
    "/community-messenger/calls/outgoing",
    "/community-messenger/calls/s1",
    "/stores/kimbap/checkout",
    "/write",
    "/write/12",
    "/community/write",
    "/philife/write",
    "/products/9/edit",
    "/products/new",
    "/mypage/profile/edit",
    "/mypage/trade/chat/compose",
  ])("holds on sensitive route %s", (pathname) => {
    expect(isUpdatePromptSensitivePath(pathname)).toBe(true);
    expect(resolveUpdatePromptSafety({ ...SAFE, pathname })).toEqual({
      safe: false,
      reason: "sensitive_route",
    });
  });

  it.each(["/home", "/market", "/chats", "/community-messenger", "/stores/kimbap", "/mypage/settings/version"])(
    "does not treat %s as sensitive",
    (pathname) => {
      expect(isUpdatePromptSensitivePath(pathname)).toBe(false);
    }
  );

  it("open dialog yields to a call, a foreign dialog or a sensitive route — not to its own focus", () => {
    expect(shouldYieldOpenUpdatePrompt(SAFE)).toBe(false);
    expect(shouldYieldOpenUpdatePrompt({ ...SAFE, textInputFocused: true })).toBe(false);
    expect(shouldYieldOpenUpdatePrompt({ ...SAFE, callActive: true })).toBe(true);
    expect(shouldYieldOpenUpdatePrompt({ ...SAFE, foreignOverlayCount: 1 })).toBe(true);
    expect(
      shouldYieldOpenUpdatePrompt({ ...SAFE, pathname: "/community-messenger/calls-v4/c1" })
    ).toBe(true);
  });
});

const AVAILABLE: AndroidPlayUpdateInfo = {
  updateAvailability: "UPDATE_AVAILABLE",
  installStatus: "UNKNOWN",
  availableVersionCode: 19,
  installedVersionCode: 18,
  installedVersionName: "1.2.4",
  flexibleAllowed: true,
  immediateAllowed: true,
};
const HELD = {
  kind: "available" as const,
  payload: { choice: "flexible" as const, reason: "default_flexible", availableVersionCode: 19 },
};

describe("U1 held prompt re-validation", () => {
  it("opens the held prompt with fresh versions when still available", () => {
    expect(resolvePendingUpdatePrompt({ pending: HELD, info: AVAILABLE, installReadyDismissed: false })).toEqual({
      action: "open_available",
      payload: {
        choice: "flexible",
        reason: "default_flexible",
        availableVersionCode: 19,
        installedVersionCode: 18,
        installedVersionName: "1.2.4",
      },
    });
  });

  it("drops the held prompt when the update was already installed (Play auto-update)", () => {
    const info = { ...AVAILABLE, updateAvailability: "UPDATE_NOT_AVAILABLE", availableVersionCode: 0 };
    expect(resolvePendingUpdatePrompt({ pending: HELD, info, installReadyDismissed: false })).toEqual({
      action: "drop",
    });
  });

  it("switches to install-ready when the download finished meanwhile", () => {
    const info = { ...AVAILABLE, installStatus: "DOWNLOADED" };
    expect(resolvePendingUpdatePrompt({ pending: HELD, info, installReadyDismissed: false })).toEqual({
      action: "open_install",
    });
    expect(resolvePendingUpdatePrompt({ pending: HELD, info, installReadyDismissed: true })).toEqual({
      action: "drop",
    });
  });

  it("drops a stale install prompt when the download is gone", () => {
    expect(
      resolvePendingUpdatePrompt({ pending: { kind: "install" }, info: AVAILABLE, installReadyDismissed: false })
    ).toEqual({ action: "drop" });
  });

  it("keeps holding during a call", () => {
    expect(
      resolvePendingUpdatePrompt({
        pending: HELD,
        info: { ...AVAILABLE, callInProgress: true },
        installReadyDismissed: false,
      })
    ).toEqual({ action: "keep" });
  });
});

describe("U3 / U4 confirm outcomes", () => {
  it("U3: start failures stay visible instead of silently closing", () => {
    expect(resolveUpdateStartConfirmOutcome({ ran: true, reason: "default_flexible", choice: "flexible" })).toEqual({
      kind: "close",
    });
    expect(resolveUpdateStartConfirmOutcome({ ran: false, reason: "in_flight" })).toEqual({
      kind: "error",
      message: "start_failed",
    });
    expect(resolveUpdateStartConfirmOutcome({ ran: false, reason: "update_flow_failed" })).toEqual({
      kind: "error",
      message: "start_failed",
    });
    expect(resolveUpdateStartConfirmOutcome({ ran: false, reason: "call_in_progress" })).toEqual({
      kind: "error",
      message: "blocked_by_call",
    });
    expect(resolveUpdateStartConfirmOutcome({ ran: false, reason: "update_not_available" })).toEqual({
      kind: "close",
    });
  });

  it("U4: install failures stay visible; stale downloads close", () => {
    expect(resolveInstallConfirmOutcome({ ran: true, reason: "flexible_downloaded" })).toEqual({
      kind: "keep_open",
    });
    expect(resolveInstallConfirmOutcome({ ran: false, reason: "complete_failed" })).toEqual({
      kind: "error",
      message: "install_failed",
    });
    expect(resolveInstallConfirmOutcome({ ran: false, reason: "call_in_progress" })).toEqual({
      kind: "error",
      message: "blocked_by_call",
    });
    expect(resolveInstallConfirmOutcome({ ran: false, reason: "install_not_ready" })).toEqual({
      kind: "close",
    });
  });
});
