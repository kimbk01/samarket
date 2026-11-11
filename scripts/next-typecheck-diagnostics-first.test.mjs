/**
 * scripts/next-typecheck-diagnostics-first.mjs 무결성 시험 (Owner 2026-11-11 PR #142 보완 지시 4·5번)
 * 정상 원본 · 정상 패치본 · 변조 원본 · 변조 패치본 · 다른 버전 · 교체 중 실패 · prebuild 중단.
 * 원본은 이 저장소에 설치된 next 에서 가져온다 (CI = npm ci 직후 → 원본 해시 자체도 여기서 확인됨).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  EXPECTED_NEXT_VERSION,
  ORIGINAL_SHA256,
  PATCHED_SHA256,
  applyPatch,
  sha256,
  transform,
} from "./next-typecheck-diagnostics-first.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repoRoot, "scripts/next-typecheck-diagnostics-first.mjs");
const installed = readFileSync(
  path.join(path.dirname(createRequire(path.join(repoRoot, "package.json")).resolve("next/package.json")), "dist/lib/typescript/runTypeCheck.js"),
  "utf8",
);

/** 설치본이 이미 prebuild 로 패치돼 있으면(로컬 빌드 후) 역변환으로 원본을 복원한다. */
function originalSource() {
  if (sha256(installed) === ORIGINAL_SHA256) return installed;
  const restored = installed
    .replace(/ {4}\/\* dibay: diagnostics-before-emit \*\/ const dibayPreEmitDiagnostics = typescript\.getPreEmitDiagnostics\(program\);\n/, "")
    .replace("const allDiagnostics = dibayPreEmitDiagnostics.concat(", "const allDiagnostics = typescript.getPreEmitDiagnostics(program).concat(");
  return restored;
}

const dirs = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

function fixture(source, version = EXPECTED_NEXT_VERSION) {
  const dir = mkdtempSync(path.join(tmpdir(), "dibay-next-patch-"));
  dirs.push(dir);
  const tsDir = path.join(dir, "node_modules/next/dist/lib/typescript");
  mkdirSync(tsDir, { recursive: true });
  writeFileSync(path.join(dir, "node_modules/next/package.json"), JSON.stringify({ name: "next", version }));
  writeFileSync(path.join(tsDir, "runTypeCheck.js"), source);
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "fx", private: true, scripts: { prebuild: `node ${JSON.stringify(script)}`, build: "node -e \"console.log('BUILD_RAN')\"" } }),
  );
  const file = path.join(tsDir, "runTypeCheck.js");
  return { dir, file, tsDir, read: () => readFileSync(file) };
}

const leftovers = (tsDir) => readdirSync(tsDir).filter((n) => n.includes("dibay-tmp"));

describe("next-typecheck-diagnostics-first", () => {
  it("설치된 next 의 runTypeCheck.js 가 검증된 원본 또는 검증된 패치본이다", () => {
    expect([ORIGINAL_SHA256, PATCHED_SHA256]).toContain(sha256(installed));
    expect(sha256(originalSource())).toBe(ORIGINAL_SHA256);
    expect(sha256(transform(originalSource()))).toBe(PATCHED_SHA256);
  });

  it("정상 원본 → 적용, 결과 = 검증된 패치본, 임시 파일 없음", () => {
    const fx = fixture(originalSource());
    expect(applyPatch(fx.dir)).toBe("applied");
    expect(sha256(fx.read())).toBe(PATCHED_SHA256);
    expect(leftovers(fx.tsDir)).toEqual([]);
  });

  it("정상 패치본 → 이미 적용됨, 파일 무변경", () => {
    const fx = fixture(transform(originalSource()));
    const before = fx.read();
    expect(applyPatch(fx.dir)).toBe("already");
    expect(fx.read().equals(before)).toBe(true);
  });

  it("변조된 원본 → FAIL, 파일 무변경", () => {
    const tampered = originalSource().replace("const firstError =", "const firstError  =");
    const fx = fixture(tampered);
    expect(() => applyPatch(fx.dir)).toThrow(/검증된 원본·패치본 어느 것과도 다름/);
    expect(fx.read().toString("utf8")).toBe(tampered);
  });

  it("변조된 패치본(표식·진단 줄은 그대로) → FAIL, 파일 무변경", () => {
    const tampered = transform(originalSource()).replace(
      "if (firstError) {\n        throw",
      "if (false && firstError) {\n        throw",
    );
    expect(tampered).toContain("/* dibay: diagnostics-before-emit */");
    expect(tampered).toContain("dibayPreEmitDiagnostics.concat(");
    const fx = fixture(tampered);
    expect(() => applyPatch(fx.dir)).toThrow(/검증된 원본·패치본 어느 것과도 다름/);
    expect(fx.read().toString("utf8")).toBe(tampered);
  });

  it("다른 next 버전 → FAIL, 파일 무변경", () => {
    const fx = fixture(originalSource(), "16.2.0");
    expect(() => applyPatch(fx.dir)).toThrow(/next 16\.2\.0/);
    expect(sha256(fx.read())).toBe(ORIGINAL_SHA256);
  });

  it("교체(rename) 중 실패 → exit 1, 원본 그대로, 임시 파일 없음", () => {
    const fx = fixture(originalSource());
    const preload = path.join(fx.dir, "fail-rename.cjs");
    writeFileSync(
      preload,
      "const fs=require('fs');fs.renameSync=()=>{throw new Error('simulated crash')};require('module').syncBuiltinESMExports();",
    );
    const r = spawnSync(process.execPath, ["--require", preload, script], { cwd: fx.dir, encoding: "utf8" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/FAIL: simulated crash/);
    expect(sha256(fx.read())).toBe(ORIGINAL_SHA256);
    expect(leftovers(fx.tsDir)).toEqual([]);
  });

  it("npm run build: 변조 파일이면 prebuild 실패로 build 가 실행되지 않고, 정상 원본이면 실행된다", () => {
    const bad = fixture(transform(originalSource()).replace("const ignoreRegex", "const ignoreRegex2"));
    const r1 = spawnSync("npm", ["run", "build"], { cwd: bad.dir, encoding: "utf8" });
    expect(r1.status).not.toBe(0);
    expect(r1.stdout + r1.stderr).not.toContain("BUILD_RAN");

    const good = fixture(originalSource());
    const r2 = spawnSync("npm", ["run", "build"], { cwd: good.dir, encoding: "utf8" });
    expect(r2.status).toBe(0);
    expect(r2.stdout).toContain("적용(해시 검증)");
    expect(r2.stdout).toContain("BUILD_RAN");
    expect(sha256(good.read())).toBe(PATCHED_SHA256);
  });

  it("고정 상수가 실제 package.json 의 next 버전과 같다", () => {
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
    expect(pkg.dependencies?.next ?? pkg.devDependencies?.next).toBe(EXPECTED_NEXT_VERSION);
    expect(pkg.scripts.prebuild).toContain("node scripts/next-typecheck-diagnostics-first.mjs");
  });
});

