/**
 * iOS input focus-zoom contract:
 * - --sm-font-input >= 16px
 * - global iOS form-control floor exists
 * - no form keyboard writer reintroduction
 * - no viewport user-zoom lock as zoom "fix"
 * - CM room vv-band sources untouched by this gate (presence only)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

const tokens = read("app/design-tokens.css");
const globals = read("app/globals.css");
const layout = read("app/layout.tsx");
const pkg = read("package.json");

const inputToken = tokens.match(/--sm-font-input:\s*([^;]+);/);
if (!inputToken) {
  failures.push("app/design-tokens.css missing --sm-font-input");
} else {
  const raw = inputToken[1].trim();
  const px = Number.parseFloat(raw);
  if (!Number.isFinite(px) || px < 16) {
    failures.push(`--sm-font-input must be >= 16px (got ${raw})`);
  }
}

if (!globals.includes("@supports (-webkit-touch-callout: none)")) {
  failures.push("app/globals.css missing iOS @supports (-webkit-touch-callout: none) floor");
}
if (!/font-size:\s*max\(\s*16px/.test(globals) && !/font-size:\s*16px/.test(globals)) {
  failures.push("app/globals.css missing 16px form-control font-size floor");
}
if (!/\binput\b/.test(globals) || !/\btextarea\b/.test(globals) || !/\bselect\b/.test(globals)) {
  failures.push("app/globals.css iOS floor must target input, textarea, and select");
}

const bannedPaths = [
  "components/platform/AppKeyboardResizeBootstrap.tsx",
  "lib/ui/ios-form-keyboard-viewport-store.ts",
  "lib/ui/ios-form-keyboard-viewport-contract.ts",
  "lib/ui/use-ios-form-keyboard-visible-band.ts",
  "lib/ui/dibay-ios-form-keyboard-dom.ts",
  "app/ios-form-keyboard-viewport.css",
];
for (const rel of bannedPaths) {
  if (exists(rel)) failures.push(`form keyboard writer reintroduced: ${rel}`);
}
if (pkg.includes("verify:keyboard-resize-contract")) {
  failures.push("package.json still lists verify:keyboard-resize-contract");
}
if (layout.includes("AppKeyboardResizeBootstrap")) {
  failures.push("app/layout.tsx still mounts AppKeyboardResizeBootstrap");
}

if (/maximumScale:\s*1\b/.test(layout) || /user-scalable\s*=\s*no/i.test(layout)) {
  failures.push("viewport must not lock user zoom (maximumScale:1 / user-scalable=no)");
}
if (!/maximumScale:\s*5\b/.test(layout)) {
  failures.push("app/layout.tsx expected maximumScale: 5 (a11y zoom retained)");
}

const roomHook = "lib/ui/use-cm-room-visible-viewport-shell.ts";
const roomCss = "app/messenger-view-transitions.css";
if (!exists(roomHook)) failures.push(`missing room vv-band hook: ${roomHook}`);
if (!exists(roomCss)) failures.push(`missing room vv CSS: ${roomCss}`);
else if (!read(roomCss).includes("data-cm-ios-vv-band")) {
  failures.push("room vv-band CSS marker data-cm-ios-vv-band missing");
}

if (failures.length) {
  console.error("verify-ios-input-font-floor FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-ios-input-font-floor PASS");
