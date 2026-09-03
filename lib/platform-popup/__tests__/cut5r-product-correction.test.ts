/**
 * @vitest-environment node
 * CUT 5-R — Admin creative pixel SSOT + surface radio + single renderer contracts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  DIBAY_CANONICAL_POPUP_CREATIVE_SIZE,
  assertDibayCanonicalPopupCreativeSizeIs3625,
} from "@/lib/platform-popup/creative-pixel-ssot";
import {
  centerCropBoxTo3625,
  isPlatformPopupCreativeRatioOk,
} from "@/lib/platform-popup/creative-pipeline-geometry";
import {
  PLATFORM_POPUP_ADMIN_SURFACE_MODE_OPTIONS,
  adminSurfacesFromDb,
  adminTargetModeFromSurfaces,
  normalizeAdminSurfaceSelection,
  surfacesFromAdminSelection,
  surfacesFromAdminTargetMode,
  toggleAdminSurfaceSelection,
} from "@/lib/platform-popup/admin-surface-target-mode";
import { resolveDibaySurface } from "@/lib/platform-popup/resolve-dibay-surface";
import { platformPopupSurfaceMatches } from "@/lib/platform-popup/surfaces";
import { PLATFORM_POPUP_CREATIVE_ASPECT } from "@/lib/platform-popup/types";
import { PLATFORM_POPUP_TABLET_MAX_WIDTH_PX } from "@/lib/platform-popup/popup-geometry-tokens";

const ROOT = process.cwd();
function readRepo(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("CUT 5-R creative pixel SSOT", () => {
  it("canonical size is exactly 36:25", () => {
    expect(assertDibayCanonicalPopupCreativeSizeIs3625()).toBe(true);
    expect(DIBAY_CANONICAL_POPUP_CREATIVE_SIZE.width).toBe(1440);
    expect(DIBAY_CANONICAL_POPUP_CREATIVE_SIZE.height).toBe(1000);
    expect(
      DIBAY_CANONICAL_POPUP_CREATIVE_SIZE.width / DIBAY_CANONICAL_POPUP_CREATIVE_SIZE.height
    ).toBeCloseTo(PLATFORM_POPUP_CREATIVE_ASPECT.w / PLATFORM_POPUP_CREATIVE_ASPECT.h, 5);
  });

  it("wrong ratio is detected; center crop yields 36:25 box", () => {
    expect(isPlatformPopupCreativeRatioOk(1200, 800)).toBe(false);
    const crop = centerCropBoxTo3625(1200, 800);
    expect(isPlatformPopupCreativeRatioOk(crop.width, crop.height)).toBe(true);
  });

  it("exact 36:25 passes without crop", () => {
    expect(isPlatformPopupCreativeRatioOk(1440, 1000)).toBe(true);
    expect(isPlatformPopupCreativeRatioOk(720, 500)).toBe(true);
  });
});

describe("CUT 5-R admin surface multi-select mapping", () => {
  it("exposes GLOBAL + six domains", () => {
    expect(PLATFORM_POPUP_ADMIN_SURFACE_MODE_OPTIONS.map((o) => o.mode)).toEqual([
      "GLOBAL",
      "COMMUNITY",
      "TRADE",
      "DELIVERY",
      "DELIVERY_OWNER",
      "ADMIN",
      "MYPAGE",
    ]);
    expect(PLATFORM_POPUP_ADMIN_SURFACE_MODE_OPTIONS.map((o) => o.labelKo)).toEqual([
      "전체 — 커뮤니티·거래·배달·배달 오너·어드민·내정보",
      "커뮤니티",
      "거래",
      "배달",
      "배달 오너",
      "어드민",
      "내정보",
    ]);
  });

  it("maps single mode → surfaces (compat)", () => {
    expect(surfacesFromAdminTargetMode("GLOBAL")).toEqual(["GLOBAL"]);
    expect(surfacesFromAdminTargetMode("DELIVERY")).toEqual(["DELIVERY"]);
    expect(surfacesFromAdminTargetMode("DELIVERY_OWNER")).toEqual(["DELIVERY_OWNER"]);
    expect(surfacesFromAdminTargetMode("ADMIN")).toEqual(["ADMIN"]);
    expect(surfacesFromAdminTargetMode("COMMUNITY")).toEqual(["COMMUNITY"]);
    expect(surfacesFromAdminTargetMode("TRADE")).toEqual(["TRADE"]);
    expect(surfacesFromAdminTargetMode("MYPAGE")).toEqual(["MYPAGE"]);
  });

  it("multi-select keeps domains; GLOBAL is exclusive", () => {
    expect(surfacesFromAdminSelection(["TRADE", "DELIVERY"])).toEqual(["TRADE", "DELIVERY"]);
    expect(surfacesFromAdminSelection(["GLOBAL", "TRADE"])).toEqual(["GLOBAL"]);
    expect(toggleAdminSurfaceSelection(["GLOBAL"], "TRADE", true)).toEqual(["TRADE"]);
    expect(toggleAdminSurfaceSelection(["TRADE"], "COMMUNITY", true)).toEqual([
      "COMMUNITY",
      "TRADE",
    ]);
    expect(toggleAdminSurfaceSelection(["TRADE", "COMMUNITY"], "TRADE", false)).toEqual([
      "COMMUNITY",
    ]);
    expect(toggleAdminSurfaceSelection(["TRADE"], "TRADE", false)).toEqual(["GLOBAL"]);
    expect(normalizeAdminSurfaceSelection([])).toEqual(["GLOBAL"]);
  });

  it("hydrates DB rows → selection (preserves multi)", () => {
    expect(adminSurfacesFromDb(["GLOBAL"])).toEqual(["GLOBAL"]);
    expect(adminSurfacesFromDb(["DELIVERY"])).toEqual(["DELIVERY"]);
    expect(adminSurfacesFromDb(["GLOBAL", "TRADE"])).toEqual(["GLOBAL"]);
    expect(adminSurfacesFromDb(["TRADE", "DELIVERY"])).toEqual(["TRADE", "DELIVERY"]);
    expect(adminSurfacesFromDb([])).toEqual(["GLOBAL"]);
    expect(adminTargetModeFromSurfaces(["TRADE", "DELIVERY"])).toBe("TRADE");
  });

  it("selected surfaces match resolveDibaySurface page paths", () => {
    const cases: Array<{
      surface: "COMMUNITY" | "TRADE" | "DELIVERY" | "DELIVERY_OWNER" | "ADMIN" | "MYPAGE";
      path: string;
    }> = [
      { surface: "COMMUNITY", path: "/philife" },
      { surface: "COMMUNITY", path: "/community" },
      { surface: "TRADE", path: "/market" },
      { surface: "TRADE", path: "/post/abc" },
      { surface: "TRADE", path: "/write" },
      { surface: "DELIVERY", path: "/stores" },
      { surface: "DELIVERY", path: "/delivery" },
      { surface: "DELIVERY_OWNER", path: "/stores/owner" },
      { surface: "DELIVERY_OWNER", path: "/my/business" },
      { surface: "ADMIN", path: "/admin" },
      { surface: "ADMIN", path: "/admin/platform-popup" },
      { surface: "MYPAGE", path: "/mypage" },
      { surface: "MYPAGE", path: "/my" },
    ];
    for (const c of cases) {
      expect(resolveDibaySurface(c.path)).toBe(c.surface);
      expect(platformPopupSurfaceMatches([c.surface], c.surface)).toBe(true);
      expect(platformPopupSurfaceMatches(["GLOBAL"], c.surface)).toBe(true);
    }
    expect(platformPopupSurfaceMatches(["TRADE", "DELIVERY"], "COMMUNITY")).toBe(false);
    expect(platformPopupSurfaceMatches(["TRADE", "COMMUNITY"], "TRADE")).toBe(true);
    expect(platformPopupSurfaceMatches(["TRADE", "COMMUNITY"], "DELIVERY")).toBe(false);
  });
});

describe("CUT 5-R file contracts", () => {
  it("Admin detail uses multi-select + PC load + crop preview + DibayPopupAd", () => {
    const detail = readRepo("components/admin/platform-popup/AdminPlatformPopupDetailWorkspace.tsx");
    expect(detail).toContain("이미지 불러오기");
    expect(detail).toContain("data-admin-popup-creative-spec");
    expect(detail).toContain("data-admin-popup-surface-select");
    expect(detail).toContain('type={isGlobal ? "radio" : "checkbox"}');
    expect(detail).toContain("toggleAdminSurfaceSelection");
    expect(detail).toContain("surfacesFromAdminSelection");
    expect(detail).toContain("buildPlatformPopupCenterCropPreviewUrl");
    expect(detail).toContain("DIBAY_CANONICAL_POPUP_CREATIVE_SIZE");
  });

  it("Admin preview phone/tablet only; uses DibayPopupAd; no landscape conversion UI", () => {
    const preview = readRepo("components/admin/platform-popup/AdminPlatformPopupPreview.tsx");
    expect(preview).toContain("DibayPopupAd");
    expect(preview).toContain("휴대폰");
    expect(preview).toContain("태블릿");
    expect(preview).not.toContain('"landscape"');
    expect(preview).toContain("PLATFORM_POPUP_TABLET_MAX_WIDTH_PX");
  });

  it("one DibayPopupAd renderer; tablet max width token unchanged", () => {
    expect(existsSync(join(ROOT, "components/platform-popup/DibayPopupAd.tsx"))).toBe(true);
    expect(existsSync(join(ROOT, "components/platform-popup/DibayPopupAdMobile.tsx"))).toBe(false);
    expect(PLATFORM_POPUP_TABLET_MAX_WIDTH_PX).toBe(480);
  });

  it("admin creative route uses canonical pipeline (no silent-only crop)", () => {
    const route = readRepo(
      "app/api/admin/platform-popup-campaigns/[campaignId]/creative/route.ts"
    );
    expect(route).toContain("processPlatformPopupCreativeToCanonical");
    expect(route).toContain("DIBAY_CANONICAL_POPUP_CREATIVE_SIZE");
    expect(route).toContain("needs_crop");
  });
});
