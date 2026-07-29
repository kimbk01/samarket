/**
 * Responsive / platform layout contract — regression gate (audit-backed).
 *
 * Locks:
 * - canonical mobile max 767 / messenger split 768
 * - main desktop side nav stays hidden (BottomNav SSOT)
 * - iOS input 16px floor remains
 * - reverted form keyboard viewport writers stay gone
 * - no viewport user-zoom lock
 * - CM room vv-band marker remains
 *
 * Does NOT rewrite domain layouts. Allowlisted special breakpoints stay documented.
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
const breakpoints = read("lib/ui/app-viewport-layout-breakpoints.ts");
const sideNavCss = read("app/app-desktop-side-nav.css");
const globals = read("app/globals.css");
const layout = read("app/layout.tsx");
const mainShell = read("lib/layout/main-shell-viewport.ts");
const roomCss = read("app/messenger-view-transitions.css");
const pkg = read("package.json");

if (!tokens.includes("--sam-bp-mobile-max: 767px")) {
  failures.push("design-tokens --sam-bp-mobile-max must stay 767px");
}
if (!tokens.includes("--sam-bp-sm-tablet-min: 768px")) {
  failures.push("design-tokens --sam-bp-sm-tablet-min must stay 768px");
}
if (!breakpoints.includes("APP_MOBILE_LAYOUT_MAX_PX = 767")) {
  failures.push("app-viewport-layout-breakpoints APP_MOBILE_LAYOUT_MAX_PX must be 767");
}
if (!breakpoints.includes("APP_MESSENGER_SPLIT_MIN_PX = 768")) {
  failures.push("app-viewport-layout-breakpoints APP_MESSENGER_SPLIT_MIN_PX must be 768");
}

if (!sideNavCss.includes(".app-desktop-side-nav") || !sideNavCss.includes("display: none")) {
  failures.push("app-desktop-side-nav.css must keep .app-desktop-side-nav { display: none }");
}

if (!mainShell.includes("main-shell-viewport-root") || !mainShell.includes("100dvh")) {
  failures.push("main-shell-viewport lock class must keep 100dvh/svh shell root");
}

if (!globals.includes("@supports (-webkit-touch-callout: none)")) {
  failures.push("globals.css missing iOS input font-size floor");
}
if (!/font-size:\s*max\(\s*16px/.test(globals)) {
  failures.push("globals.css missing max(16px …) form-control floor");
}
if (!tokens.includes("--sm-font-input: 16px")) {
  failures.push("--sm-font-input must remain 16px");
}

const banned = [
  "components/platform/AppKeyboardResizeBootstrap.tsx",
  "lib/ui/ios-form-keyboard-viewport-store.ts",
  "lib/ui/use-ios-form-keyboard-visible-band.ts",
  "app/ios-form-keyboard-viewport.css",
];
for (const rel of banned) {
  if (exists(rel)) failures.push(`forbidden form keyboard writer present: ${rel}`);
}
if (pkg.includes("verify:keyboard-resize-contract")) {
  failures.push("package.json must not reintroduce verify:keyboard-resize-contract");
}
if (layout.includes("AppKeyboardResizeBootstrap")) {
  failures.push("layout must not mount AppKeyboardResizeBootstrap");
}
if (/maximumScale:\s*1\b/.test(layout) || /user-scalable\s*=\s*no/i.test(layout)) {
  failures.push("viewport must not lock user zoom");
}
if (!roomCss.includes("data-cm-ios-vv-band")) {
  failures.push("messenger-view-transitions.css must keep data-cm-ios-vv-band room contract");
}

// Anti-pattern: device-model CSS or page-level zoom (press animation scale is allowed).
const shellCssFiles = ["app/app-shell.css", "app/app-bottom-nav.css", "app/owner-compact-shell.css"];
for (const rel of shellCssFiles) {
  const src = read(rel);
  if (/xiaomi|samsung|pixel\s*6|iphone\s*1[45]/i.test(src)) {
    failures.push(`${rel}: device-model CSS not allowed`);
  }
  if (/\bzoom\s*:/.test(src)) {
    failures.push(`${rel}: CSS zoom property not allowed`);
  }
  if (/html[^{]*\{[^}]*transform:\s*scale\(/i.test(src) || /body[^{]*\{[^}]*transform:\s*scale\(/i.test(src)) {
    failures.push(`${rel}: page-level transform:scale not allowed`);
  }
}

if (failures.length) {
  console.error("verify-responsive-platform-contract FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-responsive-platform-contract PASS");
console.log("  breakpoints: mobile≤767 / messenger-split≥768");
console.log("  nav: BottomNav SSOT; desktop side nav hidden");
console.log("  iOS input floor + room vv-band + no form kb writer");
