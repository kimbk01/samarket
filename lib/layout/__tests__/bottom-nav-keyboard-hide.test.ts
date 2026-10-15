import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BOTTOM_NAV_KEYBOARD_RESIZED_CLASS,
  isSoftKeyboardEditableElement,
  resolveBottomNavKeyboardHideState,
  shouldHideBottomNavForKeyboard,
  type BottomNavKeyboardFocusCandidate,
} from "@/lib/layout/bottom-nav-keyboard-hide";

function el(
  tagName: string,
  props: Partial<BottomNavKeyboardFocusCandidate> = {},
  attrs: Record<string, string> = {}
): BottomNavKeyboardFocusCandidate {
  return {
    tagName,
    isConnected: true,
    getAttribute: (name: string) => (name in attrs ? attrs[name]! : null),
    ...props,
  };
}

describe("shouldHideBottomNavForKeyboard", () => {
  it.each(["text", "search", "email", "url", "tel", "password", "number", "", "unknown-future-type"])(
    "hides for <input type=%s> while keyboard open",
    (type) => {
      expect(
        shouldHideBottomNavForKeyboard({ keyboardOpen: true, activeElement: el("INPUT", { type }) })
      ).toBe(true);
    }
  );

  it("treats missing type property via attribute fallback", () => {
    expect(
      shouldHideBottomNavForKeyboard({ keyboardOpen: true, activeElement: el("input", {}, { type: "search" }) })
    ).toBe(true);
    expect(
      shouldHideBottomNavForKeyboard({ keyboardOpen: true, activeElement: el("input", {}, { type: "checkbox" }) })
    ).toBe(false);
  });

  it.each([
    "checkbox",
    "radio",
    "button",
    "submit",
    "reset",
    "image",
    "range",
    "file",
    "color",
    "hidden",
    "date",
    "datetime-local",
    "month",
    "week",
    "time",
  ])("does not hide for non-keyboard <input type=%s>", (type) => {
    expect(
      shouldHideBottomNavForKeyboard({ keyboardOpen: true, activeElement: el("INPUT", { type }) })
    ).toBe(false);
  });

  it("hides for textarea", () => {
    expect(shouldHideBottomNavForKeyboard({ keyboardOpen: true, activeElement: el("TEXTAREA") })).toBe(true);
  });

  it("hides for contenteditable (property or attribute)", () => {
    expect(
      shouldHideBottomNavForKeyboard({ keyboardOpen: true, activeElement: el("DIV", { isContentEditable: true }) })
    ).toBe(true);
    for (const v of ["", "true", "plaintext-only"]) {
      expect(
        shouldHideBottomNavForKeyboard({
          keyboardOpen: true,
          activeElement: el("DIV", {}, { contenteditable: v }),
        })
      ).toBe(true);
    }
    expect(
      shouldHideBottomNavForKeyboard({
        keyboardOpen: true,
        activeElement: el("DIV", {}, { contenteditable: "false" }),
      })
    ).toBe(false);
  });

  it("does not hide for readonly / disabled / inputmode=none / detached fields", () => {
    expect(isSoftKeyboardEditableElement(el("INPUT", { type: "text", readOnly: true }))).toBe(false);
    expect(isSoftKeyboardEditableElement(el("TEXTAREA", { readOnly: true }))).toBe(false);
    expect(isSoftKeyboardEditableElement(el("INPUT", { type: "text", disabled: true }))).toBe(false);
    expect(isSoftKeyboardEditableElement(el("INPUT", { type: "text" }, { inputmode: "none" }))).toBe(false);
    expect(isSoftKeyboardEditableElement(el("INPUT", { type: "text", isConnected: false }))).toBe(false);
  });

  it("does not hide for non-editable focus targets", () => {
    for (const tag of ["BUTTON", "A", "SELECT", "BODY", "DIV"]) {
      expect(shouldHideBottomNavForKeyboard({ keyboardOpen: true, activeElement: el(tag) })).toBe(false);
    }
  });

  it("does not hide for null / undefined active element", () => {
    expect(shouldHideBottomNavForKeyboard({ keyboardOpen: true, activeElement: null })).toBe(false);
    expect(shouldHideBottomNavForKeyboard({ keyboardOpen: true, activeElement: undefined })).toBe(false);
  });

  it("never hides when keyboard is closed (focus alone is not enough)", () => {
    expect(
      shouldHideBottomNavForKeyboard({ keyboardOpen: false, activeElement: el("INPUT", { type: "text" }) })
    ).toBe(false);
    expect(shouldHideBottomNavForKeyboard({ keyboardOpen: false, activeElement: el("TEXTAREA") })).toBe(false);
  });
});

