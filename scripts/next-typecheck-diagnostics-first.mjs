#!/usr/bin/env node
/**
 * next build 타입 검사 증분 캐시 복구 (검사는 그대로 · 순서만)
 *
 * 원인(2026-11-11 실측): Next 16.1.7 `dist/lib/typescript/runTypeCheck.js` 는
 *   program.emit()  →  getPreEmitDiagnostics(program)
 * 순서다. emit 이 .next/cache/.tsbuildinfo 를 먼저 써서, 그 뒤에 계산한 파일별 의미 진단이
 * 캐시에 남지 않는다. Vercel 이 .next/cache 를 복원해도 매 빌드가 전체 검사(157~258초)를 한다.
 * 수정: 진단을 먼저 계산하고 emit(캐시 기록)을 나중에 한다. 진단 대상·필터·오류 판정은 동일.
 *
 * 무결성 규칙 (Owner 2026-11-11 PR #142 보완 지시):
 *  - 파일 전체 SHA256 이 「검증된 원본」 또는 「검증된 패치본」 일 때만 허용. 그 외(변조·다른 버전)는 FAIL.
 *  - 원본이면: 메모리에서 2줄 교체 → 결과 SHA256 이 검증된 패치본과 같을 때만 →
 *    같은 폴더 임시 파일에 쓰고 fsync → 임시 파일을 다시 읽어 해시 확인 → rename(원자적 교체) → 최종 해시 재확인.
 *  - 실패 시 임시 파일 삭제. 원본은 rename 전까지 그대로라 중간 종료에도 손상 파일이 남지 않는다.
 *  - 어떤 FAIL 이든 exit 1 → `npm run build` 의 prebuild 가 실패해 next build 가 실행되지 않는다.
 *
 * Next 업그레이드 시: 이 스크립트가 빌드를 실패시킨다(의도). 복구 절차 = docs/audit/deploy-system-final-audit-2026-11-11.md §11.
 */
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, rmSync, writeSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const EXPECTED_NEXT_VERSION = "16.1.7";
/** next@16.1.7 dist/lib/typescript/runTypeCheck.js — npm 설치 원본 (CI npm ci 환경에서 vitest 로 재확인) */
export const ORIGINAL_SHA256 = "1b6139b9de588a20899ae1b00243ab94c04d335439e9225a32984262d102eb25";
/** 위 원본에 아래 2줄 교체만 적용한 결과 */
export const PATCHED_SHA256 = "2e91c0111a489c258878182663c7b63c141fada55301b0194d95615f4d4e0341";

const MARKER = "/* dibay: diagnostics-before-emit */";
const FROM_EMIT = "    const result = program.emit();\n";
const TO_EMIT = `    ${MARKER} const dibayPreEmitDiagnostics = typescript.getPreEmitDiagnostics(program);\n    const result = program.emit();\n`;
const FROM_DIAG = "const allDiagnostics = typescript.getPreEmitDiagnostics(program).concat(result.diagnostics)";
const TO_DIAG = "const allDiagnostics = dibayPreEmitDiagnostics.concat(result.diagnostics)";

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/** 원본 문자열 → 패치본 문자열. 교체 대상이 정확히 1개씩이 아니면 null. */
export function transform(source) {
  const count = (s, sub) => s.split(sub).length - 1;
  if (count(source, FROM_EMIT) !== 1 || count(source, FROM_DIAG) !== 1) return null;
  return source.replace(FROM_EMIT, TO_EMIT).replace(FROM_DIAG, TO_DIAG);
}

class PatchError extends Error {}
const fail = (message) => {
  throw new PatchError(message);
};

/** @returns {"applied" | "already"} */
export function applyPatch(projectDir) {
  const require = createRequire(path.join(projectDir, "package.json"));
  const nextPkgPath = require.resolve("next/package.json");
  const nextVersion = JSON.parse(readFileSync(nextPkgPath, "utf8")).version;
  if (nextVersion !== EXPECTED_NEXT_VERSION) {
    fail(`next ${nextVersion} — 이 수정은 ${EXPECTED_NEXT_VERSION} 검증 원본 기준. 복구 절차: 감사 문서 §11.`);
  }

  const target = path.join(path.dirname(nextPkgPath), "dist/lib/typescript/runTypeCheck.js");
  const current = readFileSync(target);
  const currentHash = sha256(current);
  if (currentHash === PATCHED_SHA256) return "already";
  if (currentHash !== ORIGINAL_SHA256) {
    fail(`runTypeCheck.js 해시 ${currentHash} — 검증된 원본·패치본 어느 것과도 다름(변조 또는 다른 빌드). 수정하지 않음.`);
  }

  const patched = transform(current.toString("utf8"));
  if (patched === null) fail("검증된 원본인데 교체 대상 줄을 찾지 못함(스크립트 상수 불일치)");
  const patchedBuf = Buffer.from(patched, "utf8");
  if (sha256(patchedBuf) !== PATCHED_SHA256) fail("교체 결과가 검증된 패치본 해시와 다름. 수정하지 않음.");

  const tmp = `${target}.dibay-tmp-${process.pid}`;
  try {
    const fd = openSync(tmp, "wx");
    try {
      writeSync(fd, patchedBuf);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    if (sha256(readFileSync(tmp)) !== PATCHED_SHA256) fail("임시 파일 해시 불일치. 교체하지 않음.");
    renameSync(tmp, target);
  } finally {
    rmSync(tmp, { force: true });
  }
  if (sha256(readFileSync(target)) !== PATCHED_SHA256) fail("교체 후 해시 불일치");
  return "applied";
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const result = applyPatch(process.cwd());
    console.log(`[next-typecheck-diagnostics-first] ${result === "applied" ? "적용(해시 검증)" : "이미 적용됨(해시 검증)"}`);
  } catch (error) {
    console.error(`[next-typecheck-diagnostics-first] FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
