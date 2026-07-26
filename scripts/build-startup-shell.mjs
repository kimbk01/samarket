#!/usr/bin/env node
/**
 * Build self-contained Local Boot Shell HTML into:
 * - android/app/src/main/assets/dibay-startup.html
 * - ios/App/App/public/dibay-startup.html
 * - capacitor-www/dibay-startup.html (+ index.html)
 *
 * Usage: node scripts/build-startup-shell.mjs [--origin=https://samarket.vercel.app]
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

async function bundleMarkupModule() {
  const esbuild = require("esbuild");
  const outfile = path.join(ROOT, ".qa-logs/.tmp-startup-shell-markup.mjs");
  fs.mkdirSync(path.dirname(outfile), { recursive: true });
  await esbuild.build({
    entryPoints: [path.join(ROOT, "lib/startup/startup-shell-markup.ts")],
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
  const mod = await bundleMarkupModule();
  const html = mod.buildStartupBootDocumentHtml({
    remoteOrigin: origin,
    logoSrc,
    darkLogoSrc: logoSrc,
    defaultRoute: "/",
    lang: "ko",
  });

  if (!html.includes("location.replace")) {
    console.error("[build-startup-shell] missing location.replace");
    process.exit(1);
  }
  if ((html.match(/location\.replace/g) || []).length !== 1) {
    console.error("[build-startup-shell] expected exactly one location.replace");
    process.exit(1);
  }

  const targets = [
    path.join(ROOT, "android/app/src/main/assets/dibay-startup.html"),
    path.join(ROOT, "ios/App/App/public/dibay-startup.html"),
    path.join(ROOT, "capacitor-www/dibay-startup.html"),
  ];
  for (const t of targets) {
    fs.mkdirSync(path.dirname(t), { recursive: true });
    fs.writeFileSync(t, html, "utf8");
    console.log(`[build-startup-shell] wrote ${path.relative(ROOT, t)} (${html.length} bytes)`);
  }

  fs.writeFileSync(path.join(ROOT, "capacitor-www/index.html"), html, "utf8");
  console.log(`[build-startup-shell] wrote capacitor-www/index.html origin=${origin}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
