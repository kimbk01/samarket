/**
 * @vitest-environment node
 * DIBAY INTRO — 13TH VERIFIED ZERO (static product path absence).
 */
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";

const MUST_ABSENT = [
  "lib/intro",
  "components/admin/intro",
  "components/opening-show",
  "app/admin/intro",
  "app/admin/intro-v3",
  "app/api/admin/intro",
  "app/api/intro",
  "android/app/src/main/java/com/dibay/app/intro",
  "android/app/src/main/assets/intro",
  "android/app/src/main/assets/dibay-startup.html",
  "ios/App/App/public/dibay-startup.html",
  "capacitor-www/dibay-startup.html",
  "ios/App/App/Plugins/DibayIntroAuthorityPlugin.swift",
  "ios/App/App/Plugins/DibayIntroRuntimeController.swift",
  "ios/App/App/Plugins/DibayIntroPackModel.swift",
  "ios/App/App/Plugins/DibayIntroSceneSurface.swift",
  "ios/App/App/Plugins/DibayIntroAuthorityStore.swift",
  "ios/App/App/Plugins/DibayIntroFitGeometry.swift",
  "ios/App/App/Plugins/DibayIntroMotionConstants.swift",
  "lib/startup/system-start-build-input.ts",
  "scripts/generate-system-start-build-input.mjs",
  "scripts/prove-app-intro-cut-a.mjs",
  "scripts/prove-old-intro-zero.mjs",
] as const;

describe("13th intro verified zero — product paths absent", () => {
  for (const rel of MUST_ABSENT) {
    it(`absent: ${rel}`, () => {
      expect(existsSync(rel)).toBe(false);
    });
  }
});
