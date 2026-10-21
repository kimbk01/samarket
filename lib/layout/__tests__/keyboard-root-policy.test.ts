import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isKeyboardRootChatRoute,
  shouldDismissKeyboardOnTap,
  shouldReleaseInputFocusOnKeyboardClose,
} from "@/lib/layout/keyboard-root-policy";

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

function el(tagName: string, matches: string[] = []) {
  return {
    tagName,
    closest: (sel: string) => (matches.some((m) => sel.includes(m)) ? {} : null),
  };
}

describe("keyboard root policy — Android back release (K-05)", () => {
  const base = {
    platform: "android" as const,
    pathname: "/login",
    wasOpen: true,
    open: false,
    widthChanged: false,
    activeElement: el("INPUT"),
  };
  it("releases on non-(main) routes too (login / admin)", () => {
    expect(shouldReleaseInputFocusOnKeyboardClose(base)).toBe(true);
    expect(shouldReleaseInputFocusOnKeyboardClose({ ...base, pathname: "/admin/users" })).toBe(true);
  });
  it("keeps the chat-route exception and header messenger stack", () => {
    for (const p of ["/community-messenger/rooms/1", "/chats/9", "/chat", "/group-chat"]) {
      expect(isKeyboardRootChatRoute(p)).toBe(true);
      expect(shouldReleaseInputFocusOnKeyboardClose({ ...base, pathname: p })).toBe(false);
    }
    expect(
      shouldReleaseInputFocusOnKeyboardClose({
        ...base,
        activeElement: el("INPUT", ["data-messenger-header-stack"]),
      })
    ).toBe(false);
  });
  it("only on Android, only open→closed, never on width change", () => {
    expect(shouldReleaseInputFocusOnKeyboardClose({ ...base, platform: "ios" })).toBe(false);
    expect(shouldReleaseInputFocusOnKeyboardClose({ ...base, wasOpen: false })).toBe(false);
    expect(shouldReleaseInputFocusOnKeyboardClose({ ...base, open: true })).toBe(false);
    expect(shouldReleaseInputFocusOnKeyboardClose({ ...base, widthChanged: true })).toBe(false);
    expect(shouldReleaseInputFocusOnKeyboardClose({ ...base, activeElement: el("BUTTON") })).toBe(false);
  });
});

describe("keyboard root policy — tap outside (opt-in surfaces, iOS)", () => {
  const base = {
    platform: "ios" as const,
    pathname: "/login",
    editableFocused: true,
    movePx: 2,
    target: el("DIV", ["data-keyboard-tap-dismiss"]),
  };
  it("dismisses on a plain tap inside an opt-in surface", () => {
    expect(shouldDismissKeyboardOnTap(base)).toBe(true);
  });
  it("never global: no opt-in surface → keep", () => {
    expect(shouldDismissKeyboardOnTap({ ...base, target: el("DIV") })).toBe(false);
  });
  it("interactive targets, scroll gestures, chat routes, Android → keep", () => {
    expect(
      shouldDismissKeyboardOnTap({ ...base, target: el("BUTTON", ["data-keyboard-tap-dismiss", "button"]) })
    ).toBe(false);
    expect(shouldDismissKeyboardOnTap({ ...base, movePx: 40 })).toBe(false);
    expect(shouldDismissKeyboardOnTap({ ...base, pathname: "/chats/1" })).toBe(false);
    expect(shouldDismissKeyboardOnTap({ ...base, platform: "android" })).toBe(false);
    expect(shouldDismissKeyboardOnTap({ ...base, editableFocused: false })).toBe(false);
  });
});

describe("keyboard root SSOT wiring", () => {
  it("root probe mounted once in app/layout; shell no longer mounts its own Android probe", () => {
    const layout = read("app/layout.tsx");
    expect(layout.match(/<KeyboardViewportRootProbe \/>/g)?.length).toBe(1);
    const shell = read("components/layout/ConditionalAppShell.tsx");
    expect(shell).not.toContain("AndroidInputBackKeyReleaseProbe");
  });
  it("--kb-safe-bottom = safe-bottom closed, 0 open", () => {
    const css = read("app/app-shell.css");
    expect(css).toContain("--kb-safe-bottom: var(--safe-bottom);");
    expect(css).toMatch(/html\[data-kb-open="true"\]\s*\{\s*--kb-safe-bottom: 0px;/);
  });
  it("--kb-safe-bottom only on keyboard-linked surfaces (not headers / tabs)", () => {
    expect(read("app/app-bottom-nav.css")).not.toContain("--kb-safe-bottom");
    expect(read("app/sector-header.css")).not.toContain("--kb-safe-bottom");
  });
});
