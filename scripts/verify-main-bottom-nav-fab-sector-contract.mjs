/**
 * 배달 FAB 섹터 구조·inset·동작 계약 — 회귀 탐지.
 * 규칙: docs/main-bottom-nav-fab-sector-contract.md
 *
 * 사용: npm run verify:main-bottom-nav-fab-sector-contract
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

function assertNotMatches(source, pattern, context) {
  if (pattern.test(source)) errors.push(`${context}: forbidden pattern ${pattern}`);
}

const tsx = read("components/layout/MainBottomNavFabSector.tsx");
const config = read("lib/layout/main-bottom-nav-fab-sector-config.ts");
const behavior = read("lib/layout/use-main-bottom-nav-fab-sector-behavior.ts");
const css = read("app/samarket-components.css");

// --- 단일 shell DOM ---
assertIncludes(tsx, "main-bottom-nav-fab-sector__shell", "MainBottomNavFabSector");
assertIncludes(tsx, "main-bottom-nav-fab-sector__panel-body", "MainBottomNavFabSector");
assertIncludes(tsx, "main-bottom-nav-fab-sector__toggle", "MainBottomNavFabSector");
assertNotIncludes(tsx, "main-bottom-nav-fab-sector__edge", "MainBottomNavFabSector");
assertNotIncludes(tsx, "main-bottom-nav-fab-sector__stack", "MainBottomNavFabSector");
assertIncludes(tsx, "data-fab-shell-expanded", "MainBottomNavFabSector");
assertIncludes(tsx, "expandLocked", "MainBottomNavFabSector");

// --- 상단 inset: 인라인 단일 API ---
assertIncludes(config, "fabPanelBodyInlineStyle", "main-bottom-nav-fab-sector-config");
assertIncludes(
  config,
  "(FAB_SHELL_W_REM - FAB_ICON_BOX_REM) / 2",
  "main-bottom-nav-fab-sector-config inset formula"
);
assertIncludes(tsx, "fabPanelBodyInlineStyle()", "MainBottomNavFabSector must use fabPanelBodyInlineStyle()");
assertNotIncludes(
  tsx,
  "paddingTop: `${FAB_PANEL_INSET_REM}rem`",
  "MainBottomNavFabSector: use fabPanelBodyInlineStyle() not raw paddingTop"
);

const fabCssStart = css.indexOf(".main-bottom-nav-fab-sector {");
const fabCssEnd = css.indexOf("@media (prefers-reduced-motion: reduce)", fabCssStart);
const fabCss =
  fabCssStart >= 0 && fabCssEnd > fabCssStart
    ? css.slice(fabCssStart, fabCssEnd)
    : css;

assertNotMatches(
  fabCss,
  /data-fab-shell-expanded="true"[\s\S]*?__shell[\s\S]*?padding-top\s*:/,
  "samarket-components.css expanded shell"
);
assertNotMatches(
  fabCss,
  /data-fab-shell-expanded="true"[\s\S]*?__panel-body[\s\S]*?padding-top\s*:/,
  "samarket-components.css expanded panel-body"
);
assertIncludes(
  fabCss,
  "height: var(--fab-edge-h)",
  "samarket-components.css toggle fixed height"
);
assertNotIncludes(fabCss, "main-bottom-nav-fab-sector__edge", "samarket-components.css legacy edge");
assertIncludes(
  fabCss,
  "var(--fab-edge-h) + var(--fab-panel-inset)",
  "samarket-components.css shell max-height must budget inset"
);

// --- X 잠금 + refresh ---
assertIncludes(tsx, "setExpandLocked(true)", "MainBottomNavFabSector X close");
assertIncludes(tsx, "router.refresh()", "MainBottomNavFabSector X refresh");
assertIncludes(tsx, "setExpandLocked(false)", "MainBottomNavFabSector chevron unlock");
assertIncludes(behavior, "expandLocked", "use-main-bottom-nav-fab-sector-behavior");
assertIncludes(behavior, "resolveFabScrollChromeAction", "FAB scroll rules separate from bottom nav");
assertIncludes(behavior, "subscribeAppShellScroll", "FAB scroll subscription");
assertNotIncludes(behavior, "useBottomNavScrollChromeHidden", "FAB must not mirror bottom nav hidden");
assertIncludes(
  read("components/layout/ConditionalAppShell.tsx"),
  "BottomNavScrollChromeProvider",
  "shell provides scroll chrome context"
);
assertIncludes(
  read("lib/layout/main-bottom-nav-fab-sector-config.ts"),
  "deliveryFabChristmasPaletteCssVars",
  "Christmas Starbucks palette lock"
);

// --- 문서·규칙 존재 ---
assertIncludes(read("docs/main-bottom-nav-fab-sector-contract.md"), "fabPanelBodyInlineStyle", "contract doc");
assertIncludes(
  read(".cursor/rules/main-bottom-nav-fab-sector-contract.mdc"),
  "verify:main-bottom-nav-fab-sector-contract",
  "cursor rule"
);

if (errors.length) {
  console.error("verify-main-bottom-nav-fab-sector-contract FAILED:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("verify-main-bottom-nav-fab-sector-contract: ok");
