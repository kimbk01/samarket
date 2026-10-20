#!/usr/bin/env node
/**
 * Native build (APK · iOS) 워크플로 게이트 — push 범위의 실제 네이티브 변경만 빌드한다.
 * 판정은 verify:native-version-bump 와 같은 classifyNativeChanges (scripts/lib/native-release.mjs).
 *
 *   node scripts/native-build-targets.mjs --base=<sha>
 *   → stdout + $GITHUB_OUTPUT: android=true|false, ios=true|false
 *
 * 워크플로 파일 자체가 바뀌면 둘 다 빌드(워크플로 검증).
 */
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import {
  IOS_INFO_PLIST_PATH,
  classifyNativeChanges,
  stripInfoPlistFingerprint,
} from "./lib/native-release.mjs";

const WORKFLOW_PATH = ".github/workflows/native-build.yml";

const git = (args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const tryGit = (args) => {
  try {
    return git(args);
  } catch {
    return null;
  }
};

function resolveBase() {
  const flag = process.argv.find((a) => a.startsWith("--base="))?.slice("--base=".length).trim();
  if (flag && !/^0+$/.test(flag) && tryGit(["cat-file", "-e", `${flag}^{commit}`]) !== null) return flag;
  return "HEAD^1";
}

const base = resolveBase();
const files = git(["diff", "--name-only", base, "HEAD"]).split("\n").filter(Boolean);
const show = (ref, file) => tryGit(["show", `${ref}:${file}`]) ?? "";

const infoPlistFingerprintOnly =
  files.includes(IOS_INFO_PLIST_PATH) &&
  stripInfoPlistFingerprint(show(base, IOS_INFO_PLIST_PATH)) === stripInfoPlistFingerprint(show("HEAD", IOS_INFO_PLIST_PATH));
const packageJsonDiff = files.includes("package.json") ? git(["diff", base, "HEAD", "--", "package.json"]) : "";

const changes = classifyNativeChanges(files, { packageJsonDiff, infoPlistFingerprintOnly });
const workflowChanged = files.includes(WORKFLOW_PATH);
const out = {
  android: workflowChanged || changes.android.length > 0,
  ios: workflowChanged || changes.ios.length > 0,
};

console.log(`[native-build-targets] base=${base} android=${out.android} ios=${out.ios}`);
for (const [k, v] of Object.entries(changes)) if (v.length) console.log(`  ${k}: ${v.join(", ")}`);
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `android=${out.android}\nios=${out.ios}\n`);
}
