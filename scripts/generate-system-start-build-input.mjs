#!/usr/bin/env node
/**
 * BUILD MATERIALIZER — System Start (ONE CORRECTION BATCH)
 *
 * FINAL FLOW:
 *   Durable SSOT (app_system_start_config)
 *   → fetch at native build time
 *   → immutable build snapshot (config/system-start.build.json + native/system-start/*)
 *   → Android + iOS packaged resources
 *
 * Admin Save MUST NOT call this. Production Vercel MUST NOT materialize /var/task/native.
 *
 * F2 identity when brand enabled:
 *   Durable mediaId → READY runtime bytes → sha256 integrity
 *   → Android drawable + iOS DibayStartupLogo + LaunchScreen image
 *
 * F1 timing:
 *   minVisibleMs → Android R.integer + iOS system_start_timing.json
 *   = App/Cap CONTINUATION only (OS LaunchScreen duration ≠ this).
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const BUILD = path.join(ROOT, "config/system-start.build.json");
const ASSET_DIR = path.join(ROOT, "native/system-start/assets");
const BUILD_INPUT = path.join(ROOT, "native/system-start/build-input.json");
const BUILD_SNAPSHOT = path.join(ROOT, "native/system-start/build-snapshot.json");
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

/** Overwrite Cap splash bitmaps with solid System Start color (dual-authority kill). */
function solidFillCapSplashPngs(color) {
  const targets = [];
  const resRoot = path.join(ROOT, "android/app/src/main/res");
  if (fs.existsSync(resRoot)) {
    for (const dir of fs.readdirSync(resRoot)) {
      if (!dir.startsWith("drawable")) continue;
      const p = path.join(resRoot, dir, "splash.png");
      if (fs.existsSync(p)) targets.push(p);
    }
  }
  const iosSplashDir = path.join(
    ROOT,
    "ios/App/App/Assets.xcassets/Splash.imageset",
  );
  if (fs.existsSync(iosSplashDir)) {
    for (const name of fs.readdirSync(iosSplashDir)) {
      if (!/\.png$/i.test(name)) continue;
      targets.push(path.join(iosSplashDir, name));
    }
  }
  if (targets.length === 0) return;
  const py = `
from PIL import Image
import sys
r,g,b = int(sys.argv[1],16), int(sys.argv[2],16), int(sys.argv[3],16)
for path in sys.argv[4:]:
  im = Image.open(path).convert("RGB")
  Image.new("RGB", im.size, (r,g,b)).save(path, format="PNG")
`;
  const r = color.hex.slice(1, 3);
  const g = color.hex.slice(3, 5);
  const b = color.hex.slice(5, 7);
  const res = spawnSync(
    "python3",
    ["-c", py, r, g, b, ...targets],
    { encoding: "utf8" },
  );
  if (res.status !== 0) {
    throw new Error(`cap_splash_solid_fill_failed: ${res.stderr || res.stdout}`);
  }
}

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

/** Fail-closed — no silent clamp. */
function parseMinVisibleMs(raw) {
  const n = Math.round(Number(raw));
  if (!ALLOWED_MIN_MS.has(n)) {
    throw new Error(`invalid_min_visible_ms:${raw}`);
  }
  return n;
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

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[k] == null || process.env[k] === "") process.env[k] = v;
  }
}

function supabaseEnv() {
  loadEnvFile(path.join(ROOT, ".env.local"));
  loadEnvFile(path.join(ROOT, ".env"));
  const url = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ""
  ).replace(/\/$/, "");
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    "";
  return { url, key };
}

