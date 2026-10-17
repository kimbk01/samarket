import { describe, expect, it } from "vitest";
import { OwnerCta } from "@/lib/business/owner-cta-classes";

/**
 * Legacy `.sam-btn*:not(:disabled):active` rules live in `@layer components`, so the `bg-*`
 * utilities inside OwnerCta always win — the press feedback must be a utility on the variant itself.
 * Browser regression (old vs new class strings): rest style identical, pressed visible, disabled unchanged.
 */
describe("OwnerCta pressed-state contract", () => {
  it("every used variant has a :not(:disabled):active utility (works on <button> and <a>)", () => {
    expect(OwnerCta.primary).toContain("not-disabled:active:bg-sam-primary-hover");
    expect(OwnerCta.formPrimary).toContain("not-disabled:active:bg-sam-primary-hover");
    expect(OwnerCta.secondary).toContain("not-disabled:active:brightness-[0.97]");
    expect(OwnerCta.formSecondary).toContain("not-disabled:active:brightness-[0.97]");
    expect(OwnerCta.tertiary).toContain("not-disabled:active:bg-sam-primary-soft");
    expect(OwnerCta.ghost).toContain("not-disabled:active:bg-sam-primary-soft");
    expect(OwnerCta.danger).toContain("not-disabled:active:brightness-95");
    expect(OwnerCta.dangerSoft).toContain("not-disabled:active:brightness-95");
    for (const v of Object.values(OwnerCta)) expect(v).not.toContain("enabled:active:"); // :enabled never matches <a>
  });

  it("rest skins are unchanged (legacy design kept)", () => {
    expect(OwnerCta.primary).toContain("border border-transparent bg-sam-primary");
    expect(OwnerCta.secondary).toContain("border border-sam-primary-border bg-sam-primary-soft text-sam-primary");
    expect(OwnerCta.tertiary).toContain("border border-sam-border bg-sam-surface text-sam-fg");
    expect(OwnerCta.primary).toContain("disabled:opacity-45");
  });
});
