/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("bottom-nav first-enter hub cover contract", () => {
  it("hub keep-alive defaults missing axis to rtl (first-enter axis race)", () => {
    const art = read("components/route-transition/AppRouteTransition.tsx");
    expect(art).toContain("peekMainShellPushAxisIntent");
    expect(art).toContain("Product contract: hub↔hub bottom-nav = always rtl");
    expect(art).toMatch(/\?\?\s*"rtl"/);
  });

  it("Chat already-authed commits sync without parking axis behind requireAuthAction", () => {
    const nav = read("components/layout/BottomNav.tsx");
    expect(nav).toContain("getCurrentUser");
    expect(nav).toContain("peekAppBootProfile");
    expect(nav).toContain("isClientSignupComplete");
    expect(nav).toContain("setMainShellPushAxisIntent");
    expect(nav).toContain("DO NOT park beginMenuNavigation / cover axis behind await");
  });

  it("inactive MAIN hub Links enable Next prefetch (first-enter RSC warm)", () => {
    const nav = read("components/layout/BottomNav.tsx");
    expect(nav).toContain("shouldPrefetchMainBottomNavHref");
    expect(nav).toContain("prefetch={shouldPrefetchMainBottomNavHref");
  });
});
