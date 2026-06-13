#!/usr/bin/env node
/**
 * Native OAuth 실기기 QA 안내 — 자동 E2E 아님.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docPath = path.join(ROOT, "docs", "native-oauth-device-qa.md");

console.log("DIBAY Native OAuth — Android 실기기 QA");
console.log("");
console.log("문서:", docPath);
console.log("");
console.log("사전:");
console.log("  1. Vercel 배포 (samarket.vercel.app)");
console.log("  2. Supabase Redirect URLs — dibay://auth/callback + dibay://** (권장)");
console.log("  3. npm run cap:sync:android → APK 재빌드");
console.log("");
console.log("Logcat 필터: oauth|appUrlOpen|authCallback");
console.log("");
console.log("코드 계약 검증: npm run verify:native-oauth-redirect-contract");
console.log("");

if (fs.existsSync(docPath)) {
  const doc = fs.readFileSync(docPath, "utf8");
  const passSection = doc.indexOf("## PASS / FAIL 기준");
  if (passSection >= 0) {
    console.log("--- docs/native-oauth-device-qa.md (PASS/FAIL 발췌) ---");
    console.log(doc.slice(passSection, passSection + 1200).trim());
  }
} else {
  console.warn("WARN: docs/native-oauth-device-qa.md not found");
}
