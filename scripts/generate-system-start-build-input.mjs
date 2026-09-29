#!/usr/bin/env node
/**
 * Apply config/system-start.build.json → native OS System Start resources.
 * Build-bound only. Does NOT publish Live CMS / Service Apply.
 *
 * F2 identity chain (required when brand enabled):
 *   Admin Preview media → Durable SSOT mediaId → derived logoIntegrity
 *   → native/system-start/assets/logo.* bytes (sha256 match)
 *   → Android drawable + SplashScreen animated icon
 *   → iOS DibayStartupLogo.imageset + LaunchScreen image
 * mediaId alone without integrity byte match = FAIL.
 *
 * F1 timing:
 *   minVisibleMs → Android R.integer + iOS system_start_timing.json
 *   Applies to App/Cap continuation surface — NOT OS LaunchScreen/SplashScreen duration API.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const ROOT = path.resolve(import.meta.dirname, "..");
const BUILD = path.join(ROOT, "config/system-start.build.json");
const ASSET_DIR = path.join(ROOT, "native/system-start/assets");
const BUILD_INPUT = path.join(ROOT, "native/system-start/build-input.json");
const IOS_TIMING = path.join(ROOT, "ios/App/App/system_start_timing.json");
const IOS_LOGO_SET = path.join(
  ROOT,
  "ios/App/App/Assets.xcassets/DibayStartupLogo.imageset",
);
const ANDROID_LOGO = path.join(
  ROOT,
  "android/app/src/main/res/drawable-hdpi/ic_dibay_splash_logo.png",
);
const ANDROID_STYLES = path.join(
  ROOT,
  "android/app/src/main/res/values/styles.xml",
);

const ALLOWED_MIN_MS = new Set([500, 1000, 1500, 2000, 3000, 4000, 5000]);
const BRAND_SIZE_NORM = { S: 0.18, M: 0.28, L: 0.4 };
const BRAND_SIZE_PT = { S: 72, M: 112, L: 160 };

function parseHex(hex) {
  const h = String(hex || "").trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) {
    throw new Error(`invalid_system_start_color:${hex}`);
  }
  const n = parseInt(h, 16);
  return {
    hex: `#${h.toUpperCase()}`,
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
  };
}

function normalizeMinVisibleMs(raw) {
  const n = Math.round(Number(raw) || 500);
  if (ALLOWED_MIN_MS.has(n)) return n;
  let best = 500;
  let bestDist = Math.abs(n - best);
  for (const p of ALLOWED_MIN_MS) {
    const d = Math.abs(n - p);
    if (d < bestDist) {
      best = p;
      bestDist = d;
    }
  }
  return best;
}

function brandSizeNorm(raw) {
  const preset = raw?.brandSizePreset;
  if (preset === "S" || preset === "M" || preset === "L") return BRAND_SIZE_NORM[preset];
  const n = Number(raw?.logoSizeNorm);
  if (Number.isFinite(n) && n > 0) return Math.min(0.5, Math.max(0.1, n));
  return BRAND_SIZE_NORM.M;
}

function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function integrityOf(buf) {
  return `sha256:${sha256Hex(buf)}`;
}

function findLogoAsset() {
  if (!fs.existsSync(ASSET_DIR)) return null;
  for (const name of fs.readdirSync(ASSET_DIR)) {
    if (/^logo\.(png|jpg|jpeg|webp|gif)$/i.test(name)) {
      return path.join(ASSET_DIR, name);
    }
  }
  return null;
}

function resolveExpectedIntegrity(raw) {
  if (typeof raw.logoIntegrity === "string" && raw.logoIntegrity.startsWith("sha256:")) {
    return raw.logoIntegrity.toLowerCase();
  }
  const side = path.join(ASSET_DIR, "logo.integrity");
  if (fs.existsSync(side)) {
    const t = fs.readFileSync(side, "utf8").trim().toLowerCase();
    if (t.startsWith("sha256:")) return t;
  }
  return null;
}

function writeLaunchScreen(color, brandEnabled, brandSizePreset) {
  const storyboard = path.join(
    ROOT,
    "ios/App/App/Base.lproj/LaunchScreen.storyboard",
  );
  const nextBg = `<color key="backgroundColor" red="${color.r}" green="${color.g}" blue="${color.b}" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>`;
  const pt = BRAND_SIZE_PT[brandSizePreset] ?? BRAND_SIZE_PT.M;
  const brandBlock = brandEnabled
    ? `
                        <imageView opaque="NO" clipsSubviews="YES" userInteractionEnabled="NO" contentMode="scaleAspectFit" horizontalHuggingPriority="251" verticalHuggingPriority="251" image="DibayStartupLogo" translatesAutoresizingMaskIntoConstraints="NO" id="brand-logo-iv">
                            <rect key="frame" x="${(414 - pt) / 2}" y="${(896 - pt) / 2}" width="${pt}" height="${pt}"/>
                            <constraints>
                                <constraint firstAttribute="width" constant="${pt}" id="brand-w"/>
                                <constraint firstAttribute="height" constant="${pt}" id="brand-h"/>
                            </constraints>
                        </imageView>`
    : "";
  const constraints = brandEnabled
    ? `
                        <constraints>
                            <constraint firstItem="brand-logo-iv" firstAttribute="centerX" secondItem="Ze5-6b-2t3" secondAttribute="centerX" id="brand-cx"/>
                            <constraint firstItem="brand-logo-iv" firstAttribute="centerY" secondItem="Ze5-6b-2t3" secondAttribute="centerY" id="brand-cy"/>
                        </constraints>`
    : "";
  const sb = `<?xml version="1.0" encoding="UTF-8"?>
<document type="com.apple.InterfaceBuilder3.CocoaTouch.Storyboard.XIB" version="3.0" toolsVersion="21701" targetRuntime="iOS.CocoaTouch" propertyAccessControl="none" useAutolayout="YES" launchScreen="YES" useTraitCollections="YES" useSafeAreas="YES" colorMatched="YES" initialViewController="01J-lp-oVM">
    <device id="retina6_1" orientation="portrait" appearance="light"/>
    <dependencies>
        <deployment identifier="iOS"/>
        <plugIn identifier="com.apple.InterfaceBuilder.IBCocoaTouchPlugin" version="21678"/>
        <capability name="Safe area layout guides" minToolsVersion="9.0"/>
        <capability name="documents saved in the Xcode 8 format" minToolsVersion="8.0"/>
    </dependencies>
    <scenes>
        <!-- GENERATED System Start LaunchScreen — BG + optional brand asset (F2). Duration OS-owned. -->
        <scene sceneID="EHf-IW-A2E">
            <objects>
                <viewController id="01J-lp-oVM" sceneMemberID="viewController">
                    <view key="view" contentMode="scaleToFill" id="Ze5-6b-2t3">
                        <rect key="frame" x="0.0" y="0.0" width="414" height="896"/>
                        <autoresizingMask key="autoresizingMask" widthSizable="YES" heightSizable="YES"/>
                        <viewLayoutGuide key="safeArea" id="safe-area"/>
                        ${nextBg}${brandBlock}${constraints}
                    </view>
                </viewController>
                <placeholder placeholderIdentifier="IBFirstResponder" id="iYj-Kq-Ea1" userLabel="First Responder" sceneMemberID="firstResponder"/>
            </objects>
            <point key="canvasLocation" x="53" y="375"/>
        </scene>
    </scenes>
    ${
      brandEnabled
        ? `<resources>
        <image name="DibayStartupLogo" width="144" height="144"/>
    </resources>`
        : ""
    }
</document>
`;
  fs.writeFileSync(storyboard, sb);
}

function patchAndroidSplashIcon(brandEnabled) {
  let styles = fs.readFileSync(ANDROID_STYLES, "utf8");
  const icon = brandEnabled
    ? "@drawable/ic_dibay_splash_logo"
    : "@drawable/ic_splash_neutral";
  if (!/windowSplashScreenAnimatedIcon/.test(styles)) {
    throw new Error("styles_missing_windowSplashScreenAnimatedIcon");
  }
  styles = styles.replace(
    /(<item name="windowSplashScreenAnimatedIcon">)[^<]+(<\/item>)/,
    `$1${icon}$2`,
  );
  fs.writeFileSync(ANDROID_STYLES, styles);
}

function main() {
  const raw = JSON.parse(fs.readFileSync(BUILD, "utf8"));
  const color = parseHex(raw.backgroundColor);
  const brandMarkEnabled = !!raw.brandMarkEnabled && !!raw.logoMediaId;
  const minVisibleMs = normalizeMinVisibleMs(raw.minVisibleMs);
  const logoSizeNorm = brandSizeNorm(raw);
  const logoFit = "CONTAIN";
  const brandSizePreset =
    raw.brandSizePreset === "S" || raw.brandSizePreset === "M" || raw.brandSizePreset === "L"
      ? raw.brandSizePreset
      : "M";

  const androidColors = path.join(
    ROOT,
    "android/app/src/main/res/values/colors_system_start.xml",
  );
  fs.writeFileSync(
    androidColors,
    `<?xml version="1.0" encoding="utf-8"?>
<!-- GENERATED by scripts/generate-system-start-build-input.mjs — do not hand-edit. -->
<!-- System Start = OS launch surface (build-bound). Match Scene1 initial BG for seamless handoff. -->
<resources>
    <color name="dibay_system_start_background">${color.hex}</color>
</resources>
`,
  );

  const timingXml = path.join(
    ROOT,
    "android/app/src/main/res/values/system_start_timing.xml",
  );
  fs.writeFileSync(
    timingXml,
    `<?xml version="1.0" encoding="utf-8"?>
<!-- GENERATED — App/Cap CONTINUATION minVisibleMs (F1). OS splash duration ≠ this. -->
<resources>
    <integer name="dibay_system_start_min_visible_ms">${minVisibleMs}</integer>
</resources>
`,
  );

  fs.writeFileSync(
    IOS_TIMING,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        backgroundColor: color.hex,
        SYSTEM_START_MIN_VISIBLE_MS: minVisibleMs,
        appliesTo: "App_Cap_continuation",
        doesNotApplyTo: "OS_LaunchScreen_duration",
      },
      null,
      2,
    )}\n`,
  );

  const icon = path.join(
    ROOT,
    "android/app/src/main/res/drawable/ic_splash_neutral.xml",
  );
  fs.writeFileSync(
    icon,
    `<?xml version="1.0" encoding="utf-8"?>
<!--
  GENERATED by scripts/generate-system-start-build-input.mjs
  Icon slot fill = System Start BG (invisible). Used when brand asset OFF.
-->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="288dp"
    android:height="288dp"
    android:viewportWidth="288"
    android:viewportHeight="288">
    <path
        android:fillColor="${color.hex}"
        android:pathData="M0,0h288v288h-288z" />
</vector>
`,
  );

  let logoCopied = false;
  let logoIntegrity = null;
  let logoBytesProven = false;

  if (brandMarkEnabled) {
    const expected = resolveExpectedIntegrity(raw);
    if (!expected) {
      throw new Error("brand_enabled_but_logoIntegrity_missing");
    }
    const logoSrc = findLogoAsset();
    if (!logoSrc) {
      throw new Error("brand_enabled_but_logo_asset_missing");
    }
    const bytes = fs.readFileSync(logoSrc);
    const actual = integrityOf(bytes).toLowerCase();
    if (actual !== expected) {
      throw new Error(`brand_integrity_mismatch expected=${expected} actual=${actual}`);
    }
    logoIntegrity = actual;
    logoBytesProven = true;

    fs.mkdirSync(path.dirname(ANDROID_LOGO), { recursive: true });
    fs.copyFileSync(logoSrc, ANDROID_LOGO);
    logoCopied = true;

    fs.mkdirSync(IOS_LOGO_SET, { recursive: true });
    const iosLogoPath = path.join(IOS_LOGO_SET, "dibay-startup-logo.png");
    fs.copyFileSync(logoSrc, iosLogoPath);
    fs.writeFileSync(
      path.join(IOS_LOGO_SET, "Contents.json"),
      `${JSON.stringify(
        {
          images: [
            { filename: "dibay-startup-logo.png", idiom: "universal", scale: "1x" },
            { idiom: "universal", scale: "2x" },
            { idiom: "universal", scale: "3x" },
          ],
          info: { author: "xcode", version: 1 },
        },
        null,
        2,
      )}\n`,
    );
    fs.writeFileSync(
      path.join(IOS_LOGO_SET, "logo.integrity"),
      `${logoIntegrity}\n`,
    );
  }

  patchAndroidSplashIcon(brandMarkEnabled && logoCopied);
  writeLaunchScreen(color, brandMarkEnabled && logoCopied, brandSizePreset);

  const capTs = path.join(ROOT, "capacitor.config.ts");
  let cap = fs.readFileSync(capTs, "utf8");
  if (!/backgroundColor:\s*"[^"]+"/.test(cap)) {
    throw new Error("capacitor_splash_backgroundColor_missing");
  }
  cap = cap.replace(
    /(SplashScreen:\s*\{[\s\S]*?backgroundColor:\s*)"[^"]+"/,
    `$1"${color.hex}"`,
  );
  fs.writeFileSync(capTs, cap);

  const buildInput = {
    schemaVersion: 2,
    kind: "SYSTEM_START",
    updatedAt: new Date().toISOString(),
    background: {
      type: "solid",
      color: color.hex,
      imageUrl: null,
    },
    logo: {
      source: brandMarkEnabled ? "admin_media" : "none",
      mediaId: brandMarkEnabled ? raw.logoMediaId || null : null,
      integrity: logoIntegrity,
      bytesProven: logoBytesProven,
      url: null,
      fit: logoFit,
      sizeNorm: logoSizeNorm,
      brandSizePreset,
      xNorm: 0.5,
      yNorm: 0.5,
      assetCopied: logoCopied,
    },
    timing: {
      SYSTEM_START_MIN_VISIBLE_MS: minVisibleMs,
      appliesTo: "App_Cap_continuation",
      doesNotApplyTo: "OS_splash_duration",
      handoff: "max(platform_ready, configured_min_visible)",
    },
    apply: {
      mode: "APP_UPDATE_REQUIRED",
      publish: false,
      serviceApply: false,
    },
    targets: {
      android: {
        splashColorResource: "android/app/src/main/res/values/colors_system_start.xml",
        timingResource: "android/app/src/main/res/values/system_start_timing.xml",
        splashAnimatedIcon: brandMarkEnabled && logoCopied
          ? "ic_dibay_splash_logo"
          : "ic_splash_neutral",
        logoDrawableHint:
          "android/app/src/main/res/drawable-hdpi/ic_dibay_splash_logo.png",
      },
      ios: {
        launchScreenStoryboard: "ios/App/App/Base.lproj/LaunchScreen.storyboard",
        logoImageset: "ios/App/App/Assets.xcassets/DibayStartupLogo.imageset",
        timingJson: "ios/App/App/system_start_timing.json",
      },
    },
    status: {
      adminPersisted: true,
      buildInputGenerated: true,
      binaryRebuildRequired: true,
      brandBytesIntegrityMatched: brandMarkEnabled ? logoBytesProven : true,
      installedPixelsProven: false,
      note: "Build-bound. Service Apply does not update installed System Start. Pixel PASS requires installed binary Owner observation.",
    },
  };
  fs.mkdirSync(path.dirname(BUILD_INPUT), { recursive: true });
  fs.writeFileSync(BUILD_INPUT, `${JSON.stringify(buildInput, null, 2)}\n`);

  console.log(
    JSON.stringify({
      ok: true,
      backgroundColor: color.hex,
      brandMarkEnabled,
      minVisibleMs,
      logoCopied,
      logoIntegrity,
      logoBytesProven,
      wrote: [
        "android/app/src/main/res/values/colors_system_start.xml",
        "android/app/src/main/res/values/system_start_timing.xml",
        "android/app/src/main/res/drawable/ic_splash_neutral.xml",
        "android/app/src/main/res/values/styles.xml",
        "native/system-start/build-input.json",
        "ios/App/App/Base.lproj/LaunchScreen.storyboard",
        "ios/App/App/system_start_timing.json",
        "capacitor.config.ts",
      ],
      note: "Native rebuild required. Brand pixel PASS = installed binary Owner observation (NOT_PROVEN until then).",
    }),
  );
}

main();
