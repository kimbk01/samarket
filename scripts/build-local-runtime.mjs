#!/usr/bin/env node
/**
 * Build Local Runtime React AppShell bundle (esbuild) + HTML entry.
 * Default: Local Runtime is product primary (Option A cutover).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

function resolveOrigin(argv) {
  const flag = argv.find((a) => a.startsWith("--origin="));
  if (flag) return flag.slice("--origin=".length).replace(/\/$/, "");
  return (
    process.env.CAPACITOR_SERVER_URL?.trim().replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") ||
    "https://samarket.vercel.app"
  );
}

function encodeLogoDataUri() {
  const logoPath = path.join(ROOT, "public/images/brand/dibay-app-icon-180.png");
  const buf = fs.readFileSync(logoPath);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

function loadEnvKey(name) {
  return (process.env[name] ?? "").trim();
}

async function buildReactBundle(outfile) {
  const esbuild = require("esbuild");
  fs.mkdirSync(path.dirname(outfile), { recursive: true });
  await esbuild.build({
    entryPoints: [path.join(ROOT, "components/startup/local-runtime/LocalRuntimeApp.tsx")],
    bundle: true,
    platform: "browser",
    format: "iife",
    outfile,
    jsx: "automatic",
    logLevel: "silent",
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify(loadEnvKey("NEXT_PUBLIC_SUPABASE_URL")),
      "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": JSON.stringify(
        loadEnvKey("NEXT_PUBLIC_SUPABASE_ANON_KEY")
      ),
    },
    alias: {
      "@/lib": path.join(ROOT, "lib"),
      "@/components": path.join(ROOT, "components"),
    },
    // Next-only modules must not appear in Local Runtime.
    external: [],
  });
}

async function bundleMarkupModule() {
  const esbuild = require("esbuild");
  const outfile = path.join(ROOT, ".qa-logs/.tmp-local-runtime-markup.mjs");
  fs.mkdirSync(path.dirname(outfile), { recursive: true });
  await esbuild.build({
    entryPoints: [path.join(ROOT, "lib/startup/local-runtime-markup.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    logLevel: "silent",
    alias: { "@/lib": path.join(ROOT, "lib") },
  });
  return import(pathToFileURL(outfile).href);
}

async function main() {
  // Cutover default: Local Runtime is ON unless explicitly forced off.
  const forceLegacy = ["0", "false", "off", "legacy"].includes(
    (process.env.DIBAY_LOCAL_RUNTIME ?? "1").trim().toLowerCase()
  );
  const localOn = !forceLegacy;

  const origin = resolveOrigin(process.argv);
  const logoSrc = encodeLogoDataUri();

  const assetDirs = [
    path.join(ROOT, "capacitor-www/local-runtime/assets"),
    path.join(ROOT, "android/app/src/main/assets/local-runtime/assets"),
    path.join(ROOT, "ios/App/App/public/local-runtime/assets"),
  ];
  for (const dir of assetDirs) {
    await buildReactBundle(path.join(dir, "local-runtime-app.js"));
    console.log("[build-local-runtime] wrote", path.relative(ROOT, path.join(dir, "local-runtime-app.js")));
  }

  const mod = await bundleMarkupModule();
  const html = mod.buildLocalRuntimeDocumentHtml({
    remoteApiOrigin: origin,
    logoSrc,
    supabaseUrl: loadEnvKey("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: loadEnvKey("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    reactBundleSrc: "./assets/local-runtime-app.js",
    lang: "ko",
  });

  if (html.includes("beginHandoffCover") || html.includes("__dibay-startup")) {
    console.error("[build-local-runtime] Hybrid markers must not appear");
    process.exit(1);
  }
  if (!html.includes("__DIBAY_LOCAL_RUNTIME__")) {
    console.error("[build-local-runtime] missing local runtime flag");
    process.exit(1);
  }

  const htmlTargets = [
    path.join(ROOT, "capacitor-www/local-runtime/index.html"),
    path.join(ROOT, "android/app/src/main/assets/local-runtime/index.html"),
    path.join(ROOT, "ios/App/App/public/local-runtime/index.html"),
  ];
  for (const t of htmlTargets) {
    fs.mkdirSync(path.dirname(t), { recursive: true });
    fs.writeFileSync(t, html, "utf8");
    console.log("[build-local-runtime] wrote", path.relative(ROOT, t));
  }

  const mode = { localRuntime: localOn, legacyRemoteRuntime: !localOn };
  const modeJson = `${JSON.stringify(mode, null, 2)}\n`;
  for (const t of [
    path.join(ROOT, "capacitor-www/dibay-runtime-mode.json"),
    path.join(ROOT, "android/app/src/main/assets/dibay-runtime-mode.json"),
    path.join(ROOT, "ios/App/App/public/dibay-runtime-mode.json"),
  ]) {
    fs.writeFileSync(t, modeJson, "utf8");
  }
  console.log("[build-local-runtime] mode", mode);

  // Product cutover: Local Runtime owns Cap webDir index when localOn.
  if (localOn) {
    fs.writeFileSync(path.join(ROOT, "capacitor-www/index.html"), html, "utf8");
    // Mirror assets next to index for Cap local server.
    const wwwAssets = path.join(ROOT, "capacitor-www/assets");
    fs.mkdirSync(wwwAssets, { recursive: true });
    fs.copyFileSync(
      path.join(ROOT, "capacitor-www/local-runtime/assets/local-runtime-app.js"),
      path.join(wwwAssets, "local-runtime-app.js")
    );
    // Cap serves index at / — bundle path ./assets/...
    const indexHtml = html.replace("./assets/local-runtime-app.js", "./assets/local-runtime-app.js");
    fs.writeFileSync(path.join(ROOT, "capacitor-www/index.html"), indexHtml, "utf8");
    console.log("[build-local-runtime] cutover: capacitor-www/index.html = Local Runtime");
  }
}

main().catch((err) => {
  console.error("[build-local-runtime] failed", err);
  process.exit(1);
});
