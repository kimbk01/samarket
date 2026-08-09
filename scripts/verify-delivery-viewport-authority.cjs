#!/usr/bin/env node
/**
 * Delivery viewport / safe-area authority contract.
 * Fails when unapproved 100vw/100dvw / column bleed return on locked delivery surfaces,
 * or when locked local headers lose safe-top ownership.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
let failed = 0;

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed = 1;
}

function assertIncludes(src, needle, msg) {
  if (!src.includes(needle)) fail(msg);
}

/** Strip line and block comments for code-only scans */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function assertCodeNoMatch(src, re, msg) {
  if (re.test(stripComments(src))) fail(msg);
}

const chrome = read("lib/layout/delivery-locked-subpage-chrome.ts");
assertIncludes(chrome, "pt-[var(--safe-top)]", "locked-subpage chrome SSOT must own safe-top");
assertIncludes(chrome, "min-w-0", "locked-subpage chrome SSOT must set min-w-0");
assertCodeNoMatch(chrome, /100(?:d|s|l)?vw/, "locked-subpage chrome SSOT must not use vw units");

const deliveryHeader = read("components/stores/chrome/DeliverySubpageHeader.tsx");
assertIncludes(
  deliveryHeader,
  "DELIVERY_LOCKED_SUBPAGE_HEADER_CLASS",
  "DeliverySubpageHeader must import locked chrome SSOT"
);
assertCodeNoMatch(
  deliveryHeader,
  /APP_TIER1_VIEWPORT_BLEED_FROM_COLUMN_CLASS|w-\[100dvw\]|\b100vw\b/,
  "DeliverySubpageHeader must not use viewport bleed / vw"
);

const myHeader = read("components/my/MySubpageHeader.tsx");
assertIncludes(
  myHeader,
  "DELIVERY_LOCKED_SUBPAGE_HEADER_CLASS",
  "MySubpageHeader inlineChrome must use locked chrome SSOT"
);
if (
  /inlineChrome[\s\S]{0,400}className=\{`\$\{DELIVERY_LOCKED_SUBPAGE_HEADER_CLASS\} \$\{APP_TIER1_HEADER_BAR_CLASS\}`\}/.test(
    myHeader
  )
) {
  fail(
    "MySubpageHeader must not put sector-header-shell and safe-top pt on the same node (embedded shell resets padding)"
  );
}
assertIncludes(
  myHeader,
  "<div className={APP_TIER1_HEADER_BAR_CLASS}>{detailHeader}</div>",
  "MySubpageHeader inlineChrome must nest shell inside safe-top outer header"
);

const addr = read("lib/ui/address-flow-viber.ts");
assertCodeNoMatch(addr, /100(?:d|s|l)?vw/, "ADDR_FLOW_MIN_VIEWPORT must not use 100vw/dvw");
assertIncludes(addr, "max-w-full", "ADDR_FLOW_MIN_VIEWPORT must use max-w-full");

const consumerShell = read("components/stores/StoreConsumerShell.tsx");
assertCodeNoMatch(
  consumerShell,
  /APP_TIER1_VIEWPORT_BLEED_FROM_COLUMN_CLASS/,
  "StoreConsumerShell must not wrap sticky bar in column viewport bleed"
);

const ownerApply = read("app/(main)/stores/owner/apply/page.tsx");
assertCodeNoMatch(ownerApply, /max-w-\[100vw\]/, "owner apply root must not use max-w-[100vw]");
assertCodeNoMatch(
  ownerApply,
  /overflow-x-hidden/,
  "owner apply must not hide overflow with overflow-x-hidden on root"
);

const ownerCss = read("app/owner-compact-shell.css");
assertCodeNoMatch(
  ownerCss,
  /max-width:\s*100vw/,
  "owner-compact-shell must not use max-width:100vw"
);

const dialCss = read("app/delivery-domain-switcher.css");
assertCodeNoMatch(dialCss, /\b100vw\b/, "delivery FAB dial CSS must not use 100vw");

const ocmCss = read("app/delivery-order-confirm-modal.css");
assertCodeNoMatch(ocmCss, /\b100vw\b/, "order confirm modal must not use 100vw");

const storeDetailUi = read("lib/stores/store-detail-ui.ts");
assertCodeNoMatch(
  storeDetailUi,
  /safe-top\)\+54/,
  "STORE_DETAIL_SUBHEADER_STICKY must not assume Tier1 +54px offset"
);
assertIncludes(
  storeDetailUi,
  "pt-[var(--safe-top)]",
  "STORE_DETAIL_SUBHEADER_STICKY must own safe-top padding"
);

const ordersReview = read("app/(main)/orders/store/[orderId]/review/page.tsx");
assertIncludes(ordersReview, "inlineChrome", "orders hub review must use local safe-top header");
assertIncludes(ordersReview, "MySubpageHeader", "orders hub review must mount MySubpageHeader");

const mypageReview = read("app/(main)/mypage/store-orders/[orderId]/review/page.tsx");
assertIncludes(mypageReview, "inlineChrome", "mypage store-order review must use inlineChrome");

/** Delivery-scoped paths — ban accidental 100vw/dvw in non-comment code */
const scanRoots = [
  "components/stores",
  "components/addresses",
  "components/map/AddressSelectClient.tsx",
  "lib/ui/address-flow-viber.ts",
  "lib/stores/store-detail-ui.ts",
  "lib/layout/delivery-locked-subpage-chrome.ts",
  "app/(main)/stores",
  "app/(main)/orders",
  "app/(main)/mypage/addresses",
  "app/(main)/mypage/store-orders",
  "app/(main)/address",
  "app/owner-compact-shell.css",
  "app/delivery-domain-switcher.css",
  "app/delivery-order-confirm-modal.css",
];

const VW_RE = /(?:max-)?w-\[100(?:d|s|l)?vw\]|max-w-\[100(?:d|s|l)?vw\]|w-\[100(?:d|s|l)?vw\]|\b100(?:d|s|l)?vw\b/;

function walk(rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return [];
  const st = fs.statSync(abs);
  if (st.isFile()) return [rel];
  const out = [];
  for (const name of fs.readdirSync(abs)) {
    if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) continue;
    out.push(...walk(path.join(rel, name)));
  }
  return out;
}

for (const start of scanRoots) {
  for (const rel of walk(start)) {
    if (!/\.(tsx?|css)$/.test(rel)) continue;
    const code = stripComments(read(rel));
    const lines = code.split("\n");
    lines.forEach((line, i) => {
      if (!VW_RE.test(line)) return;
      if (/sizes\s*=/.test(line)) return;
      fail(`${rel}:${i + 1} accidental viewport-width token: ${line.trim().slice(0, 120)}`);
    });
  }
}

if (failed) {
  console.error("verify-delivery-viewport-authority: FAIL");
  process.exit(1);
}
console.log("verify-delivery-viewport-authority: ok");
