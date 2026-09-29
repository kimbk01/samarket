/**
 * @vitest-environment node
 * DIBAY INTRO — 13TH V0 architecture presence (replaces ZERO absence gate).
 */
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { createEmptyV0Document, validateDocumentV0 } from "@/lib/intro/contracts/document";
import { fitContentRegion, mapFrame } from "@/lib/intro/geometry/fit";
import { integrityOfCanonicalJson } from "@/lib/intro/integrity";
import { buildRuntimePackage } from "@/lib/intro/publish/service";

const MUST_PRESENT = [
  "lib/intro/contracts/document.ts",
  "lib/intro/document/service.ts",
  "lib/intro/publish/service.ts",
  "lib/intro/live/service.ts",
  "app/admin/intro/page.tsx",
  "app/api/admin/intro/documents/route.ts",
  "app/api/intro/device/live/route.ts",
  "components/admin/intro/IntroStudioPage.tsx",
  "components/admin/intro/IntroCanonicalPreview.tsx",
] as const;

const MUST_ABSENT_LEGACY = [
  "components/opening-show",
  "app/admin/intro-v3",
  "android/app/src/main/assets/dibay-startup.html",
  "ios/App/App/public/dibay-startup.html",
  "capacitor-www/dibay-startup.html",
] as const;

describe("13th intro V0 architecture", () => {
  for (const rel of MUST_PRESENT) {
    it(`present: ${rel}`, () => {
      expect(existsSync(rel)).toBe(true);
    });
  }
  for (const rel of MUST_ABSENT_LEGACY) {
    it(`legacy absent: ${rel}`, () => {
      expect(existsSync(rel)).toBe(false);
    });
  }

  it("V0 factory has owner marker + indigo bg", () => {
    const doc = createEmptyV0Document();
    expect(validateDocumentV0(doc)).toBeNull();
    expect(doc.scenes[0]?.background).toEqual({ type: "COLOR", color: "#4F46E5" });
    const text = doc.scenes[0]?.elements.find((e) => e.type === "TEXT");
    expect((text?.payload as { text: string }).text).toBe("DIBAY-13-OWNER-MARKER");
  });

  it("geometry FIT is deterministic", () => {
    const region = fitContentRegion(390, 844, 9, 16);
    expect(region.RW).toBeGreaterThan(0);
    expect(region.RH).toBeGreaterThan(0);
    const rect = mapFrame({ x: 0.08, y: 0.42, w: 0.84, h: 0.12 }, region);
    expect(rect.width).toBeCloseTo(0.84 * region.RW, 5);
  });

  it("package integrity is stable for same document", () => {
    const doc = createEmptyV0Document("t");
    // freeze random ids for integrity compare
    const fixed = {
      ...doc,
      scenes: doc.scenes.map((s) => ({
        ...s,
        id: "scene-fixed",
        elements: s.elements.map((e) => ({ ...e, id: "el-fixed" })),
      })),
    };
    const a = buildRuntimePackage({
      releaseId: "rel-a",
      packageId: "pkg-a",
      document: fixed,
    });
    const b = buildRuntimePackage({
      releaseId: "rel-a",
      packageId: "pkg-a",
      document: fixed,
    });
    expect(a.packageIntegrity).toBe(b.packageIntegrity);
    const { packageIntegrity: _drop, ...rest } = a;
    expect(integrityOfCanonicalJson(rest)).toBe(a.packageIntegrity);
  });
});
