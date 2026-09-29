#!/usr/bin/env node
/**
 * 13TH ZERO — Product Intro boot shell removed.
 * OS Splash / LaunchScreen owns cold start; do not regenerate dibay-startup.html.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const targets = [
  path.join(ROOT, "android/app/src/main/assets/dibay-startup.html"),
  path.join(ROOT, "ios/App/App/public/dibay-startup.html"),
  path.join(ROOT, "capacitor-www/dibay-startup.html"),
];

for (const t of targets) {
  if (fs.existsSync(t)) {
    fs.unlinkSync(t);
    console.log(`[build-startup-shell] removed product shell ${path.relative(ROOT, t)}`);
  }
}

console.log(
  "[build-startup-shell] NO-OP: Product Intro shell burned. Cold start = OS Splash → Home."
);
