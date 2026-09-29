/**
 * System Start (OS splash) — build-authoritative intent.
 *
 * NOT IntroDocument / Intro Pack.
 * Admin saves desired background + logo → this shape is the repo-owned
 * build input for Android/iOS native resources.
 *
 * Installed pixels require a binary rebuild + app update.
 */

import {
  BUNDLED_STARTUP_CONFIG,
  normalizeStartupConfig,
  type StartupConfig,
} from "@/lib/startup/startup-config";

export const SYSTEM_START_BUILD_INPUT_PATH =
  "native/system-start/build-input.json" as const;

export type SystemStartBuildInputV1 = {
  schemaVersion: 1;
  kind: "SYSTEM_START";
  updatedAt: string;
  background: {
    type: "solid" | "image";
    color: string;
    imageUrl: string | null;
  };
  logo: {
    source: "default" | "uploaded";
    url: string | null;
    widthPreset: string;
    customWidthPx: number | null;
  };
  apply: {
    mode: "APP_UPDATE_REQUIRED";
    publish: false;
    serviceApply: false;
  };
  targets: {
    android: {
      splashColorResource: "android/app/src/main/res/values/colors_system_start.xml";
      splashDrawableHint: "android/app/src/main/res/drawable/splash.png";
      logoDrawableHint: "android/app/src/main/res/drawable-hdpi/ic_dibay_splash_logo.png";
    };
    ios: {
      launchScreenStoryboard: "ios/App/App/Base.lproj/LaunchScreen.storyboard";
      logoImagesetHint: "ios/App/App/Assets.xcassets/DibayStartupLogo.imageset";
      splashImagesetHint: "ios/App/App/Assets.xcassets/Splash.imageset";
    };
  };
  status: {
    adminPersisted: boolean;
    buildInputGenerated: boolean;
    binaryRebuildRequired: true;
    installedPixelsProven: false;
  };
};

export function systemStartBuildInputFromConfig(
  raw: unknown,
  opts?: { adminPersisted?: boolean; buildInputGenerated?: boolean },
): SystemStartBuildInputV1 {
  const c = normalizeStartupConfig(raw ?? BUNDLED_STARTUP_CONFIG);
  const bgType = c.background.type === "image" ? "image" : "solid";
  return {
    schemaVersion: 1,
    kind: "SYSTEM_START",
    updatedAt: c.updatedAt || new Date().toISOString(),
    background: {
      type: bgType,
      color: c.background.color || c.backgroundColor,
      imageUrl: bgType === "image" ? c.background.imageUrl : null,
    },
    logo: {
      source: c.logo.source,
      url:
        c.logo.source === "uploaded"
          ? c.logo.url
          : c.logoUrl.startsWith("http")
            ? c.logoUrl
            : null,
      widthPreset: c.logo.widthPreset,
      customWidthPx: c.logo.customWidthPx,
    },
    apply: {
      mode: "APP_UPDATE_REQUIRED",
      publish: false,
      serviceApply: false,
    },
    targets: {
      android: {
        splashColorResource:
          "android/app/src/main/res/values/colors_system_start.xml",
        splashDrawableHint: "android/app/src/main/res/drawable/splash.png",
        logoDrawableHint:
          "android/app/src/main/res/drawable-hdpi/ic_dibay_splash_logo.png",
      },
      ios: {
        launchScreenStoryboard:
          "ios/App/App/Base.lproj/LaunchScreen.storyboard",
        logoImagesetHint:
          "ios/App/App/Assets.xcassets/DibayStartupLogo.imageset",
        splashImagesetHint: "ios/App/App/Assets.xcassets/Splash.imageset",
      },
    },
    status: {
      adminPersisted: opts?.adminPersisted ?? true,
      buildInputGenerated: opts?.buildInputGenerated ?? false,
      binaryRebuildRequired: true,
      installedPixelsProven: false,
    },
  };
}

export function androidSplashColorXml(colorHex: string): string {
  const hex = /^#[0-9A-Fa-f]{6}$/.test(colorHex) ? colorHex : "#FFFCFC";
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- GENERATED from System Start Admin — do not hand-edit.
     Rebuild APK required for OS splash to show this color. -->
<resources>
    <color name="dibay_system_start_background">${hex}</color>
</resources>
`;
}

export function summarizeSystemStartDiff(
  before: StartupConfig,
  after: StartupConfig,
): { background: string; logo: string } {
  const bBg = before.background.color || before.backgroundColor;
  const aBg = after.background.color || after.backgroundColor;
  const bLogo =
    before.logo.source === "uploaded" && before.logo.url
      ? before.logo.url
      : before.logoUrl || "(기본)";
  const aLogo =
    after.logo.source === "uploaded" && after.logo.url
      ? after.logo.url
      : after.logoUrl || "(기본)";
  return {
    background: `${bBg} → ${aBg}`,
    logo: `${shortUrl(bLogo)} → ${shortUrl(aLogo)}`,
  };
}

function shortUrl(u: string): string {
  if (u.length <= 48) return u;
  return `${u.slice(0, 20)}…${u.slice(-16)}`;
}
