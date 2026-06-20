#!/usr/bin/env node
/**
 * `/philife` 글쓰기 시트 — 모바일 키보드·풀스크린 레이아웃 회귀 탐지.
 *
 * 사용: npm run verify:philife-write-sheet-keyboard-contract
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function assertIncludes(source, needle, context) {
  if (!source.includes(needle)) errors.push(`${context}: missing "${needle}"`);
}

function assertNotIncludes(source, needle, context) {
  if (source.includes(needle)) errors.push(`${context}: forbidden "${needle}"`);
}

const sheet = read("components/philife/PhilifeWriteBottomSheet.tsx");
const footer = read("components/philife/PhilifeWriteActionFooter.tsx");
const form = read("components/philife/PhilifeNeighborhoodWriteForm.tsx");
const layout = read("lib/ui/philife-write-sheet-keyboard-layout.ts");
const fbUi = read("lib/ui/philife-write-fb-ui.ts");

assertIncludes(sheet, "fixed inset-0", "PhilifeWriteBottomSheet");
assertIncludes(sheet, "useMobileKeyboardInset", "PhilifeWriteBottomSheet");
assertIncludes(sheet, "philifeWriteSheetOuterPaddingStyle", "PhilifeWriteBottomSheet");
assertIncludes(sheet, "onHeaderClose", "PhilifeWriteBottomSheet");
assertIncludes(sheet, 'aria-label={t("common_close")}', "PhilifeWriteBottomSheet");
assertNotIncludes(sheet, "data-app-sticky-header", "PhilifeWriteBottomSheet");
assertNotIncludes(sheet, "topOffsetPx", "PhilifeWriteBottomSheet");
assertNotIncludes(sheet, "useAppViewportSize", "PhilifeWriteBottomSheet");
assertNotIncludes(sheet, 'addEventListener("scroll"', "PhilifeWriteBottomSheet");

assertIncludes(footer, 'layout?: PhilifeWriteActionFooterLayout', "PhilifeWriteActionFooter");
assertIncludes(footer, 'layout === "sheet"', "PhilifeWriteActionFooter");
assertIncludes(footer, "showCancel", "PhilifeWriteActionFooter");
assertIncludes(footer, 'enabled: layout === "page"', "PhilifeWriteActionFooter");

assertIncludes(form, 'layout={suppressWriteScreenTier1 ? "sheet" : "page"}', "PhilifeNeighborhoodWriteForm");
assertIncludes(form, "showCancel={!suppressWriteScreenTier1}", "PhilifeNeighborhoodWriteForm");
assertIncludes(form, "PHILIFE_WRITE_SCROLL_BODY_SHEET_CLASS", "PhilifeNeighborhoodWriteForm");
assertIncludes(form, "handleSheetFieldFocus", "PhilifeNeighborhoodWriteForm");

assertIncludes(fbUi, "PHILIFE_WRITE_SCROLL_BODY_SHEET_CLASS", "philife-write-fb-ui");
assertIncludes(fbUi, "PHILIFE_WRITE_SCROLL_BODY_PAGE_CLASS", "philife-write-fb-ui");

assertIncludes(layout, "philife-write-sheet-keyboard-v2", "philife-write-sheet-keyboard-layout");
assertIncludes(layout, "philifeWriteSheetOuterPaddingStyle", "philife-write-sheet-keyboard-layout");

if (errors.length > 0) {
  console.error("verify:philife-write-sheet-keyboard-contract FAIL\n");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log("verify:philife-write-sheet-keyboard-contract PASS");
