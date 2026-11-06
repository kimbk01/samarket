import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AUTH_GATE_PANEL_SCROLL_CLASS } from "@/components/auth/AuthGateOverlay";

describe("auth gate overlay panel scroll (App Review Guideline 4, 2026-11-06)", () => {
  it("panel scroll beats the unlayered `.dibay-overlay-dialog { overflow: hidden }`", () => {
    const css = readFileSync(join(process.cwd(), "app/dibay-overlay.css"), "utf8");
    const dialogRule = css.match(/\n\.dibay-overlay-dialog \{[^}]*\}/)?.[0] ?? "";
    expect(dialogRule).toMatch(/overflow: hidden/);
    expect(AUTH_GATE_PANEL_SCROLL_CLASS.split(/\s+/)).toContain("!overflow-y-auto");
  });

  it("AuthGateOverlay panel uses the scroll class", () => {
    const src = readFileSync(join(process.cwd(), "components/auth/AuthGateOverlay.tsx"), "utf8");
    expect(src).toMatch(/\$\{AUTH_GATE_PANEL_MAX_H_CLASS\} \$\{AUTH_GATE_PANEL_SCROLL_CLASS\}/);
  });
});
