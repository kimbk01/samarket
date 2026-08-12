/**
 * PostListByCategory — Rules of Hooks contract (trade category tab crash).
 *
 * 막는 회귀: loading/empty early return 아래 Feed Ad useMemo (렌더 간 Hook count 불일치 → (main)/error).
 *
 * 사용: npm run verify:post-list-by-category-hooks-contract
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const target = path.join(root, "components", "post", "PostListByCategory.tsx");

function fail(message) {
  console.error(`verify-post-list-by-category-hooks-contract: ${message}`);
  process.exitCode = 1;
}

const source = fs.readFileSync(target, "utf8");

const MARKER = "JSX 분기 return — hooks must stay above this marker";
if (!source.includes(MARKER)) {
  fail(`missing boundary marker: "${MARKER}"`);
}

if (!source.includes("getOrCreateFeedAdSessionId(tradeCategorySurfaceKey)")) {
  fail("trade category Feed Ad session hook missing");
}
if (!source.includes("planFeedAdSlots(")) {
  fail("trade category Feed Ad plan hook missing");
}
if (!source.includes("mountSeedFeed")) {
  fail("mountSeedFeed (cache|matching initialTradeFeed) seed missing");
}

const boundaryIdx = source.indexOf(MARKER);
const afterBoundary = source.slice(boundaryIdx);
const hookRe = /\buse(Memo|Callback|Effect|State|Ref|LayoutEffect|ImperativeHandle|Context)\s*\(/g;
let match;
while ((match = hookRe.exec(afterBoundary))) {
  fail(`hook call "${match[0].trim()}" must not appear after JSX branch boundary`);
}

if (process.exitCode) {
  console.error("→ Feed Ad / other hooks stay above early returns (HomeProductList parity).");
  process.exit(process.exitCode);
}

console.log("verify-post-list-by-category-hooks-contract: ok");
