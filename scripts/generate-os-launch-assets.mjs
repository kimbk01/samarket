#!/usr/bin/env node
/**
 * R17-OS — generate the TRUE OS start visual native resources from config/os-launch.json.
 *
 *   npm run os-launch:generate   → regenerate Android + iOS resources from config/os-launch.json
 *   npm run os-launch:pull       → copy Admin "다음 빌드 (대기)" values into config/os-launch.json
 *                                  (+ logo into public/images/os-launch/), then generate
 *
 * Writes ONLY:
 *   android/app/src/main/res/values/colors.xml          (dibay_os_bg value)
 *   android/app/src/main/res/drawable-nodpi/ic_os_logo.png
 *   ios/App/App/Base.lproj/LaunchScreen.storyboard      (background color, OsLaunchLogo size)
 *   ios/App/App/Assets.xcassets/OsLaunchLogo.imageset/*
 *   config/os-launch.json, public/images/os-launch/logo.png   (--pull only)
 *
 * Build-time only. Apps never read Admin values at runtime.
 * --check : verify the committed resources match config (no writes, exit 1 on drift).
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const CONFIG = path.join(ROOT, "config", "os-launch.json");
const COLORS_XML = path.join(ROOT, "android/app/src/main/res/values/colors.xml");
const ANDROID_LOGO = path.join(ROOT, "android/app/src/main/res/drawable-nodpi/ic_os_logo.png");
const STORYBOARD = path.join(ROOT, "ios/App/App/Base.lproj/LaunchScreen.storyboard");
const IOS_IMAGESET = path.join(ROOT, "ios/App/App/Assets.xcassets/OsLaunchLogo.imageset");
const PULLED_LOGO = "public/images/os-launch/logo.png";

const args = new Set(process.argv.slice(2));
const CHECK = args.has("--check");

function readEnvLocal() {
  const file = path.join(ROOT, ".env.local");
  const env = { ...process.env };
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

function hex(color) {
  const s = String(color).trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(s)) throw new Error(`invalid backgroundColor: ${color}`);
  return s;
}

function rgbUnit(color) {
  const n = (i) => parseInt(color.slice(i, i + 2), 16) / 255;
  return { r: n(1), g: n(3), b: n(5) };
}

async function pullFromAdmin(config) {
  const env = readEnvLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing (.env.local)");
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  const res = await fetch(
    `${url}/rest/v1/os_launch_config?id=eq.default&select=background_color,logo_storage_path,logo_sha256,updated_at`,
    { headers }
  );
  if (!res.ok) throw new Error(`os_launch_config read failed: ${res.status}`);
  const [row] = await res.json();
  if (!row) {
    console.log("[os-launch] no pending admin values — config unchanged");
    return config;
  }

  const next = { ...config, backgroundColor: hex(row.background_color) };
  if (row.logo_storage_path) {
    const img = await fetch(
      `${url}/storage/v1/object/authenticated/os-launch-assets/${row.logo_storage_path}`,
      { headers }
    );
    if (!img.ok) throw new Error(`logo download failed: ${img.status}`);
    const buf = Buffer.from(await img.arrayBuffer());
    const sha256 = createHash("sha256").update(buf).digest("hex");
    if (row.logo_sha256 && sha256 !== row.logo_sha256) throw new Error("logo sha256 mismatch");
    const meta = await sharp(buf).metadata();
    fs.mkdirSync(path.dirname(path.join(ROOT, PULLED_LOGO)), { recursive: true });
    fs.writeFileSync(path.join(ROOT, PULLED_LOGO), buf);
    next.logo = { source: PULLED_LOGO, width: meta.width, height: meta.height, sha256 };
  }
  next.appliedFromAdmin = { updatedAt: row.updated_at, sha256: row.logo_sha256 ?? null };
  return next;
}

function writeOrCheck(file, content, drift) {
  const exists = fs.existsSync(file);
  const same = exists && Buffer.compare(fs.readFileSync(file), Buffer.from(content)) === 0;
  if (same) return;
  if (CHECK) {
    drift.push(path.relative(ROOT, file));
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  console.log(`[os-launch] wrote ${path.relative(ROOT, file)}`);
}

async function main() {
  let config = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
  if (args.has("--pull")) {
    config = await pullFromAdmin(config);
    if (!CHECK) fs.writeFileSync(CONFIG, `${JSON.stringify(config, null, 2)}\n`);
  }

  const color = hex(config.backgroundColor);
  const logoPath = path.join(ROOT, config.logo.source);
  const logoBuf = fs.readFileSync(logoPath);
  const meta = await sharp(logoBuf).metadata();
  const aspect = meta.height / meta.width;
  const drift = [];

  // ── Android: color + 960px icon canvas with the logo at logoWidthRatio, centered.
  const xml = fs.readFileSync(COLORS_XML, "utf8");
  if (!/<color name="dibay_os_bg">#[0-9A-Fa-f]{6}<\/color>/.test(xml)) {
    throw new Error("colors.xml: dibay_os_bg not found");
  }
  writeOrCheck(
    COLORS_XML,
    xml.replace(/<color name="dibay_os_bg">#[0-9A-Fa-f]{6}<\/color>/, `<color name="dibay_os_bg">${color}</color>`),
    drift
  );

  const canvas = config.android.logoCanvasPx;
  const w = Math.round(canvas * config.android.logoWidthRatio);
  const h = Math.round(w * aspect);
  const androidLogo = await sharp({
    create: { width: canvas, height: canvas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: await sharp(logoBuf).resize(w, h, { fit: "fill" }).png().toBuffer(),
        left: Math.floor((canvas - w) / 2),
        top: Math.floor((canvas - h) / 2),
      },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
  if (!CHECK) writeOrCheck(ANDROID_LOGO, androidLogo, drift);

  // ── iOS: 1x/2x/3x logo + storyboard color and logo constraints.
  const pt = config.ios.logoWidthPt;
  const ptH = Math.round(pt * aspect);
  const images = [];
  for (const s of [1, 2, 3]) {
    const name = `os-launch-logo@${s}x.png`;
    const png = await sharp(logoBuf).resize(pt * s, Math.round(pt * s * aspect), { fit: "fill" }).png().toBuffer();
    if (!CHECK) writeOrCheck(path.join(IOS_IMAGESET, name), png, drift);
    images.push({ idiom: "universal", filename: name, scale: `${s}x` });
  }
  writeOrCheck(
    path.join(IOS_IMAGESET, "Contents.json"),
    JSON.stringify({ images, info: { author: "xcode", version: 1 } }, null, 2),
    drift
  );

  const { r, g, b } = rgbUnit(color);
  let sb = fs.readFileSync(STORYBOARD, "utf8");
  sb = sb.replace(
    /(<view key="view"[\s\S]*?<color key="backgroundColor" )red="[^"]*" green="[^"]*" blue="[^"]*"/,
    `$1red="${r}" green="${g}" blue="${b}"`
  );
  sb = sb.replace(/(<constraint firstAttribute="width" constant=")[0-9.]+(" id="OsL-wd-001"\/>)/, `$1${pt}$2`);
  sb = sb.replace(/(<constraint firstAttribute="height" constant=")[0-9.]+(" id="OsL-ht-001"\/>)/, `$1${ptH}$2`);
  sb = sb.replace(/<image name="OsLaunchLogo" width="[0-9.]+" height="[0-9.]+"\/>/, `<image name="OsLaunchLogo" width="${pt}" height="${ptH}"/>`);
  writeOrCheck(STORYBOARD, sb, drift);

  if (CHECK) {
    if (drift.length) {
      console.error(`[os-launch] drift vs config/os-launch.json:\n  ${drift.join("\n  ")}`);
      process.exit(1);
    }
    console.log("[os-launch] native text resources match config/os-launch.json");
    return;
  }
  console.log(`[os-launch] done — background ${color}, logo ${config.logo.source}. Next: commit, npx cap sync, native build.`);
}

main().catch((e) => {
  console.error(`[os-launch] ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
