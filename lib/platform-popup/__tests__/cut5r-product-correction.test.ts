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
  adminTargetModeFromSurfaces,
  surfacesFromAdminTargetMode,
} from "@/lib/platform-popup/admin-surface-target-mode";
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

describe("CUT 5-R admin surface radio mapping", () => {
  it("exposes exactly seven human modes", () => {
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

  it("maps radio → single surface row", () => {
    expect(surfacesFromAdminTargetMode("GLOBAL")).toEqual(["GLOBAL"]);
    expect(surfacesFromAdminTargetMode("DELIVERY")).toEqual(["DELIVERY"]);
    expect(surfacesFromAdminTargetMode("DELIVERY_OWNER")).toEqual(["DELIVERY_OWNER"]);
    expect(surfacesFromAdminTargetMode("ADMIN")).toEqual(["ADMIN"]);
    expect(surfacesFromAdminTargetMode("COMMUNITY")).toEqual(["COMMUNITY"]);
    expect(surfacesFromAdminTargetMode("TRADE")).toEqual(["TRADE"]);
    expect(surfacesFromAdminTargetMode("MYPAGE")).toEqual(["MYPAGE"]);
  });

  it("hydrates DB rows → single radio mode", () => {
    expect(adminTargetModeFromSurfaces(["GLOBAL"])).toBe("GLOBAL");
    expect(adminTargetModeFromSurfaces(["DELIVERY"])).toBe("DELIVERY");
    expect(adminTargetModeFromSurfaces(["GLOBAL", "TRADE"])).toBe("GLOBAL");
    expect(adminTargetModeFromSurfaces(["TRADE", "DELIVERY"])).toBe("TRADE");
    expect(adminTargetModeFromSurfaces([])).toBe("GLOBAL");
  });
});

describe("CUT 5-R file contracts", () => {
  it("Admin detail uses radio + PC load + crop preview + DibayPopupAd", () => {
    const detail = readRepo("components/admin/platform-popup/AdminPlatformPopupDetailWorkspace.tsx");
    expect(detail).toContain("이미지 불러오기");
    expect(detail).toContain("data-admin-popup-creative-spec");
    expect(detail).toContain("data-admin-popup-surface-radio");
    expect(detail).toContain("type=\"radio\"");
    expect(detail).not.toMatch(/PLATFORM_POPUP_TARGET_SURFACES\.map/);
    expect(detail).toContain("buildPlatformPopupCenterCropPreviewUrl");
    expect(detail).toContain("DIBAY_CANONICAL_POPUP_CREATIVE_SIZE");
    expect(detail).toContain("surfacesFromAdminTargetMode");
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
