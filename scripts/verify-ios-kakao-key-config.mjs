#!/usr/bin/env node
/**
 * iOS Kakao Native App Key — local xcconfig + (optional) built Info.plist scheme check.
 *
 * Pre-build (source):
 *   node scripts/verify-ios-kakao-key-config.mjs
 *
 * Post-build (DerivedData Info.plist):
 *   node scripts/verify-ios-kakao-key-config.mjs --built-plist path/to/App.app/Info.plist
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const XCCONFIG = path.join(ROOT, "ios/App/App/Kakao.local.xcconfig");
const ANDROID_LOCAL = path.join(ROOT, "android/local.properties");
const SOURCE_PLIST = path.join(ROOT, "ios/App/App/Info.plist");

const failures = [];
const passes = [];

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function parseKakaoKeyFromProperties(content) {
  const match = content.match(/^\s*KAKAO_NATIVE_APP_KEY\s*=\s*(.+)\s*$/m);
  if (!match) return "";
  return match[1].trim();
}

function parseKakaoKeyFromXcconfig(content) {
  const match = content.match(/^\s*KAKAO_NATIVE_APP_KEY\s*=\s*(.+)\s*$/m);
  if (!match) return "";
  return match[1].trim().replace(/^["']|["']$/g, "");
}

function isPlaceholderKey(key) {
  const trimmed = key.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith("$(")) return true;
  if (/YOUR_KAKAO/i.test(trimmed)) return true;
  return false;
}

function extractUrlSchemes(plistContent) {
  const schemes = [];
  const re = /<key>CFBundleURLSchemes<\/key>\s*<array>([\s\S]*?)<\/array>/g;
  let block;
  while ((block = re.exec(plistContent)) !== null) {
    const inner = block[1];
    for (const m of inner.matchAll(/<string>([^<]+)<\/string>/g)) {
      schemes.push(m[1].trim());
    }
  }
  return schemes;
}

function validateScheme(scheme, expectedKey, label) {
  if (scheme === "kakao$(KAKAO_NATIVE_APP_KEY)" || scheme.includes("$(")) {
    failures.push(`${label}: URL scheme not substituted — still "${scheme}" (FAIL)`);
    return;
  }
  if (scheme === "kakao") {
    failures.push(`${label}: bare "kakao" scheme (FAIL)`);
    return;
  }
  if (!expectedKey) {
    if (/^kakao[0-9a-fA-F]+$/.test(scheme)) {
      passes.push(`${label}: URL scheme "${scheme}" looks resolved (PASS — key not checked)`);
    } else {
      failures.push(`${label}: URL scheme "${scheme}" is not kakao{NativeAppKey} form (FAIL)`);
    }
    return;
  }
  const expected = `kakao${expectedKey}`;
  if (scheme === expected) {
    passes.push(`${label}: URL scheme "${scheme}" (PASS)`);
  } else {
    failures.push(`${label}: expected "${expected}", got "${scheme}" (FAIL)`);
  }
}

// --- xcconfig ---
if (!fs.existsSync(XCCONFIG)) {
  failures.push("ios/App/App/Kakao.local.xcconfig missing — copy Kakao.local.xcconfig.example (FAIL)");
} else {
  const key = parseKakaoKeyFromXcconfig(read(XCCONFIG));
  if (isPlaceholderKey(key)) {
    failures.push(
      "Kakao.local.xcconfig: KAKAO_NATIVE_APP_KEY is empty or placeholder — set real Native App Key (FAIL)",
    );
  } else {
    passes.push(`Kakao.local.xcconfig: key configured (${key.length} chars) (PASS)`);
  }
}

// --- source Info.plist template ---
const sourcePlist = read(SOURCE_PLIST);
if (!sourcePlist.includes("kakao$(KAKAO_NATIVE_APP_KEY)")) {
  failures.push("Info.plist source must use kakao$(KAKAO_NATIVE_APP_KEY) template (FAIL)");
} else {
  passes.push("Info.plist source uses kakao$(KAKAO_NATIVE_APP_KEY) template (PASS — build-time substitution expected)");
}

const key = fs.existsSync(XCCONFIG) ? parseKakaoKeyFromXcconfig(read(XCCONFIG)) : "";
const expectedScheme = !isPlaceholderKey(key) ? `kakao${key}` : null;
if (expectedScheme) {
  passes.push(`Expected built URL scheme after Xcode build: ${expectedScheme}`);
}

// --- optional built plist ---
const builtArgIdx = process.argv.indexOf("--built-plist");
if (builtArgIdx !== -1) {
  const builtPath = process.argv[builtArgIdx + 1];
  if (!builtPath || !fs.existsSync(builtPath)) {
    failures.push(`--built-plist path not found: ${builtPath ?? "(missing)"}`);
  } else {
    const builtPlist = read(builtPath);
    const schemes = extractUrlSchemes(builtPlist);
    const kakaoSchemes = schemes.filter((s) => s.startsWith("kakao"));
    if (kakaoSchemes.length === 0) {
      failures.push("Built Info.plist: no kakao* CFBundleURLSchemes found (FAIL)");
    } else {
      for (const scheme of kakaoSchemes) {
        validateScheme(scheme, isPlaceholderKey(key) ? "" : key, "Built Info.plist");
      }
    }
    const plistKeyMatch = builtPlist.match(/<key>KAKAO_NATIVE_APP_KEY<\/key>\s*<string>([^<]+)<\/string>/);
    if (plistKeyMatch) {
      const plistKey = plistKeyMatch[1].trim();
      if (isPlaceholderKey(plistKey)) {
        failures.push(`Built Info.plist: KAKAO_NATIVE_APP_KEY still placeholder "${plistKey}" (FAIL)`);
      } else if (!isPlaceholderKey(key) && plistKey !== key) {
        failures.push(`Built Info.plist: KAKAO_NATIVE_APP_KEY mismatch (FAIL)`);
      } else {
        passes.push("Built Info.plist: KAKAO_NATIVE_APP_KEY substituted (PASS)");
      }
    }
  }
}

console.log("verify:ios-kakao-key-config\n");
console.log("--- iOS ---");
for (const p of passes) console.log(`  ✓ ${p}`);
if (failures.length > 0) {
  console.error("");
  for (const f of failures) console.error(`  ✗ ${f}`);
}

// --- Android local.properties ---
const androidFailures = [];
const androidPasses = [];
console.log("\n--- Android ---");
if (!fs.existsSync(ANDROID_LOCAL)) {
  androidFailures.push("android/local.properties missing — create from local.properties.example (FAIL)");
} else {
  const androidKey = parseKakaoKeyFromProperties(read(ANDROID_LOCAL));
  if (isPlaceholderKey(androidKey)) {
    androidFailures.push(
      "android/local.properties: KAKAO_NATIVE_APP_KEY missing or placeholder — set real Native App Key (FAIL)",
    );
  } else {
    androidPasses.push(`android/local.properties: key configured (${androidKey.length} chars) (PASS)`);
    androidPasses.push(`Expected kakao_login_scheme: kakao${androidKey}`);
  }
}
for (const p of androidPasses) console.log(`  ✓ ${p}`);
for (const f of androidFailures) console.error(`  ✗ ${f}`);

const allFailures = [...failures, ...androidFailures];
if (allFailures.length > 0) {
  console.error("\nverify:ios-kakao-key-config FAIL");
  process.exit(1);
}

console.log("\nverify:ios-kakao-key-config PASS");
