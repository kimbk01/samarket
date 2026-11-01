/**
 * 커뮤니티 글쓰기 작성기 UI 단일 기준 — `docs/philife-write-composer-ssot.md` (Owner 승인 2026-11-01).
 * - 토큰만: hex 색·흰/검정 고정색·`text-[NNpx]`·`rounded-sm/md/lg` 금지
 * - CTA 는 헤더 오른쪽 1개(form submit) — 아래 「취소·등록」 줄 금지
 * - 아이콘: 지금 쓰는 lucide 선 아이콘 목록만, 브랜드색(text-sam-primary) 아이콘 금지
 *
 * Usage: npm run verify:philife-write-composer-contract
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const TSX = [
  "components/philife/PhilifeNeighborhoodWriteForm.tsx",
  "components/philife/PhilifeWriteComposerChrome.tsx",
  "components/philife/PhilifeWritePhotoStrip.tsx",
  "components/philife/PhilifeWriteBottomSheet.tsx",
  "components/philife/write-editor/PhilifeBodyEditor.tsx",
  "lib/ui/philife-write-composer-ui.ts",
];
const CSS = ["components/philife/write-editor/philife-body-editor.module.css"];
const ALLOWED_ICONS = new Set(["X", "Check", "ChevronRight", "ImagePlus", "Link2", "Loader2", "Camera"]);

const errors = [];
function read(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) {
    errors.push(`missing ${rel}`);
    return "";
  }
  return fs.readFileSync(p, "utf8");
}

for (const rel of TSX) {
  const src = read(rel);
  const checks = [
    [/\[#[0-9a-fA-F]{3,8}\b/, "hex color in class (use sam-* tokens)"],
    [/\b(?:bg|text|border|ring)-(?:white|black)\b/, "fixed white/black color (use sam-* tokens)"],
    [/\btext-\[\d+(?:\.\d+)?px\]/, "text-[NNpx] (use sam-text-* / --sm-font-* tokens)"],
    [/\brounded-(?:sm|md|lg)\b/, "rounded-sm/md/lg (use rounded-ui-rect / rounded-full)"],
    [/PhilifeWriteActionFooter|philife_write_sheet_cancel/, "bottom cancel/submit bar (CTA is the header button)"],
  ];
  for (const [re, msg] of checks) {
    const m = src.match(re);
    if (m) errors.push(`${rel}: ${msg} — "${m[0]}"`);
  }
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*"lucide-react"/g)) {
    for (const name of m[1].split(",").map((s) => s.trim()).filter(Boolean)) {
      if (!ALLOWED_ICONS.has(name)) errors.push(`${rel}: icon "${name}" not in the approved set (Owner: no icon changes)`);
    }
  }
  const iconBrand = src.match(/<(?:X|Check|ChevronRight|ImagePlus|Link2|Loader2|Camera)\b[^>]*text-sam-primary/);
  if (iconBrand) errors.push(`${rel}: brand-colored icon (icons use text colors only) — "${iconBrand[0]}"`);
}

for (const rel of CSS) {
  const src = read(rel);
  const hex = src.match(/#[0-9a-fA-F]{3,8}\b/);
  if (hex) errors.push(`${rel}: hex color — "${hex[0]}"`);
  const fs1 = src.match(/font-size:\s*\d+px/);
  if (fs1) errors.push(`${rel}: px font-size — "${fs1[0]}"`);
}

const chrome = read("components/philife/PhilifeWriteComposerChrome.tsx");
if (!/type="submit"[\s\S]{0,40}form=\{PHILIFE_WRITE_FORM_ID\}/.test(chrome)) {
  errors.push("PhilifeWriteComposerChrome: header CTA must be the form submit button");
}
if (!chrome.includes("effectiveBottomInset")) {
  errors.push("PhilifeWriteComposerChrome: toolbar must use Form keyboard SSOT effectiveBottomInset");
}
const form = read("components/philife/PhilifeNeighborhoodWriteForm.tsx");
if (form.includes("WriteScreenTier1Sync")) errors.push("form: composer draws its own header — no WriteScreenTier1Sync");
if (/<textarea[^>]*placeholder=\{t\("philife_write_image_caption"\)/.test(form)) {
  errors.push("form: caption must be edited in the caption sheet");
}
const editor = read("components/philife/write-editor/PhilifeBodyEditor.tsx");
/** 사진 칸 배경 금지 (Owner 2026-11-01) */
for (const rel of ["components/philife/write-editor/PhilifeBodyEditor.tsx", "components/philife/PhilifeWritePhotoStrip.tsx"]) {
  const m = read(rel).match(/\bbg-sam-(?:surface-muted|app)\b/);
  if (m) errors.push(`${rel}: photo box must have no background — "${m[0]}"`);
}
if (/<input[\s\S]{0,200}setCaption\(/.test(editor)) errors.push("editor: inline caption input is not allowed (caption sheet only)");

/** Owner 확정 2026-11-01 */
const ui = read("lib/ui/philife-write-composer-ui.ts");
if (!ui.includes("var(--sm-font-compose-title)")) errors.push("title must be 20px (--sm-font-compose-title)");
if (!read("app/design-tokens.css").includes("--sm-font-compose-title: 20px;")) errors.push("design token --sm-font-compose-title: 20px missing");
const ctx = read("contexts/PhilifeWriteSheetContext.tsx");
if (/dibayConfirm\(|MobileConfirmBottomSheet/.test(form + ctx)) errors.push("leave confirm must be the shared bottom sheet (PhilifeWriteLeaveSheet) only");
if (!form.includes("<PhilifeWriteLeaveSheet") || !ctx.includes("<PhilifeWriteLeaveSheet")) {
  errors.push("form and sheet context must both use PhilifeWriteLeaveSheet");
}
if ((form.match(/philife_write_content_placeholder_photo_hint/g) || []).length < 2) {
  errors.push("body placeholder must be the approved 2 lines (editor + legacy textarea)");
}

if (errors.length) {
  console.error("verify-philife-write-composer-contract: FAIL");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("verify-philife-write-composer-contract: ok");
