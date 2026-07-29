/**
 * Static gate — iOS form keyboard contract wiring (login + center sheet + CM room isolation).
 */
import { readFileSync } from "node:fs";
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

const login = read("app/login/LoginPageClient.tsx");
const sheet = read("components/community-messenger/MessengerSheetUi.tsx");
const chrome = read("ios/App/App/DibayWebViewKeyboardChrome.swift");
const hook = read("lib/ui/use-ios-form-keyboard-visible-band.ts");
const contract = read("lib/ui/ios-form-keyboard-viewport-contract.ts");
const roomShell = read("lib/ui/use-cm-room-visible-viewport-shell.ts");
const css = read("app/ios-form-keyboard-viewport.css");
const layout = read("app/layout.tsx");

assert(login.includes("useIosFormKeyboardVisibleBand"), "Login must wire useIosFormKeyboardVisibleBand");
assert(login.includes("dibay-ios-form-shell"), "Login must use dibay-ios-form-shell");
assert(sheet.includes("useIosFormKeyboardVisibleBand"), "Center sheet shell must wire form kb hook");
assert(sheet.includes("messenger-home-center-sheet-overlay"), "Center overlay class required");
assert(chrome.includes("keyboardWillChangeFrameNotification"), "iOS must observe keyboard frame");
assert(chrome.includes("samarketShell"), "iOS must publish window.samarketShell");
assert(chrome.includes("samarket:shell-keyboard"), "iOS must dispatch samarket:shell-keyboard");
assert(chrome.includes("contentInsetAdjustmentBehavior = .never"), "Keep .never for CM room overlay");
assert(contract.includes("cm_room_vv_band"), "Contract must isolate CM room owner");
assert(contract.includes("nativeInset"), "Contract must support nativeInset authority");
assert(hook.includes("shouldApplyIosFormLayoutWriter"), "Hook must gate layout writes");
assert(roomShell.includes("useCmRoomVisibleViewportShell"), "CM room shell must remain");
assert(!roomShell.includes("useIosFormKeyboardVisibleBand"), "CM room must not import form hook");
assert(css.includes("data-dibay-kb-owner"), "CSS must gate on form owner");
assert(layout.includes("ios-form-keyboard-viewport.css"), "Root layout must import form kb CSS");

console.log("PASS: verify-ios-form-keyboard-viewport-contract");