describe("resolveBottomNavKeyboardHideState", () => {
  const input = el("INPUT", { type: "text" });
  it("visible when keyboard closed or focus not editable", () => {
    expect(resolveBottomNavKeyboardHideState({ keyboardOpen: false, activeElement: input, keyboardModel: "layout_resize" })).toBe("visible");
    expect(resolveBottomNavKeyboardHideState({ keyboardOpen: true, activeElement: el("BUTTON"), keyboardModel: "layout_resize" })).toBe("visible");
    expect(resolveBottomNavKeyboardHideState({ keyboardOpen: true, activeElement: null, keyboardModel: "layout_resize" })).toBe("visible");
  });
  it("Android layout_resize → hidden_layout_resized (sheets re-anchor)", () => {
    expect(resolveBottomNavKeyboardHideState({ keyboardOpen: true, activeElement: input, keyboardModel: "layout_resize" })).toBe("hidden_layout_resized");
  });
  it("iOS visual_overlay / unknown → hidden only (no sheet geometry change)", () => {
    expect(resolveBottomNavKeyboardHideState({ keyboardOpen: true, activeElement: input, keyboardModel: "visual_overlay" })).toBe("hidden");
    expect(resolveBottomNavKeyboardHideState({ keyboardOpen: true, activeElement: input, keyboardModel: null })).toBe("hidden");
    expect(resolveBottomNavKeyboardHideState({ keyboardOpen: true, activeElement: input })).toBe("hidden");
  });
});

describe("ConditionalAppShell keyboard-hide wiring contract", () => {
  const root = process.cwd();
  const shell = readFileSync(path.join(root, "components/layout/ConditionalAppShell.tsx"), "utf8");
  const probe = readFileSync(path.join(root, "components/layout/BottomNavKeyboardHideProbe.tsx"), "utf8");

  it("probe mounts only with the nav (no listeners on nav-less routes)", () => {
    expect(shell).toMatch(
      /\{showBottomNavMounted \? \(\s*<BottomNavKeyboardHideProbe onStateChange=\{setBottomNavKeyboardState\} \/>/
    );
    expect(probe).toContain("useFormKeyboardViewport()");
    expect(probe).toContain("resolveBottomNavKeyboardHideState");
  });

  it("keyboard-hide is visual only — clearance and scroll chrome provider untouched", () => {
    expect(shell).toContain("bottomNavOccupiesClearance = showBottomNavEffective");
    expect(shell).toContain("hidden={bottomNavScrollHidden}");
    expect(shell).toContain("bottomNavScrollHidden || bottomNavKeyboardHidden");
    expect(shell).toContain("inert={bottomNavKeyboardHidden}");
    expect(shell).toContain("bottomNavKeyboardResized ? BOTTOM_NAV_KEYBOARD_RESIZED_CLASS");
  });

  it("above-nav sheets re-anchor only on the layout-resized marker", () => {
    expect(BOTTOM_NAV_KEYBOARD_RESIZED_CLASS).toBe("app-bottom-nav-shell--keyboard-resized");
    for (const rel of ["app/dibay-overlay.css", "app/messenger-home-bottom-sheet.css"]) {
      const css = readFileSync(path.join(root, rel), "utf8");
      expect(css).toContain(`html:has(.app-bottom-nav-shell.${BOTTOM_NAV_KEYBOARD_RESIZED_CLASS})`);
    }
  });
});
