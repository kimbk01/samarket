import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("form-keyboard-ssot consumer contract", () => {
  it("Philife write footer uses Form SSOT, not fixed+safe+keyboardInset", () => {
    const src = read("components/philife/PhilifeWriteActionFooter.tsx");
    expect(src).toContain("useFormKeyboardViewport");
    expect(src).toContain("effectiveBottomInset");
    expect(src).not.toMatch(/useMobileKeyboardInset/);
    expect(src).not.toMatch(/fixed bottom-0/);
    expect(src).not.toMatch(/safe-bottom.*keyboardInset|keyboardInset.*safe-bottom/);
    expect(src).not.toMatch(/calc\(var\(--safe-bottom\)/);
  });

  it("Philife scroll body does not reserve fixed-footer + safe-bottom spacer", () => {
    const src = read("lib/ui/philife-write-fb-ui.ts");
    const classMatch = src.match(
      /export const PHILIFE_WRITE_SCROLL_BODY_CLASS\s*=\s*"([^"]+)"/
    );
    expect(classMatch?.[1]).toBeTruthy();
    expect(classMatch?.[1]).not.toMatch(/safe-bottom/);
    expect(classMatch?.[1]).not.toMatch(/4\.75rem/);
  });

  it("Profile edit footer/shell share Form effectiveBottomInset (no dual safe+inset)", () => {
    const bar = read("components/my/edit/ui/ProfileEditBottomSaveBar.tsx");
    const shell = read("components/my/edit/ui/ProfileEditFormShell.tsx");
    expect(bar).toContain("useFormKeyboardViewport");
    expect(bar).toContain("effectiveBottomInset");
    expect(bar).not.toMatch(/useMobileKeyboardInset/);
    expect(bar).not.toMatch(/calc\(var\(--safe-bottom\)/);
    expect(shell).toContain("effectiveBottomInset");
    expect(shell).not.toMatch(/useMobileKeyboardInset/);
    expect(shell).not.toMatch(/safe-bottom.*keyboardInset/);
  });

  it("Trade SubmitButton uses Form SSOT effectiveBottomInset", () => {
    const src = read("components/write/shared/SubmitButton.tsx");
    expect(src).toContain("useFormKeyboardViewport");
    expect(src).toContain("effectiveBottomInset");
    expect(src).not.toMatch(/mobile-fixed-bottom/);
    expect(src).not.toMatch(/calc\(var\(--safe-bottom\)/);
  });

  it("Trade write sheet does not double-apply panel safe-bottom under transform", () => {
    const src = read("components/trade/TradeWriteBottomSheet.tsx");
    expect(src).not.toMatch(/pb-\[var\(--safe-bottom\)\]/);
  });

  it("Legacy ChatInputBar uses Form effectiveBottomInset (no safe+inset sum)", () => {
    const src = read("components/chats/ChatInputBar.tsx");
    expect(src).toContain("useFormKeyboardViewport");
    expect(src).toContain("effectiveBottomInset");
    expect(src).not.toMatch(/useMobileKeyboardInset/);
    expect(src).not.toMatch(/calc\(var\(--safe-bottom\)/);
  });

  it("Address platform Detail V2 footer uses Form SSOT", () => {
    const src = read("components/addresses/AddressPlatformDetailClient.tsx");
    expect(src).toContain("useFormKeyboardViewport");
    expect(src).toContain("effectiveBottomInset");
    expect(src).toContain("data-form-keyboard-footer");
    expect(src).not.toMatch(/safe-area-pb/);
    expect(src).not.toMatch(/Math\.max\(8, effectiveBottomInset\)/);
  });

  it("Mypage bottom sheet shell uses Form SSOT inset, not stacked safe-area", () => {
    const src = read("components/mypage/profile-settings/MypageBottomSheetShell.tsx");
    expect(src).toContain("useFormKeyboardViewport");
    expect(src).toContain("effectiveBottomInset");
    expect(src).not.toMatch(/safe-area-pb/);
  });

  it("CS legacy thread is archive-only — not a Form keyboard sticky-composer consumer", () => {
    // A2-1: member reply composer removed; Form SSOT applies only while a sticky composer exists.
    const src = read("components/mypage/cs/MemberCsNoteThreadClient.tsx");
    expect(src).toContain("support_legacy_archive");
    expect(src).not.toContain("useFormKeyboardViewport");
    expect(src).not.toContain("effectiveBottomInset");
    expect(src).not.toMatch(/method:\s*["']POST["']/);
    expect(src).not.toMatch(/<textarea\b/);
    expect(src).not.toMatch(/env\(safe-area-inset-bottom\)/);
  });

  it("Form CTAs use press class + interaction feedback (not focus haptic)", () => {
    const philife = read("components/philife/PhilifeWriteActionFooter.tsx");
    const trade = read("components/write/shared/SubmitButton.tsx");
    const profile = read("components/my/edit/ui/ProfileEditBottomSaveBar.tsx");
    for (const src of [philife, trade, profile]) {
      expect(src).toContain("FORM_INTERACTIVE_PRESS_CLASS");
      expect(src).toContain("triggerInteractionFeedback");
      expect(src).toContain('"light"');
    }
  });

  it("focus contract exports top+bottom band helpers", () => {
    const src = read("lib/ui/form-keyboard-viewport-contract.ts");
    expect(src).toContain("resolveFormEffectiveViewportTopPx");
    expect(src).toContain("effectiveViewportTop");
    expect(src).toContain("FORM_INTERACTIVE_PRESS_CLASS");
  });
});