async function sbGet(url, key, pathAndQuery) {
  const res = await fetch(`${url}/rest/v1/${pathAndQuery}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`supabase_rest_${res.status}:${pathAndQuery}`);
  }
  return res.json();
}

async function sbDownload(url, key, bucket, storagePath) {
  const res = await fetch(
    `${url}/storage/v1/object/${encodeURIComponent(bucket)}/${storagePath
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    },
  );
  if (!res.ok) {
    throw new Error(`storage_download_${res.status}:${bucket}/${storagePath}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Preferred: Durable SSOT → snapshot.
 * Fallback: SYSTEM_START_FROM_FILE=1 + existing config/system-start.build.json (local only).
 */
async function resolveBuildAuthority() {
  if (process.env.SYSTEM_START_FROM_FILE === "1" && fs.existsSync(BUILD)) {
    const raw = JSON.parse(fs.readFileSync(BUILD, "utf8"));
    return {
      source: "file",
      revision: Number(raw.version) || 1,
      backgroundColor: raw.backgroundColor,
      brandMarkEnabled: !!raw.brandMarkEnabled && !!raw.logoMediaId,
      logoMediaId: raw.logoMediaId || null,
      logoIntegrity: raw.logoIntegrity || null,
      brandSizePreset: raw.brandSizePreset || "M",
      minVisibleMs: raw.minVisibleMs,
      logoBytes: null,
    };
  }

  const { url, key } = supabaseEnv();
  if (!url || !key) {
    if (fs.existsSync(BUILD)) {
      console.warn(
        "[system-start] durable env missing — using existing build.json (dev fallback)",
      );
      process.env.SYSTEM_START_FROM_FILE = "1";
      return resolveBuildAuthority();
    }
    throw new Error("system_start_durable_fetch_unconfigured");
  }

  const rows = await sbGet(
    url,
    key,
    "app_system_start_config?id=eq.1&select=*&limit=1",
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) throw new Error("system_start_config_missing");

  const brandMarkEnabled = !!row.brand_asset_enabled && !!row.brand_asset_media_id;
  let logoIntegrity = null;
  let logoBytes = null;
  let logoExt = "png";

  if (brandMarkEnabled) {
    const mediaId = row.brand_asset_media_id;
    const mediaRows = await sbGet(
      url,
      key,
      `app_intro_media?media_id=eq.${mediaId}&select=media_id,status,current_runtime_artifact_id,mime&limit=1`,
    );
    const media = Array.isArray(mediaRows) ? mediaRows[0] : null;
    if (!media || media.status !== "READY" || !media.current_runtime_artifact_id) {
      throw new Error("brand_media_not_ready");
    }
    const artRows = await sbGet(
      url,
      key,
      `app_intro_runtime_artifacts?runtime_artifact_id=eq.${media.current_runtime_artifact_id}&select=*&limit=1`,
    );
    const art = Array.isArray(artRows) ? artRows[0] : null;
    if (!art) throw new Error("brand_runtime_artifact_missing");
    logoBytes = await sbDownload(
      url,
      key,
      art.storage_bucket || "app-intro-media",
      art.storage_path,
    );
    const actual = integrityOf(logoBytes).toLowerCase();
    const expected = String(art.integrity || "").toLowerCase();
    if (!expected.startsWith("sha256:") || actual !== expected) {
      throw new Error(
        `brand_integrity_mismatch expected=${expected} actual=${actual}`,
      );
    }
    logoIntegrity = actual;
    const fmt = String(art.format || "png").toLowerCase();
    logoExt =
      fmt === "jpeg" || fmt === "jpg"
        ? "jpg"
        : fmt === "webp"
          ? "webp"
          : fmt === "gif"
            ? "gif"
            : "png";
  }

  return {
    source: "durable",
    revision: Number(row.revision) || 1,
    backgroundColor: String(row.background_color).toUpperCase(),
    brandMarkEnabled,
    logoMediaId: brandMarkEnabled ? row.brand_asset_media_id : null,
    logoIntegrity,
    brandSizePreset: row.brand_size_preset || "M",
    minVisibleMs: row.min_visible_ms,
    logoBytes,
    logoExt,
  };
}

function writeLaunchScreen(color, brandEnabled, brandSizePreset) {
  const storyboard = path.join(
    ROOT,
    "ios/App/App/Base.lproj/LaunchScreen.storyboard",
  );
  const pt = BRAND_SIZE_PT[brandSizePreset] ?? BRAND_SIZE_PT.M;
  const brandInner = brandEnabled
    ? `
                        <subviews>
                        <imageView opaque="NO" clipsSubviews="YES" userInteractionEnabled="NO" contentMode="scaleAspectFit" horizontalHuggingPriority="251" verticalHuggingPriority="251" image="DibayStartupLogo" translatesAutoresizingMaskIntoConstraints="NO" id="brand-logo-iv">
                            <rect key="frame" x="${(414 - pt) / 2}" y="${(896 - pt) / 2}" width="${pt}" height="${pt}"/>
                            <constraints>
                                <constraint firstAttribute="width" constant="${pt}" id="brand-w"/>
                                <constraint firstAttribute="height" constant="${pt}" id="brand-h"/>
                            </constraints>
                        </imageView>
                        </subviews>
                        <constraints>
                            <constraint firstItem="brand-logo-iv" firstAttribute="centerX" secondItem="Ze5-6b-2t3" secondAttribute="centerX" id="brand-cx"/>
                            <constraint firstItem="brand-logo-iv" firstAttribute="centerY" secondItem="Ze5-6b-2t3" secondAttribute="centerY" id="brand-cy"/>
                        </constraints>`
    : "";
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<document type="com.apple.InterfaceBuilder3.CocoaTouch.Storyboard.XIB" version="3.0" toolsVersion="21701" targetRuntime="iOS.CocoaTouch" propertyAccessControl="none" useAutolayout="YES" launchScreen="YES" useTraitCollections="YES" useSafeAreas="YES" colorMatched="YES" initialViewController="01J-lp-oVM">
    <device id="retina6_1" orientation="portrait" appearance="light"/>
    <dependencies>
        <deployment identifier="iOS"/>
        <plugIn identifier="com.apple.InterfaceBuilder.IBCocoaTouchPlugin" version="21678"/>
        <capability name="Safe area layout guides" minToolsVersion="9.0"/>
        <capability name="documents saved in the Xcode 8 format" minToolsVersion="8.0"/>
    </dependencies>
    <scenes>
        <!-- GENERATED System Start LaunchScreen — BG + optional brand (build materializer). -->
        <scene sceneID="EHf-IW-A2E">
            <objects>
                <viewController id="01J-lp-oVM" sceneMemberID="viewController">
                    <view key="view" contentMode="scaleToFill" id="Ze5-6b-2t3">
                        <rect key="frame" x="0.0" y="0.0" width="414" height="896"/>
                        <autoresizingMask key="autoresizingMask" widthSizable="YES" heightSizable="YES"/>
                        <viewLayoutGuide key="safeArea" id="safe-area"/>${brandInner}
                        <color key="backgroundColor" red="${color.r}" green="${color.g}" blue="${color.b}" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>
                    </view>
                </viewController>
                <placeholder placeholderIdentifier="IBFirstResponder" id="iYj-Kq-Ea1" userLabel="First Responder" sceneMemberID="firstResponder"/>
            </objects>
            <point key="canvasLocation" x="53" y="375"/>
        </scene>
    </scenes>
    ${brandEnabled ? `<resources><image name="DibayStartupLogo" width="${pt}" height="${pt}"/></resources>` : ""}
</document>
`;
  fs.writeFileSync(storyboard, xml);
}

function patchAndroidSplashIcon(useLogo) {
  let styles = fs.readFileSync(ANDROID_STYLES, "utf8");
  const icon = useLogo ? "@drawable/ic_dibay_splash_logo" : "@drawable/ic_splash_neutral";
  styles = styles.replace(
    /(<item name="windowSplashScreenAnimatedIcon">)[^<]+(<\/item>)/,
    `$1${icon}$2`,
  );
  fs.writeFileSync(ANDROID_STYLES, styles);
}

function patchCapacitorConfig(colorHex) {
  const capTs = path.join(ROOT, "capacitor.config.ts");
  let cap = fs.readFileSync(capTs, "utf8");
  if (!/SplashScreen:\s*\{/.test(cap)) {
    throw new Error("capacitor_splash_block_missing");
  }
  // Continuation mount sentinel: non-zero so Cap showOnLaunch mounts LaunchScreen clone.
  // Lifetime ≠ this number — hide = Intro first frame ∧ minVisibleMs (native).
  cap = cap.replace(
    /(SplashScreen:\s*\{[\s\S]*?launchShowDuration:\s*)\d+/,
    `$1${1}`,
  );
  cap = cap.replace(
    /(SplashScreen:\s*\{[\s\S]*?backgroundColor:\s*)"[^"]+"/,
    `$1"${colorHex}"`,
  );
  // Root WKWebView background — must never default to systemBackground white at startup.
  if (/^\s*backgroundColor:/m.test(cap)) {
    cap = cap.replace(
      /(^\s*backgroundColor:\s*)"[^"]+"/m,
      `$1"${colorHex}"`,
    );
  } else {
    cap = cap.replace(
      /(const config: CapacitorConfig = \{)/,
      `$1\n  backgroundColor: "${colorHex}",`,
    );
  }
  fs.writeFileSync(capTs, cap);

  const splashBlock = {
    launchAutoHide: false,
    launchShowDuration: 1,
    launchFadeOutDuration: 0,
    backgroundColor: colorHex,
    androidSplashResourceName: "splash",
  };
  for (const capJson of [
    path.join(ROOT, "ios/App/App/capacitor.config.json"),
    path.join(ROOT, "android/app/src/main/assets/capacitor.config.json"),
  ]) {
    if (!fs.existsSync(capJson)) continue;
    const j = JSON.parse(fs.readFileSync(capJson, "utf8"));
    j.backgroundColor = colorHex;
    j.plugins = j.plugins || {};
    j.plugins.SplashScreen = {
      ...(j.plugins.SplashScreen || {}),
      ...splashBlock,
    };
    fs.writeFileSync(capJson, `${JSON.stringify(j, null, "\t")}\n`);
  }
}

async function main() {
  const auth = await resolveBuildAuthority();
  const color = parseHex(auth.backgroundColor);
  const brandMarkEnabled = !!auth.brandMarkEnabled && !!auth.logoMediaId;
  const minVisibleMs = parseMinVisibleMs(auth.minVisibleMs);
  const brandSizePreset =
    auth.brandSizePreset === "S" ||
    auth.brandSizePreset === "M" ||
    auth.brandSizePreset === "L"
      ? auth.brandSizePreset
      : "M";
  const logoSizeNorm = brandSizeNorm({
    brandSizePreset,
    logoSizeNorm: BRAND_SIZE_NORM[brandSizePreset],
  });
  const logoFit = "CONTAIN";
  const buildIdentity = `ss_r${auth.revision}_${color.hex.replace("#", "")}_${
    brandMarkEnabled ? (auth.logoIntegrity || "brand").slice(0, 18) : "nobrand"
  }_${minVisibleMs}`;

  // Persist durable-derived build JSON (snapshot authority for this build).
  const derived = {
    version: auth.revision,
    backgroundColor: color.hex,
    matchScene1Appearance: false,
    brandMarkEnabled,
    logoMediaId: auth.logoMediaId,
    logoIntegrity: auth.logoIntegrity,
    brandSizePreset,
    logoFit,
    logoSizeNorm,
    logoXNorm: 0.5,
    logoYNorm: 0.5,
    minVisibleMs,
    buildIdentity,
    source: auth.source,
    note:
      "BUILD SNAPSHOT from durable app_system_start_config. Not Admin Production FS write. minVisibleMs = App/Cap continuation only.",
  };
  fs.mkdirSync(path.dirname(BUILD), { recursive: true });
  fs.writeFileSync(BUILD, `${JSON.stringify(derived, null, 2)}\n`, "utf8");

  const androidColors = path.join(
    ROOT,
    "android/app/src/main/res/values/colors_system_start.xml",
  );
  fs.writeFileSync(
    androidColors,
    `<?xml version="1.0" encoding="utf-8"?>
<!-- GENERATED by scripts/generate-system-start-build-input.mjs — do not hand-edit. -->
<resources>
    <color name="dibay_system_start_background">${color.hex}</color>
</resources>
`,
  );

  // Cap SplashScreen androidSplashResourceName=splash — must match SSOT color (never white/stale).
  solidFillCapSplashPngs(color);

  const timingXml = path.join(
    ROOT,
    "android/app/src/main/res/values/system_start_timing.xml",
  );
  fs.writeFileSync(
    timingXml,
    `<?xml version="1.0" encoding="utf-8"?>
<!-- GENERATED — App/Cap CONTINUATION minVisibleMs. OS splash duration ≠ this. -->
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
        buildIdentity,
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
<!-- GENERATED — icon slot fill = System Start BG when brand OFF. -->
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
  let logoIntegrity = auth.logoIntegrity;
  let logoBytesProven = false;

  fs.mkdirSync(ASSET_DIR, { recursive: true });
  let stagedLogoPath = null;
  if (brandMarkEnabled && !auth.logoBytes) {
    stagedLogoPath =
      fs
        .readdirSync(ASSET_DIR)
        .map((n) => path.join(ASSET_DIR, n))
        .find((p) => /^logo\.(png|jpg|jpeg|webp|gif)$/i.test(path.basename(p))) ||
      null;
  }

  if (brandMarkEnabled) {
    let bytes = auth.logoBytes;
    if (!bytes) {
      if (!stagedLogoPath || !fs.existsSync(stagedLogoPath)) {
        throw new Error(
          "brand_enabled_but_logo_bytes_missing — durable fetch required or stage logo.* before generate",
        );
      }
      bytes = fs.readFileSync(stagedLogoPath);
      if (!logoIntegrity) {
        const side = path.join(ASSET_DIR, "logo.integrity");
        if (fs.existsSync(side)) {
          logoIntegrity = fs.readFileSync(side, "utf8").trim().toLowerCase();
        }
      }
    }
    // Clear old logo.* then rewrite from proven bytes.
    for (const name of fs.readdirSync(ASSET_DIR)) {
      if (name.startsWith("logo.")) fs.unlinkSync(path.join(ASSET_DIR, name));
    }
    const actual = integrityOf(bytes).toLowerCase();
    const expected = String(logoIntegrity || "").toLowerCase();
    if (!expected.startsWith("sha256:") || actual !== expected) {
      throw new Error(
        `brand_integrity_mismatch expected=${expected} actual=${actual}`,
      );
    }
    logoIntegrity = actual;
    logoBytesProven = true;
    const ext = auth.logoExt || "png";
    const fileName = `logo.${ext}`;
    fs.writeFileSync(path.join(ASSET_DIR, fileName), bytes);
    fs.writeFileSync(
      path.join(ASSET_DIR, "logo.integrity"),
      `${logoIntegrity}\n`,
      "utf8",
    );

    fs.mkdirSync(path.dirname(ANDROID_LOGO), { recursive: true });
    fs.writeFileSync(ANDROID_LOGO, bytes);
    logoCopied = true;

    fs.mkdirSync(IOS_LOGO_SET, { recursive: true });
    const iosLogoPath = path.join(IOS_LOGO_SET, "dibay-startup-logo.png");
    fs.writeFileSync(iosLogoPath, bytes);
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

  if (!brandMarkEnabled) {
    for (const name of fs.readdirSync(ASSET_DIR)) {
      if (name.startsWith("logo.")) fs.unlinkSync(path.join(ASSET_DIR, name));
    }
    if (fs.existsSync(ANDROID_LOGO)) fs.unlinkSync(ANDROID_LOGO);
    if (fs.existsSync(IOS_LOGO_SET)) {
      for (const name of fs.readdirSync(IOS_LOGO_SET)) {
        if (name === "Contents.json") continue;
        fs.unlinkSync(path.join(IOS_LOGO_SET, name));
      }
      fs.writeFileSync(
        path.join(IOS_LOGO_SET, "Contents.json"),
        `${JSON.stringify(
          {
            images: [
              { idiom: "universal", scale: "1x" },
              { idiom: "universal", scale: "2x" },
              { idiom: "universal", scale: "3x" },
            ],
            info: { author: "xcode", version: 1 },
          },
          null,
          2,
        )}\n`,
      );
    }
  }

  patchAndroidSplashIcon(brandMarkEnabled && logoCopied);
  writeLaunchScreen(color, brandMarkEnabled && logoCopied, brandSizePreset);
  patchCapacitorConfig(color.hex);

  const materializedAt = new Date().toISOString();
  const snapshot = {
    schemaVersion: 1,
    kind: "SYSTEM_START_BUILD_SNAPSHOT",
    systemStartRevision: auth.revision,
    background: color.hex,
    brandEnabled: brandMarkEnabled,
    brandMediaRef: auth.logoMediaId,
    brandAssetIntegrity: logoIntegrity,
    brandSize: brandSizePreset,
    minVisibleMs,
    materializedAt,
    buildIdentity,
    source: auth.source,
  };
  fs.mkdirSync(path.dirname(BUILD_SNAPSHOT), { recursive: true });
  fs.writeFileSync(BUILD_SNAPSHOT, `${JSON.stringify(snapshot, null, 2)}\n`);

  const buildInput = {
    schemaVersion: 3,
    kind: "SYSTEM_START",
    updatedAt: materializedAt,
    buildIdentity,
    background: {
      type: "solid",
      color: color.hex,
      imageUrl: null,
    },
    logo: {
      source: brandMarkEnabled ? "durable_media" : "none",
      mediaId: brandMarkEnabled ? auth.logoMediaId || null : null,
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
      handoff: "max(intro_first_frame_ready, configured_min_visible)",
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
      },
      ios: {
        launchScreenStoryboard: "ios/App/App/Base.lproj/LaunchScreen.storyboard",
        logoImageset: "ios/App/App/Assets.xcassets/DibayStartupLogo.imageset",
        timingJson: "ios/App/App/system_start_timing.json",
      },
    },
    status: {
      durableSource: auth.source,
      buildInputGenerated: true,
      binaryRebuildRequired: true,
      brandBytesIntegrityMatched: brandMarkEnabled ? logoBytesProven : true,
      installedPixelsProven: false,
      note: "Build-bound. Service Apply does not update installed System Start.",
    },
  };
  fs.writeFileSync(BUILD_INPUT, `${JSON.stringify(buildInput, null, 2)}\n`);

  console.log(
    JSON.stringify({
      ok: true,
      source: auth.source,
      revision: auth.revision,
      backgroundColor: color.hex,
      brandMarkEnabled,
      minVisibleMs,
      logoCopied,
      logoIntegrity,
      logoBytesProven,
      buildIdentity,
      wrote: [
        "config/system-start.build.json",
        "native/system-start/build-snapshot.json",
        "native/system-start/build-input.json",
        "android/app/src/main/res/values/colors_system_start.xml",
        "android/app/src/main/res/values/system_start_timing.xml",
        "ios/App/App/system_start_timing.json",
        "ios/App/App/Base.lproj/LaunchScreen.storyboard",
        "capacitor.config.ts",
      ],
    }),
  );
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e?.message || e) }));
  process.exit(1);
});
