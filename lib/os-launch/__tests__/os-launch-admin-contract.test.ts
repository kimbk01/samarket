/**
 * R17-OS Admin — build-time OS start visual contract.
 * Admin edits PENDING values only; apps never read them at runtime.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkOsLaunchLogo,
  isOsLaunchPendingChanged,
  normalizeOsLaunchHex,
  osLaunchBuildLogoPublicUrl,
  readPngInfo,
} from "../contract";

const ROOT = process.cwd();
const src = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

function png(width: number, height: number, colorType: number): Uint8Array {
  const b = new Uint8Array(64);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0, 0, 0, 13], 8);
  b.set([0x49, 0x48, 0x44, 0x52], 12); // IHDR
  const u32 = (o: number, v: number) => b.set([v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255], o);
  u32(16, width);
  u32(20, height);
  b[24] = 8;
  b[25] = colorType;
  return b;
}

describe("R17-OS admin contract", () => {
  it("normalizes hex colors and rejects anything else", () => {
    expect(normalizeOsLaunchHex("#075740")).toBe("#075740");
    expect(normalizeOsLaunchHex("0b5a24")).toBe("#0B5A24");
    expect(normalizeOsLaunchHex("#abc")).toBe("#AABBCC");
    expect(normalizeOsLaunchHex("green")).toBeNull();
    expect(normalizeOsLaunchHex("#12345G")).toBeNull();
    expect(normalizeOsLaunchHex(42)).toBeNull();
  });

  it("accepts only transparent PNG logos within size rules", () => {
    expect(readPngInfo(png(716, 681, 6))).toEqual({ width: 716, height: 681, hasAlpha: true });
    expect(checkOsLaunchLogo(png(716, 681, 6)).ok).toBe(true);
    expect(checkOsLaunchLogo(png(716, 681, 2))).toEqual({ ok: false, error: "no_alpha" });
    expect(checkOsLaunchLogo(png(300, 300, 6))).toEqual({ ok: false, error: "too_small" });
    expect(checkOsLaunchLogo(png(5000, 900, 6))).toEqual({ ok: false, error: "too_big_dimensions" });
    expect(checkOsLaunchLogo(new Uint8Array([1, 2, 3]))).toEqual({ ok: false, error: "not_png" });
    expect(checkOsLaunchLogo(new Uint8Array())).toEqual({ ok: false, error: "empty" });
  });

  it("detects pending changes against the current build", () => {
    const build = { backgroundColor: "#075740", logo: { source: "x", width: 1, height: 1, sha256: "a" } };
    expect(isOsLaunchPendingChanged(build, null)).toBe(false);
    expect(isOsLaunchPendingChanged(build, { backgroundColor: "#075740", logo: null })).toBe(false);
    expect(isOsLaunchPendingChanged(build, { backgroundColor: "#0B5A24", logo: null })).toBe(true);
    expect(
      isOsLaunchPendingChanged(build, {
        backgroundColor: "#075740",
        logo: { source: "p", width: 1, height: 1, sha256: "b" },
      })
    ).toBe(true);
  });

  it("build config logo is previewable from public/", () => {
    const cfg = JSON.parse(src("config/os-launch.json"));
    expect(cfg.backgroundColor).toBe("#075740");
    expect(osLaunchBuildLogoPublicUrl(cfg.logo.source)).toBe("/images/brand/dibay-logo-mark.png");
  });
});

describe("R17-OS admin boundaries", () => {
  it("menu: Startup group under Promotion holds OS start screen only (Intro separate, not yet built)", () => {
    const menu = src("components/admin/admin-menu.ts");
    expect(menu).toContain('key: "settings-startup"');
    expect(menu).toContain('path: "/admin/platform-promotion/os-start"');
    expect(menu).not.toContain('path: "/admin/settings/os-start"');
    expect(menu).not.toContain("/admin/settings/intro");
  });

  it("no app runtime code reads OS launch admin values", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
          if (name === "__tests__" || name === "node_modules") continue;
          walk(p);
        } else if (/\.(ts|tsx)$/.test(name)) {
          const rel = p.slice(ROOT.length + 1);
          const allowed =
            rel.startsWith("lib/os-launch/") ||
            rel.startsWith("app/api/admin/os-launch/") ||
            rel === "components/admin/settings/OsLaunchAdminPage.tsx";
          const text = readFileSync(p, "utf8");
          if (!allowed && (text.includes("@/lib/os-launch") || text.includes("/api/admin/os-launch"))) {
            offenders.push(rel);
          }
        }
      }
    };
    for (const d of ["app", "components", "lib", "hooks", "contexts", "services"]) walk(resolve(ROOT, d));
    expect(offenders).toEqual([]);
  });

  it("admin copy never claims live/immediate apply", () => {
    const catalog = src("lib/i18n/catalog/admin-os-launch.ts");
    expect(catalog).toContain("다음 앱 빌드부터");
    for (const banned of ["즉시 적용", "서비스 적용", "Live Apply", "Service Apply"]) {
      expect(catalog).not.toContain(banned);
    }
  });
});
