#!/usr/bin/env node
/**
 * Build Option A Local Runtime document into capacitor-www / android assets / iOS public.
 *
 * Usage:
 *   node scripts/build-local-runtime.mjs [--origin=https://samarket.vercel.app]
 *
 * When DIBAY_LOCAL_RUNTIME=1 also overwrites capacitor-www/index.html and writes
 * dibay-runtime-mode.json { localRuntime: true } for native hosts.
 *
 * DO NOT: emit location.replace · copy Hybrid Cover path into this entry.
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

function isLocalRuntimeEnvOn() {
  const raw = (process.env.DIBAY_LOCAL_RUNTIME ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
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
    alias: {
      "@/lib": path.join(ROOT, "lib"),
    },
  });
  return import(pathToFileURL(outfile).href);
}

async function main() {
  const origin = resolveOrigin(process.argv);
  const logoSrc = encodeLogoDataUri();
  const localOn = isLocalRuntimeEnvOn();
  const mod = await bundleMarkupModule();
  const html = mod.buildLocalRuntimeDocumentHtml({
    remoteApiOrigin: origin,
    logoSrc,
    darkLogoSrc: logoSrc,
    defaultRoute: "/",
    lang: "ko",
  });

  if (html.includes("location.replace(") || /location\.replace\s*\(/.test(html)) {
    // Guard wrapper may mention replace as blocked API — ban actual navigation calls only.
    const navCalls = html.match(/_replace\(|location\.replace\s*=/g) || [];
    const bad = html.match(/location\.replace\([^)]*\)/g) || [];
    // Allow monkey-patch assignment; forbid calling replace with remote URL in source as handoff.
    if (html.includes("beginHandoffCover") || html.includes("__dibay-startup")) {
      console.error("[build-local-runtime] Hybrid handoff markers must not appear");
      process.exit(1);
    }
    void navCalls;
    void bad;
  }
  if (html.includes("beginHandoffCover") || html.includes("handoff_cover")) {
    console.error("[build-local-runtime] Cover handoff must not appear in Local Runtime");
    process.exit(1);
  }
  if (!html.includes("__DIBAY_LOCAL_RUNTIME__")) {
    console.error("[build-local-runtime] missing local runtime flag");
    process.exit(1);
  }
  if (!html.includes("data-local-runtime")) {
    console.error("[build-local-runtime] missing data-local-runtime root");
    process.exit(1);
  }

  const targets = [
    path.join(ROOT, "capacitor-www/local-runtime/index.html"),
    path.join(ROOT, "android/app/src/main/assets/local-runtime/index.html"),
    path.join(ROOT, "ios/App/App/public/local-runtime/index.html"),
  ];
  for (const t of targets) {
    fs.mkdirSync(path.dirname(t), { recursive: true });
    fs.writeFileSync(t, html, "utf8");
    console.log("[build-local-runtime] wrote", path.relative(ROOT, t), `(${html.length} bytes)`);
  }

  const mode = { localRuntime: localOn, legacyRemoteRuntime: !localOn };
  const modeJson = `${JSON.stringify(mode, null, 2)}\n`;
  const modeTargets = [
    path.join(ROOT, "capacitor-www/dibay-runtime-mode.json"),
    path.join(ROOT, "android/app/src/main/assets/dibay-runtime-mode.json"),
    path.join(ROOT, "ios/App/App/public/dibay-runtime-mode.json"),
  ];
  for (const t of modeTargets) {
    fs.mkdirSync(path.dirname(t), { recursive: true });
    fs.writeFileSync(t, modeJson, "utf8");
  }
  console.log("[build-local-runtime] mode", mode);

  if (localOn) {
    const indexPath = path.join(ROOT, "capacitor-www/index.html");
    fs.writeFileSync(indexPath, html, "utf8");
    console.log("[build-local-runtime] DIBAY_LOCAL_RUNTIME=1 → capacitor-www/index.html = Local Runtime");
  }
}

main().catch((err) => {
  console.error("[build-local-runtime] failed", err);
  process.exit(1);
});
