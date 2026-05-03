/**
 * 거래 상세 RSC 계약 자동 검증 — `getItemDetailPageData` 에 비핵심 부하가 다시 합쳐졌는지 탐지.
 * 규칙: `.cursor/rules/trade-post-detail-chat-hot-path.mdc`
 *
 * 사용: npm run verify:trade-hot-path-contract
 */
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "services", "trade", "trade-detail.service.ts");
const s = fs.readFileSync(file, "utf8");
const marker = "export async function getItemDetailPageData";
const start = s.indexOf(marker);
if (start < 0) {
  console.error("verify-trade-hot-path-contract: marker not found");
  process.exit(1);
}

let depth = 0;
let opened = false;
let i = start + marker.length;
for (; i < s.length; i++) {
  const c = s[i];
  if (c === "{") {
    depth++;
    opened = true;
  } else if (c === "}") {
    depth--;
    if (opened && depth === 0) {
      i++;
      break;
    }
  }
}

const body = s.slice(start, i);
const forbidden = [
  "loadTradeDetailRelatedBundle",
  "resolveViewerItemTradeRoom",
  "listSellerPriceOffersForProduct",
];
let failed = false;
for (const name of forbidden) {
  if (body.includes(name)) {
    console.error(
      `verify-trade-hot-path-contract: "${name}" must not appear inside getItemDetailPageData (역행 의심)`
    );
    failed = true;
  }
}

if (failed) {
  console.error(
    "→ 의도적 변경이면 규칙·주석·후속 API 페어를 함께 수정한 뒤 이 스크립트의 금지 목록을 갱신하세요."
  );
  process.exit(1);
}

console.log("verify-trade-hot-path-contract: ok");
