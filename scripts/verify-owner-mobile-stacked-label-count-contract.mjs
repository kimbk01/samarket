/**
 * 오너 모바일 좁은 탭·KPI: 라벨+건수 한 줄 연결 금지 — 2행 스택 컴포넌트 필수.
 */
import { readFileSync } from "node:fs";

const mobileBodyPath = "components/business/owner/OwnerStoreOrdersMobileBody.tsx";
const componentPath = "components/business/owner/OwnerMobileStackedLabelCount.tsx";
const libPath = "lib/business/owner-mobile-stacked-label-count.ts";

const errors = [];

const mobileBody = readFileSync(mobileBodyPath, "utf8");
const component = readFileSync(componentPath, "utf8");
const lib = readFileSync(libPath, "utf8");

if (!mobileBody.includes("OwnerMobileStackedLabelCount")) {
  errors.push(`${mobileBodyPath}: must render tabs via OwnerMobileStackedLabelCount`);
}

if (/count\s*>\s*0\s*\?\s*`\s*\$\{count\}`/.test(mobileBody)) {
  errors.push(`${mobileBodyPath}: must not concatenate label + count in one text node`);
}

if (!lib.includes("DO NOT")) {
  errors.push(`${libPath}: must document CONTRACT / DO NOT`);
}

if (!lib.includes("line-clamp-2")) {
  errors.push(`${libPath}: tab label class must include line-clamp-2 for long i18n`);
}

if (!component.includes("tabular-nums")) {
  errors.push(`${componentPath}: count row must use tabular-nums`);
}

if (errors.length) {
  console.error(
    "verify-owner-mobile-stacked-label-count-contract FAILED:\n" + errors.join("\n")
  );
  process.exit(1);
}

console.log("verify-owner-mobile-stacked-label-count-contract OK");
