import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("auth gate overlay: scroll body + fixed CTA footer (App Review Guideline 4, 2026-11-06)", () => {
  it("panel keeps the dialog SSOT (overflow hidden) and scrolls through the dialog scroll body", () => {
    const css = read("app/dibay-overlay.css");
    expect(css.match(/\n\.dibay-overlay-dialog \{[^}]*\}/)?.[0] ?? "").toMatch(/overflow: hidden/);
    expect(css.match(/\n\.dibay-overlay-dialog-scroll \{[^}]*\}/)?.[0] ?? "").toMatch(/overflow-y: auto/);
    expect(css).toMatch(/\.dibay-overlay-dialog__footer \{[^}]*flex-shrink: 0/);

    const src = read("components/auth/AuthGateOverlay.tsx");
    expect(src).not.toMatch(/!overflow-y-auto/);
    expect(src).toMatch(/<div ref=\{bodyRef\} className=\{OverlayUi\.dialogScroll\}/);
    expect(src).toMatch(/scrollRootRef: bodyRef/);
    expect(src).toMatch(/className="dibay-overlay-dialog__footer"/);
  });

  it("consent submit CTA lives in the fixed footer, not the scroll body", () => {
    const shell = read("components/auth/DibayOnboardingOverlayShell.tsx");
    expect(shell).toMatch(/footer=\{footer\}/);
    const form = read("components/auth/AuthConsentForm.tsx");
    const footerStart = form.indexOf("footer={");
    const childrenStart = form.indexOf("{isReconsent && shownVersions");
    const submitAt = form.indexOf('data-testid="auth-consent-submit"');
    expect(footerStart).toBeGreaterThan(-1);
    expect(submitAt).toBeGreaterThan(footerStart);
    expect(submitAt).toBeLessThan(childrenStart);
    expect(form.match(/auth_consent_submit"\)/g)?.length).toBe(1);
  });
});
