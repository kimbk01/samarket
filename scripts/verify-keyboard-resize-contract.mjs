/**
 * Static gate — global keyboard resize contract wiring.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

function walkTsx(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".qa-logs" || name === ".worktrees" || name === "DerivedData") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkTsx(p, out);
    else if (/\.(tsx|ts)$/.test(name) && !name.includes(".test.")) out.push(p);
  }
  return out;
}

const bootstrap = read("components/platform/AppKeyboardResizeBootstrap.tsx");
const layout = read("app/layout.tsx");
const css = read("app/ios-form-keyboard-viewport.css");
const store = read("lib/ui/ios-form-keyboard-viewport-store.ts");
const contract = read("lib/ui/ios-form-keyboard-viewport-contract.ts");
const roomShell = read("lib/ui/use-cm-room-visible-viewport-shell.ts");
const inset = read("lib/ui/use-mobile-keyboard-inset.ts");
const mainShell = read("lib/layout/main-shell-viewport.ts");
const chrome = read("ios/App/App/DibayWebViewKeyboardChrome.swift");
const inlineSearch = read("components/community-messenger/MessengerHomeInlineFriendSearch.tsx");
const sheet = read("components/community-messenger/MessengerSheetUi.tsx");
const login = read("app/login/LoginPageClient.tsx");

assert(bootstrap.includes("acquireIosFormKeyboardViewport"), "bootstrap must use shared store");
assert(bootstrap.includes("isDibayKeyboardResizeFocusTarget"), "bootstrap must gate focus targets");
const focusGate = read("lib/ui/dibay-ios-form-keyboard-dom.ts");
assert(focusGate.includes("[data-cm-room].cm-room-shell"), "focus gate must skip CM room");
assert(layout.includes("AppKeyboardResizeBootstrap"), "root layout must mount bootstrap");
assert(css.includes(".main-shell-viewport-root"), "CSS must shrink main shell on kb open");
assert(css.includes("data-dibay-kb-overlay-shell"), "CSS must cover overlay shells");
assert(store.includes("acquireIosFormKeyboardViewport"), "store SSOT present");
assert(contract.includes("cm_room_vv_band"), "CM room owner isolation");
assert(contract.includes("nativeInset"), "native inset authority path");
assert(!roomShell.includes("useIosFormKeyboardVisibleBand"), "CM room must not import form hook");
assert(!roomShell.includes("AppKeyboardResizeBootstrap"), "CM room must not import bootstrap");
assert(inset.includes("isDibayIosFormKeyboardBandActive"), "inset helper must not double-apply");
assert(mainShell.includes("100dvh"), "main shell still documents 100dvh baseline");
assert(chrome.includes("samarket:shell-keyboard"), "native bridge event");
assert(chrome.includes("contentInsetAdjustmentBehavior = .never"), "keep .never for room overlay");
assert(sheet.includes('data-dibay-kb-overlay-shell="1"'), "messenger sheets mark overlay shell");
assert(login.includes("useIosFormKeyboardVisibleBand"), "login keeps explicit shell writer");
// Inline search relies on global bootstrap + main-shell CSS — must NOT grow a local padding hack
assert(!/paddingBottom:\s*['"`]?\d{2,}/.test(inlineSearch), "inline search must not hardcode kb padding");
assert(!inlineSearch.includes("translateY(-"), "inline search must not translateY hack");

// Ban per-file visualViewport listeners outside allowed measurement modules
const allowedVv = new Set([
  join(root, "lib/ui/ios-form-keyboard-viewport-store.ts"),
  join(root, "lib/ui/use-mobile-keyboard-inset.ts"),
  join(root, "lib/ui/use-cm-room-visible-viewport-shell.ts"),
  join(root, "lib/ui/use-cm-room-kb-offset.ts"),
  join(root, "lib/ui/use-app-viewport-size.ts"),
  join(root, "components/community-messenger/call-ui/CallScreenShell.tsx"),
  join(root, "lib/community-messenger/use-call-video-pip-gesture.ts"),
  join(root, "lib/stores/use-store-detail-scroll-root-scroll.ts"),
]);
const offenders = [];
for (const file of walkTsx(join(root, "lib")).concat(walkTsx(join(root, "components")), walkTsx(join(root, "app")))) {
  if (allowedVv.has(file)) continue;
  const src = readFileSync(file, "utf8");
  if (/visualViewport\.addEventListener/.test(src)) offenders.push(file.replace(root + "/", ""));
}
assert(offenders.length === 0, `unexpected visualViewport listeners:\n${offenders.join("\n")}`);

console.log("PASS: verify-keyboard-resize-contract");
